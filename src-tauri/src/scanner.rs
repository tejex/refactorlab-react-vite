use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::report::{
    readiness_dimension, score_dimension, CostDriver, DetectedScripts, FileFinding,
    GeneratedVendorNoise, LanguageStat, RepoScanReport, RepoTotals, TokenHeavyDirectory,
};

const ANALYZED_EXTENSIONS: &[&str] = &[
    "astro", "css", "go", "html", "java", "js", "json", "jsx", "md", "py", "rs", "scss", "svelte",
    "toml", "ts", "tsx", "vue", "yaml", "yml",
];

const IGNORED_PARTS: &[&str] = &[
    ".git",
    ".next",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "target",
    "vendor",
];

struct RawFile {
    path: String,
    text: String,
    size_bytes: u64,
    line_count: u32,
    extension: String,
}

pub fn scan_repo(root: PathBuf) -> io::Result<RepoScanReport> {
    if !root.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "path is not a directory",
        ));
    }

    let mut raw_files = Vec::new();
    let mut ignored = Vec::new();
    let mut total_seen = 0_u32;
    walk_repo(&root, &root, &mut raw_files, &mut ignored, &mut total_seen)?;

    let mut files: Vec<FileFinding> = raw_files.iter().map(file_finding).collect();
    files.sort_by(|a, b| b.token_estimate.cmp(&a.token_estimate));
    let languages = language_stats(&files);
    let scripts = detect_scripts(&raw_files);
    let privacy_findings = privacy_findings(&raw_files);
    let large_files: Vec<FileFinding> = files
        .iter()
        .filter(|file| file.flags.iter().any(|flag| flag == "large-file"))
        .take(12)
        .cloned()
        .collect();
    let token_heavy_directories = token_heavy_directories(&files);
    let totals = RepoTotals {
        files: total_seen,
        analyzed_files: files.len() as u32,
        ignored_files: total_seen.saturating_sub(files.len() as u32),
        lines: files.iter().map(|file| file.line_count).sum(),
        bytes: files.iter().map(|file| file.size_bytes).sum(),
        token_estimate: files.iter().map(|file| file.token_estimate).sum(),
    };
    let scores = scores(
        &totals,
        &files,
        &languages,
        &scripts,
        &privacy_findings,
        &large_files,
        &ignored,
    );
    let top_cost_drivers = cost_drivers(
        &totals,
        &files,
        &scripts,
        &privacy_findings,
        &large_files,
        &ignored,
        &token_heavy_directories,
    );

    Ok(RepoScanReport {
        source_path: root.display().to_string(),
        source_type: "local-folder".to_string(),
        scanned_at: now_epoch_string(),
        ai_expense_score: scores.ai_expense_score,
        ai_readiness_score: scores.ai_readiness_score,
        context_burden: scores.context_burden,
        verification_debt: scores.verification_debt,
        ambiguity_risk: scores.ambiguity_risk,
        blast_radius: scores.blast_radius,
        privacy_risk: scores.privacy_risk,
        top_cost_drivers,
        files,
        languages,
        totals,
        large_files,
        token_heavy_directories,
        generated_vendor_noise: ignored.into_iter().take(20).collect(),
        scripts,
        privacy_findings,
        notes: vec![
            "Scores are deterministic local heuristics, not model output.".to_string(),
            "Fixer does not modify source files.".to_string(),
        ],
    })
}

struct ScoreSet {
    ai_expense_score: crate::report::ScoreDimension,
    ai_readiness_score: crate::report::ScoreDimension,
    context_burden: crate::report::ScoreDimension,
    verification_debt: crate::report::ScoreDimension,
    ambiguity_risk: crate::report::ScoreDimension,
    blast_radius: crate::report::ScoreDimension,
    privacy_risk: crate::report::ScoreDimension,
}

fn walk_repo(
    root: &Path,
    current: &Path,
    raw_files: &mut Vec<RawFile>,
    ignored: &mut Vec<GeneratedVendorNoise>,
    total_seen: &mut u32,
) -> io::Result<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;
        let relative = relative_path(root, &path);

        if is_ignored(&relative) {
            ignored.push(GeneratedVendorNoise {
                path: relative,
                reason: ignored_reason(&path),
            });
            continue;
        }

        if metadata.is_dir() {
            walk_repo(root, &path, raw_files, ignored, total_seen)?;
            continue;
        }

        if !metadata.is_file() {
            continue;
        }

        *total_seen += 1;
        let extension = extension_for(&path);
        if !ANALYZED_EXTENSIONS.contains(&extension.as_str()) {
            continue;
        }
        if metadata.len() > 1_000_000 {
            ignored.push(GeneratedVendorNoise {
                path: relative,
                reason: "large file skipped".to_string(),
            });
            continue;
        }

        let text = fs::read_to_string(&path).unwrap_or_default();
        let line_count = if text.is_empty() {
            0
        } else {
            text.lines().count() as u32
        };
        raw_files.push(RawFile {
            path: relative,
            text,
            size_bytes: metadata.len(),
            line_count,
            extension,
        });
    }
    Ok(())
}

fn file_finding(raw: &RawFile) -> FileFinding {
    let mut flags = Vec::new();
    let mut reasons = Vec::new();
    let token_estimate = estimate_tokens(&raw.text);
    let selector_count = count_any(
        &raw.text,
        &[
            "document.querySelector",
            "document.getElementById",
            "document.querySelectorAll",
        ],
    );
    let import_export_count = count_any(&raw.text, &["import ", "export "]);
    let function_count = count_any(&raw.text, &["function ", "=>"]);

    if raw.line_count >= large_line_threshold(&raw.extension) {
        flags.push("large-file".to_string());
        reasons.push(format!(
            "{} lines makes this expensive to review.",
            raw.line_count
        ));
    }
    if token_estimate >= 4_000 {
        flags.push("token-heavy".to_string());
        reasons.push(format!("{} estimated tokens in one file.", token_estimate));
    }
    if selector_count >= 8 {
        flags.push("dom-coupled".to_string());
        reasons.push(format!("{} direct DOM selector calls.", selector_count));
    }
    if import_export_count >= 35 {
        flags.push("wide-module-surface".to_string());
        reasons.push(format!("{} import/export statements.", import_export_count));
    }
    if function_count >= 35 {
        flags.push("many-functions".to_string());
        reasons.push(format!("{} function-like declarations.", function_count));
    }
    if has_secret_signal(&raw.text) {
        flags.push("secret-signal".to_string());
        reasons.push("Potential secret-like text was detected; values are not copied.".to_string());
    }

    FileFinding {
        path: raw.path.clone(),
        language: language_for(&raw.extension).to_string(),
        extension: raw.extension.clone(),
        line_count: raw.line_count,
        size_bytes: raw.size_bytes,
        token_estimate,
        flags,
        reasons,
    }
}

fn language_stats(files: &[FileFinding]) -> Vec<LanguageStat> {
    let mut stats: BTreeMap<String, LanguageStat> = BTreeMap::new();
    for file in files {
        let entry = stats.entry(file.extension.clone()).or_insert(LanguageStat {
            language: file.language.clone(),
            extension: file.extension.clone(),
            files: 0,
            lines: 0,
            bytes: 0,
            token_estimate: 0,
        });
        entry.files += 1;
        entry.lines += file.line_count;
        entry.bytes += file.size_bytes;
        entry.token_estimate += file.token_estimate;
    }
    let mut values: Vec<LanguageStat> = stats.into_values().collect();
    values.sort_by(|a, b| b.token_estimate.cmp(&a.token_estimate));
    values
}

fn detect_scripts(raw_files: &[RawFile]) -> DetectedScripts {
    let mut scripts = DetectedScripts::default();
    for file in raw_files
        .iter()
        .filter(|file| file.path.ends_with("package.json"))
    {
        for line in file.text.lines() {
            let trimmed = line.trim().trim_matches(',').trim_matches('"');
            let lowered = trimmed.to_lowercase();
            if !lowered.contains(':') {
                continue;
            }
            if lowered.contains("typecheck") || lowered.contains("tsc") {
                scripts.typecheck.push(trimmed.to_string());
            } else if lowered.contains("test")
                || lowered.contains("vitest")
                || lowered.contains("jest")
            {
                scripts.test.push(trimmed.to_string());
            } else if lowered.contains("build") {
                scripts.build.push(trimmed.to_string());
            }
        }
    }
    scripts
}

fn privacy_findings(raw_files: &[RawFile]) -> Vec<String> {
    raw_files
        .iter()
        .filter(|file| has_secret_signal(&file.text))
        .take(12)
        .map(|file| format!("{}: secret/privacy signal", file.path))
        .collect()
}

fn token_heavy_directories(files: &[FileFinding]) -> Vec<TokenHeavyDirectory> {
    let mut dirs: BTreeMap<String, TokenHeavyDirectory> = BTreeMap::new();
    for file in files {
        let directory = Path::new(&file.path)
            .parent()
            .map(|path| path.display().to_string())
            .filter(|path| !path.is_empty())
            .unwrap_or_else(|| "root".to_string());
        let entry = dirs
            .entry(directory.clone())
            .or_insert(TokenHeavyDirectory {
                path: directory,
                token_estimate: 0,
                files: 0,
            });
        entry.token_estimate += file.token_estimate;
        entry.files += 1;
    }
    let mut values: Vec<TokenHeavyDirectory> = dirs
        .into_values()
        .filter(|entry| entry.token_estimate >= 8_000)
        .collect();
    values.sort_by(|a, b| b.token_estimate.cmp(&a.token_estimate));
    values.truncate(8);
    values
}

fn scores(
    totals: &RepoTotals,
    files: &[FileFinding],
    languages: &[LanguageStat],
    scripts: &DetectedScripts,
    privacy_findings: &[String],
    large_files: &[FileFinding],
    ignored: &[GeneratedVendorNoise],
) -> ScoreSet {
    let context = clamp(
        (totals.token_estimate / 8_000) as u32
            + large_files.len() as u32 * 8
            + ignored.len().min(20) as u32
            + languages.len().saturating_sub(5) as u32 * 4,
        0,
        100,
    );
    let verification = clamp(
        if scripts.build.is_empty() { 28 } else { 0 }
            + if scripts.test.is_empty() { 32 } else { 0 }
            + if scripts.typecheck.is_empty() { 24 } else { 0 },
        0,
        100,
    );
    let ambiguity = clamp(
        files
            .iter()
            .filter(|file| file.flags.iter().any(|flag| flag == "dom-coupled"))
            .count() as u32
            * 9
            + languages.len().saturating_sub(4) as u32 * 6,
        0,
        100,
    );
    let blast = clamp(
        large_files.len() as u32 * 12
            + files
                .iter()
                .filter(|file| file.flags.iter().any(|flag| flag == "wide-module-surface"))
                .count() as u32
                * 8
            + files
                .iter()
                .filter(|file| file.flags.iter().any(|flag| flag == "many-functions"))
                .count() as u32
                * 8,
        0,
        100,
    );
    let privacy = clamp(privacy_findings.len() as u32 * 18, 0, 100);
    let expense = clamp(
        ((context as f64 * 0.32
            + verification as f64 * 0.22
            + ambiguity as f64 * 0.18
            + blast as f64 * 0.20
            + privacy as f64 * 0.08)
            / 10.0)
            .round() as u32,
        1,
        10,
    );
    let readiness = 100_u32.saturating_sub(
        (context as f64 * 0.28
            + verification as f64 * 0.30
            + ambiguity as f64 * 0.18
            + blast as f64 * 0.16
            + privacy as f64 * 0.08)
            .round() as u32,
    );

    ScoreSet {
        ai_expense_score: score_dimension(expense, 10, vec![format!("Context burden {context}/100"), format!("Verification debt {verification}/100"), format!("Blast radius {blast}/100")]),
        ai_readiness_score: readiness_dimension(readiness, vec![if scripts.test.is_empty() { "No test script detected" } else { "Test script detected" }.to_string(), if scripts.typecheck.is_empty() { "No typecheck script detected" } else { "Typecheck script detected" }.to_string()]),
        context_burden: score_dimension(context, 100, vec!["Large token footprint, many languages, and noisy generated files increase context cost.".to_string()]),
        verification_debt: score_dimension(verification, 100, vec!["Missing build, test, or typecheck scripts make AI edits harder to verify.".to_string()]),
        ambiguity_risk: score_dimension(ambiguity, 100, vec!["Mixed stack signals and DOM coupling increase interpretation risk.".to_string()]),
        blast_radius: score_dimension(blast, 100, vec!["Large modules and broad surfaces raise change impact risk.".to_string()]),
        privacy_risk: score_dimension(privacy, 100, vec!["Secret-like strings require local-only handling and careful export review.".to_string()]),
    }
}

fn cost_drivers(
    totals: &RepoTotals,
    files: &[FileFinding],
    scripts: &DetectedScripts,
    privacy_findings: &[String],
    large_files: &[FileFinding],
    ignored: &[GeneratedVendorNoise],
    token_heavy_directories: &[TokenHeavyDirectory],
) -> Vec<CostDriver> {
    let mut drivers = Vec::new();
    if !large_files.is_empty() {
        drivers.push(CostDriver {
            id: "large-files".to_string(),
            title: "Large files dominate review cost".to_string(),
            impact: if large_files.len() >= 5 {
                "high"
            } else {
                "medium"
            }
            .to_string(),
            reason: "Large files consume context quickly and make small AI edits harder to verify."
                .to_string(),
            evidence: large_files
                .iter()
                .take(5)
                .map(|file| format!("{}: {} lines", file.path, file.line_count))
                .collect(),
        });
    }
    if totals.token_estimate >= 60_000 {
        drivers.push(CostDriver { id: "context-size".to_string(), title: "High raw source token estimate".to_string(), impact: if totals.token_estimate >= 180_000 { "high" } else { "medium" }.to_string(), reason: "A larger token footprint means more summarization and chunking before useful edits begin.".to_string(), evidence: vec![format!("{} estimated source tokens", totals.token_estimate)] });
    }
    if scripts.test.is_empty() || scripts.typecheck.is_empty() {
        drivers.push(CostDriver { id: "verification-scripts".to_string(), title: "Verification scripts are incomplete".to_string(), impact: if scripts.test.is_empty() && scripts.typecheck.is_empty() { "high" } else { "medium" }.to_string(), reason: "AI coding work is cheaper when every patch can be checked by deterministic commands.".to_string(), evidence: vec![if scripts.test.is_empty() { "No test script found" } else { "Test script found" }.to_string(), if scripts.typecheck.is_empty() { "No typecheck script found" } else { "Typecheck script found" }.to_string()] });
    }
    if !privacy_findings.is_empty() {
        drivers.push(CostDriver {
            id: "privacy-risk".to_string(),
            title: "Potential secrets or private config detected".to_string(),
            impact: "high".to_string(),
            reason: "Secret-like signals make local-first scanning important.".to_string(),
            evidence: privacy_findings.iter().take(5).cloned().collect(),
        });
    }
    if let Some(top) = token_heavy_directories.first() {
        drivers.push(CostDriver {
            id: "token-heavy-directory".to_string(),
            title: "Token-heavy directory".to_string(),
            impact: if top.token_estimate >= 100_000 {
                "high"
            } else {
                "medium"
            }
            .to_string(),
            reason: "One directory taking most context should be reviewed as a focused area."
                .to_string(),
            evidence: vec![format!(
                "{}: {} tokens across {} files",
                top.path, top.token_estimate, top.files
            )],
        });
    }
    if !ignored.is_empty() {
        drivers.push(CostDriver {
            id: "generated-vendor-noise".to_string(),
            title: "Generated/vendor files add scanning noise".to_string(),
            impact: "low".to_string(),
            reason: "Generated and dependency folders should stay out of AI context.".to_string(),
            evidence: ignored
                .iter()
                .take(5)
                .map(|entry| format!("{}: {}", entry.path, entry.reason))
                .collect(),
        });
    }
    if drivers.is_empty() {
        drivers.push(CostDriver { id: "low-cost-baseline".to_string(), title: "No major cost driver detected".to_string(), impact: "low".to_string(), reason: "The first deterministic pass did not find large files, missing scripts, or privacy signals.".to_string(), evidence: vec![format!("{} analyzed files", files.len())] });
    }
    drivers.truncate(6);
    drivers
}

fn is_ignored(relative: &str) -> bool {
    relative
        .split('/')
        .any(|part| IGNORED_PARTS.contains(&part))
        || relative.ends_with(".min.js")
        || relative.ends_with(".map")
}

fn ignored_reason(path: &Path) -> String {
    let text = path.display().to_string();
    if text.contains("node_modules") {
        "dependency folder"
    } else if text.contains("dist")
        || text.contains("build")
        || text.contains("out")
        || text.contains(".next")
    {
        "build output"
    } else if text.contains(".git") {
        "git metadata"
    } else {
        "generated/vendor path"
    }
    .to_string()
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn extension_for(path: &Path) -> String {
    path.extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

fn language_for(extension: &str) -> &'static str {
    match extension {
        "astro" => "Astro",
        "css" => "CSS",
        "go" => "Go",
        "html" => "HTML",
        "java" => "Java",
        "js" => "JavaScript",
        "json" => "JSON",
        "jsx" => "React JSX",
        "md" => "Markdown",
        "py" => "Python",
        "rs" => "Rust",
        "scss" => "SCSS",
        "svelte" => "Svelte",
        "toml" => "TOML",
        "ts" => "TypeScript",
        "tsx" => "React TSX",
        "vue" => "Vue",
        "yaml" | "yml" => "YAML",
        _ => "Other",
    }
}

fn large_line_threshold(extension: &str) -> u32 {
    match extension {
        "css" | "scss" => 500,
        "md" | "json" => 700,
        _ => 350,
    }
}

fn estimate_tokens(text: &str) -> u64 {
    (text.len() as u64 / 4).max(1)
}
fn count_any(text: &str, needles: &[&str]) -> u32 {
    needles
        .iter()
        .map(|needle| text.matches(needle).count() as u32)
        .sum()
}
fn has_secret_signal(text: &str) -> bool {
    let lowered = text.to_lowercase();
    lowered.contains("api_key=")
        || lowered.contains("api-key=")
        || lowered.contains("secret=")
        || lowered.contains("private_key")
        || lowered.contains("access_token=")
        || lowered.contains("password=")
        || text.contains("BEGIN RSA KEY")
        || text.contains("BEGIN OPENSSH KEY")
        || text.contains("BEGIN PRIVATE KEY")
}
fn clamp(value: u32, min: u32, max: u32) -> u32 {
    value.max(min).min(max)
}
fn now_epoch_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}
