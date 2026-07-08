use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

use crate::report::{
    clamp_score, label_risk, CostDriver, FileSignal, LanguageStat, PrivacySignals, RepoScanReport,
    Scores, Totals, VerificationSignals,
};

const SOURCE_EXTENSIONS: &[&str] = &[
    "astro", "c", "cpp", "cs", "css", "go", "graphql", "h", "html", "java", "js", "json", "jsx",
    "kt", "md", "php", "prisma", "py", "rb", "rs", "scss", "sh", "sql", "svelte", "toml", "ts",
    "tsx", "vue", "xml", "yaml", "yml", "env",
];

const IGNORED_DIRS: &[&str] = &[
    ".git",
    ".next",
    ".cache",
    ".turbo",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
];

const AMBIGUITY_PATTERNS: &[&str] = &[
    "eval(",
    "new Function(",
    "innerHTML",
    "insertAdjacentHTML",
    "document.write",
    "JSON.parse(",
    "localStorage",
    "sessionStorage",
    "process.env.",
    "import(",
];

#[derive(Debug, Clone)]
struct RawFile {
    path: String,
    language: String,
    extension: String,
    text: String,
    line_count: usize,
    size_bytes: u64,
    estimated_tokens: usize,
}

#[derive(Default)]
struct ScanState {
    raw_files: Vec<RawFile>,
    total_files: usize,
    ignored_files: usize,
    ignored_paths: Vec<String>,
    has_ci_config: bool,
}

#[derive(Default)]
struct ScoringFacts {
    ambiguity_hits: usize,
    shared_file_count: usize,
    privacy_score: f32,
}

/// Orchestrates the full local scan and assembles the report returned to the desktop UI.
pub fn scan_repo(root: PathBuf) -> io::Result<RepoScanReport> {
    if !root.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "path is not a directory",
        ));
    }

    let root = fs::canonicalize(root)?;
    let mut state = ScanState::default();
    walk_repo(&root, &root, &mut state)?;

    let verification = detect_verification(&state.raw_files, state.has_ci_config);
    let privacy = detect_privacy(&state.raw_files);
    let languages = language_stats(&state.raw_files);
    let expensive_files = expensive_files(&state.raw_files);
    let totals = totals(&state);
    let facts = scoring_facts(&state.raw_files, &privacy);
    let scores = score_report(&totals, &verification, &facts);
    let top_cost_drivers = cost_drivers(&totals, &verification, &privacy, &facts, &expensive_files);

    Ok(RepoScanReport {
        repo_name: root
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "Selected repo".to_string()),
        repo_path: root.display().to_string(),
        scanned_at: now_epoch_string(),
        scores,
        totals,
        verification,
        privacy,
        languages,
        expensive_files,
        top_cost_drivers,
        ignored_paths: state.ignored_paths,
    })
}

/// Recursively walks the selected repo, collecting readable source files and counting ignored noise.
fn walk_repo(root: &Path, current: &Path, state: &mut ScanState) -> io::Result<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        let relative = relative_path(root, &path);

        if is_ci_config(&relative) {
            state.has_ci_config = true;
        }

        if file_type.is_symlink() {
            continue;
        }

        if should_ignore(&relative) {
            remember_ignored_path(state, &relative);
            let count = if file_type.is_dir() {
                count_files_capped(&path, 50_000)
            } else {
                1
            };
            state.total_files += count;
            state.ignored_files += count;
            continue;
        }

        if file_type.is_dir() {
            walk_repo(root, &path, state)?;
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        state.total_files += 1;
        let extension = normalized_extension(&path, &relative);
        if !SOURCE_EXTENSIONS.contains(&extension.as_str()) {
            continue;
        }

        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        if is_binary(&bytes) {
            continue;
        }
        if bytes.len() > 2_000_000 {
            remember_ignored_path(state, &relative);
            state.ignored_files += 1;
            continue;
        }

        let text = String::from_utf8_lossy(&bytes).to_string();
        let line_count = if text.is_empty() {
            0
        } else {
            text.lines().count()
        };
        let estimated_tokens = estimate_tokens(&text);
        state.raw_files.push(RawFile {
            path: relative,
            language: language_for(&extension).to_string(),
            extension,
            text,
            line_count,
            size_bytes: bytes.len() as u64,
            estimated_tokens,
        });
    }

    Ok(())
}

/// Extracts deterministic verification signals such as package scripts and CI configuration.
fn detect_verification(raw_files: &[RawFile], has_ci_config: bool) -> VerificationSignals {
    let mut signals = VerificationSignals {
        has_ci_config,
        ..VerificationSignals::default()
    };

    for file in raw_files
        .iter()
        .filter(|file| file.path.ends_with("package.json"))
    {
        let Ok(value) = serde_json::from_str::<Value>(&file.text) else {
            continue;
        };
        let Some(scripts) = value.get("scripts").and_then(Value::as_object) else {
            continue;
        };

        for (name, command) in scripts {
            let Some(command) = command.as_str() else {
                continue;
            };
            let rendered = format!("{name}: {command}");
            let key = name.to_lowercase();
            let command_lower = command.to_lowercase();

            if key.contains("build") {
                signals.build_scripts.push(rendered.clone());
            }
            if key.contains("test")
                || command_lower.contains("vitest")
                || command_lower.contains("jest")
            {
                signals.test_scripts.push(rendered.clone());
            }
            if key.contains("typecheck")
                || key.contains("type-check")
                || command_lower.contains("tsc")
            {
                signals.typecheck_scripts.push(rendered.clone());
            }
            if key.contains("lint") || command_lower.contains("eslint") {
                signals.lint_scripts.push(rendered);
            }
        }
    }

    signals.has_build_script = !signals.build_scripts.is_empty();
    signals.has_test_script = !signals.test_scripts.is_empty();
    signals.has_typecheck_script = !signals.typecheck_scripts.is_empty();
    signals.has_lint_script = !signals.lint_scripts.is_empty();
    signals
}

/// Looks for local-only privacy signals like .env files, secret-like assignments, and private URLs.
fn detect_privacy(raw_files: &[RawFile]) -> PrivacySignals {
    let mut privacy = PrivacySignals::default();

    for file in raw_files {
        if is_env_file(&file.path) {
            privacy.env_files.push(file.path.clone());
        }

        let secret_count = count_secret_candidates(&file.text);
        if secret_count > 0 {
            privacy.secret_candidate_count += secret_count;
            if privacy.secret_candidate_files.len() < 12 {
                privacy.secret_candidate_files.push(file.path.clone());
            }
        }

        privacy.private_url_count += count_private_urls(&file.text);
    }

    if !privacy.env_files.is_empty() {
        privacy.findings.push(format!(
            "{} .env-style files detected",
            privacy.env_files.len()
        ));
    }
    if privacy.secret_candidate_count > 0 {
        privacy.findings.push(format!(
            "{} secret-like assignments detected",
            privacy.secret_candidate_count
        ));
    }
    if privacy.private_url_count > 0 {
        privacy.findings.push(format!(
            "{} private/internal URL signals detected",
            privacy.private_url_count
        ));
    }

    privacy
}

/// Groups scanned source files by language so the report can show the dominant stacks.
fn language_stats(raw_files: &[RawFile]) -> Vec<LanguageStat> {
    let mut stats: BTreeMap<String, LanguageStat> = BTreeMap::new();
    for file in raw_files {
        let entry = stats.entry(file.extension.clone()).or_insert(LanguageStat {
            language: file.language.clone(),
            extension: file.extension.clone(),
            files: 0,
            estimated_tokens: 0,
        });
        entry.files += 1;
        entry.estimated_tokens += file.estimated_tokens;
    }

    let mut values: Vec<LanguageStat> = stats.into_values().collect();
    values.sort_by(|a, b| b.estimated_tokens.cmp(&a.estimated_tokens));
    values
}

/// Selects the files most likely to cost AI agents extra context or careful review.
fn expensive_files(raw_files: &[RawFile]) -> Vec<FileSignal> {
    let mut files: Vec<FileSignal> = raw_files
        .iter()
        .filter(|file| {
            file.estimated_tokens >= 4_000 || file.line_count >= 350 || is_shared_file(&file.path)
        })
        .map(file_signal)
        .collect();
    files.sort_by(|a, b| b.estimated_tokens.cmp(&a.estimated_tokens));
    files.truncate(12);
    files
}

/// Converts one scanned file into a compact report row with size and risk signals.
fn file_signal(file: &RawFile) -> FileSignal {
    let mut signals = Vec::new();
    if file.estimated_tokens >= 8_000 {
        signals.push("over-8k-tokens".to_string());
    }
    if file.estimated_tokens >= 32_000 {
        signals.push("over-32k-tokens".to_string());
    }
    if file.line_count >= 350 {
        signals.push("large-file".to_string());
    }
    if is_shared_file(&file.path) {
        signals.push("shared-looking-file".to_string());
    }
    if ambiguity_count(&file.text) > 0 {
        signals.push("ambiguous-runtime-patterns".to_string());
    }

    FileSignal {
        path: file.path.clone(),
        language: file.language.clone(),
        estimated_tokens: file.estimated_tokens,
        line_count: file.line_count,
        size_bytes: file.size_bytes,
        signals,
    }
}

/// Summarizes repo-wide file and token totals used by score cards and export JSON.
fn totals(state: &ScanState) -> Totals {
    let files_over_8k_tokens = state
        .raw_files
        .iter()
        .filter(|file| file.estimated_tokens >= 8_000)
        .count();
    let files_over_32k_tokens = state
        .raw_files
        .iter()
        .filter(|file| file.estimated_tokens >= 32_000)
        .count();

    Totals {
        total_files: state.total_files,
        source_files: state.raw_files.len(),
        ignored_files: state.ignored_files,
        estimated_source_tokens: state
            .raw_files
            .iter()
            .map(|file| file.estimated_tokens)
            .sum(),
        files_over_8k_tokens,
        files_over_32k_tokens,
    }
}

/// Precomputes reusable counts that feed multiple deterministic scoring dimensions.
fn scoring_facts(raw_files: &[RawFile], privacy: &PrivacySignals) -> ScoringFacts {
    let ambiguity_hits = raw_files
        .iter()
        .map(|file| ambiguity_count(&file.text))
        .sum();
    let shared_file_count = raw_files
        .iter()
        .filter(|file| is_shared_file(&file.path))
        .count();
    let privacy_score = (privacy.env_files.len() as f32 * 1.4)
        + (privacy.secret_candidate_count as f32 * 0.8)
        + (privacy.private_url_count as f32 * 0.3);

    ScoringFacts {
        ambiguity_hits,
        shared_file_count,
        privacy_score: privacy_score.min(10.0),
    }
}

/// Applies the V1 weighted scoring model for expense, readiness, retry risk, and compression.
fn score_report(
    totals: &Totals,
    verification: &VerificationSignals,
    facts: &ScoringFacts,
) -> Scores {
    let context_burden = clamp_score(
        totals.estimated_source_tokens as f32 / 24_000.0
            + totals.files_over_8k_tokens as f32 * 0.8
            + totals.files_over_32k_tokens as f32 * 1.8
            + totals.source_files as f32 / 800.0,
    );

    let verification_debt = clamp_score(
        if verification.has_build_script {
            0.0
        } else {
            1.6
        } + if verification.has_test_script {
            0.0
        } else {
            2.4
        } + if verification.has_typecheck_script {
            0.0
        } else {
            2.0
        } + if verification.has_lint_script {
            0.0
        } else {
            1.0
        } + if verification.has_ci_config { 0.0 } else { 1.3 },
    );

    let ambiguity_risk = clamp_score(facts.ambiguity_hits as f32 / 8.0);
    let blast_radius = clamp_score(
        facts.shared_file_count as f32 * 0.45
            + totals.files_over_8k_tokens as f32 * 0.8
            + totals.files_over_32k_tokens as f32 * 1.5,
    );
    let privacy_numeric = clamp_score(facts.privacy_score);
    let ai_expense_score = clamp_score(
        context_burden * 0.35
            + verification_debt * 0.25
            + ambiguity_risk * 0.15
            + blast_radius * 0.15
            + privacy_numeric * 0.10,
    );
    let ai_readiness_score = (100.0 - ai_expense_score * 10.0).round().clamp(0.0, 100.0) as u8;
    let retry_risk = if verification_debt >= 6.5 || ai_expense_score >= 7.0 {
        "High"
    } else if verification_debt >= 3.5 || ai_expense_score >= 4.5 {
        "Medium"
    } else {
        "Low"
    };

    Scores {
        ai_expense_score,
        ai_readiness_score,
        context_burden,
        verification_debt,
        ambiguity_risk,
        blast_radius,
        privacy_risk: label_risk(privacy_numeric),
        retry_risk: retry_risk.to_string(),
        compression_opportunity_percent: compression_opportunity(totals.estimated_source_tokens),
    }
}

/// Turns raw scan facts into the five short explanations shown in the main report body.
fn cost_drivers(
    totals: &Totals,
    verification: &VerificationSignals,
    privacy: &PrivacySignals,
    facts: &ScoringFacts,
    expensive_files: &[FileSignal],
) -> Vec<CostDriver> {
    let mut drivers = Vec::new();

    if totals.estimated_source_tokens >= 30_000 || totals.files_over_8k_tokens > 0 {
        drivers.push(CostDriver {
            title: "Source context is heavy".to_string(),
            severity: severity_for_tokens(totals.estimated_source_tokens).to_string(),
            explanation: format!(
                "{} estimated source tokens with {} files over 8k tokens.",
                totals.estimated_source_tokens, totals.files_over_8k_tokens
            ),
            affected_count: Some(totals.source_files),
        });
    }

    let missing_verifiers = [
        (!verification.has_build_script, "build"),
        (!verification.has_test_script, "test"),
        (!verification.has_typecheck_script, "typecheck"),
        (!verification.has_lint_script, "lint"),
        (!verification.has_ci_config, "CI"),
    ]
    .into_iter()
    .filter_map(|(missing, label)| missing.then_some(label))
    .collect::<Vec<_>>();

    if !missing_verifiers.is_empty() {
        drivers.push(CostDriver {
            title: "Verification path is incomplete".to_string(),
            severity: if missing_verifiers.len() >= 3 {
                "high"
            } else {
                "medium"
            }
            .to_string(),
            explanation: format!(
                "Missing deterministic signals: {}.",
                missing_verifiers.join(", ")
            ),
            affected_count: Some(missing_verifiers.len()),
        });
    }

    if facts.ambiguity_hits > 0 {
        drivers.push(CostDriver {
            title: "Runtime ambiguity patterns found".to_string(),
            severity: if facts.ambiguity_hits >= 25 { "high" } else { "medium" }.to_string(),
            explanation: "Dynamic HTML, storage, env, eval, or dynamic import patterns increase interpretation risk.".to_string(),
            affected_count: Some(facts.ambiguity_hits),
        });
    }

    if facts.shared_file_count > 0 || !expensive_files.is_empty() {
        drivers.push(CostDriver {
            title: "Changes may have wide blast radius".to_string(),
            severity: if facts.shared_file_count >= 8 || totals.files_over_32k_tokens > 0 { "high" } else { "medium" }.to_string(),
            explanation: "Shared-looking or very large files are harder for AI agents to change in isolation.".to_string(),
            affected_count: Some(facts.shared_file_count.max(expensive_files.len())),
        });
    }

    if !privacy.findings.is_empty() {
        drivers.push(CostDriver {
            title: "Privacy-sensitive signals detected".to_string(),
            severity: if privacy.secret_candidate_count > 0 {
                "high"
            } else {
                "medium"
            }
            .to_string(),
            explanation: privacy.findings.join("; "),
            affected_count: Some(
                privacy.secret_candidate_count
                    + privacy.env_files.len()
                    + privacy.private_url_count,
            ),
        });
    }

    if drivers.is_empty() {
        drivers.push(CostDriver {
            title: "Low-cost baseline".to_string(),
            severity: "low".to_string(),
            explanation: "The first local scan did not find large context, missing verification, or privacy-heavy signals.".to_string(),
            affected_count: Some(totals.source_files),
        });
    }

    drivers.truncate(5);
    drivers
}

/// Stores a small evidence sample of ignored paths without making huge repos noisy.
fn remember_ignored_path(state: &mut ScanState, relative: &str) {
    if state.ignored_paths.len() < 50 {
        state.ignored_paths.push(relative.to_string());
    }
}

/// Checks whether a path is generated, vendored, or otherwise noisy for source-context analysis.
fn should_ignore(relative: &str) -> bool {
    relative.split('/').any(|part| IGNORED_DIRS.contains(&part))
        || relative.ends_with(".map")
        || relative.ends_with(".min.js")
        || relative.ends_with(".min.css")
}

/// Counts ignored files without fully trusting huge dependency/build folders to be cheap to traverse.
fn count_files_capped(path: &Path, cap: usize) -> usize {
    let Ok(entries) = fs::read_dir(path) else {
        return 1;
    };
    let mut count = 0;

    for entry in entries.flatten() {
        if count >= cap {
            return cap;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            count += count_files_capped(&entry.path(), cap.saturating_sub(count));
        } else if file_type.is_file() {
            count += 1;
        }
    }

    count.max(1)
}

/// Produces the extension key used for source filtering, with special handling for .env files.
fn normalized_extension(path: &Path, relative: &str) -> String {
    if is_env_file(relative) {
        return "env".to_string();
    }

    path.extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_else(|| {
            path.file_name()
                .map(|value| value.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        })
}

/// Maps a normalized extension to the language label displayed in the report.
fn language_for(extension: &str) -> &'static str {
    match extension {
        "astro" => "Astro",
        "c" | "h" => "C",
        "cpp" => "C++",
        "cs" => "C#",
        "css" => "CSS",
        "env" => "Environment",
        "go" => "Go",
        "graphql" => "GraphQL",
        "html" => "HTML",
        "java" => "Java",
        "js" => "JavaScript",
        "json" => "JSON",
        "jsx" => "React JSX",
        "kt" => "Kotlin",
        "md" => "Markdown",
        "php" => "PHP",
        "prisma" => "Prisma",
        "py" => "Python",
        "rb" => "Ruby",
        "rs" => "Rust",
        "scss" => "SCSS",
        "sh" => "Shell",
        "sql" => "SQL",
        "svelte" => "Svelte",
        "toml" => "TOML",
        "ts" => "TypeScript",
        "tsx" => "React TSX",
        "vue" => "Vue",
        "xml" => "XML",
        "yaml" | "yml" => "YAML",
        _ => "Other",
    }
}

/// Uses a cheap null-byte check to avoid treating binary assets as source text.
fn is_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8_000).any(|byte| *byte == 0)
}

/// Recognizes common CI config paths that improve verification readiness.
fn is_ci_config(relative: &str) -> bool {
    relative.starts_with(".github/workflows/")
        || relative == ".gitlab-ci.yml"
        || relative == ".circleci/config.yml"
}

/// Detects .env-style filenames so they can be counted as privacy-sensitive local files.
fn is_env_file(relative: &str) -> bool {
    Path::new(relative)
        .file_name()
        .map(|value| {
            let name = value.to_string_lossy();
            name == ".env" || name.starts_with(".env.") || name.ends_with(".env")
        })
        .unwrap_or(false)
}

/// Converts absolute filesystem paths into stable repo-relative paths for reports.
fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Estimates source context size with the simple V1 heuristic of roughly four chars per token.
fn estimate_tokens(text: &str) -> usize {
    (text.len() / 4).max(1)
}

/// Counts dynamic/runtime patterns that can make AI code changes harder to reason about.
fn ambiguity_count(text: &str) -> usize {
    AMBIGUITY_PATTERNS
        .iter()
        .map(|pattern| text.matches(pattern).count())
        .sum()
}

/// Flags central-looking files whose changes may affect a wider part of the app.
fn is_shared_file(path: &str) -> bool {
    path.contains("src/core/")
        || path.contains("src/lib/")
        || path.contains("src/shared/")
        || path.contains("/shared/")
        || path.ends_with("src/App.tsx")
        || path.ends_with("src/main.tsx")
        || path.ends_with("index.ts")
        || path.ends_with("index.tsx")
}

/// Counts cautious secret-like assignments without copying secret values into the report.
fn count_secret_candidates(text: &str) -> usize {
    text.lines()
        .filter(|line| {
            let lowered = line.trim().to_lowercase();
            if lowered.starts_with("//") || lowered.starts_with('#') || lowered.len() < 12 {
                return false;
            }
            let has_assignment = lowered.contains('=') || lowered.contains(':');
            let has_secret_word = lowered.contains("api_key")
                || lowered.contains("apikey")
                || lowered.contains("secret")
                || lowered.contains("access_token")
                || lowered.contains("auth_token")
                || lowered.contains("private_key")
                || lowered.contains("password");
            has_assignment && has_secret_word
                || line.contains("BEGIN PRIVATE KEY")
                || line.contains("BEGIN OPENSSH KEY")
                || line.contains("BEGIN RSA PRIVATE KEY")
        })
        .count()
}

/// Counts localhost, private IP, and internal-domain signals that should stay local-first.
fn count_private_urls(text: &str) -> usize {
    [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        ".internal",
        "intranet",
        "http://10.",
        "https://10.",
        "http://192.168.",
        "https://192.168.",
        "http://172.16.",
        "https://172.16.",
    ]
    .iter()
    .map(|needle| text.matches(needle).count())
    .sum()
}

/// Estimates how much a large repo might benefit from summarization before AI work begins.
fn compression_opportunity(tokens: usize) -> u8 {
    if tokens >= 200_000 {
        72
    } else if tokens >= 80_000 {
        54
    } else if tokens >= 30_000 {
        34
    } else if tokens >= 10_000 {
        18
    } else {
        8
    }
}

/// Chooses the cost-driver severity label for the raw source token footprint.
fn severity_for_tokens(tokens: usize) -> &'static str {
    if tokens >= 180_000 {
        "high"
    } else if tokens >= 30_000 {
        "medium"
    } else {
        "low"
    }
}

/// Captures scan time as epoch seconds so TypeScript can format it in the user's locale.
fn now_epoch_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}
