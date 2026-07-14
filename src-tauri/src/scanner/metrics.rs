use std::collections::BTreeMap;

use crate::report::{
    clamp_score, label_risk, ContextClassification, CostDriver, FileSignal, LanguageStat,
    PrivacySignals, RepoGraphSummary, Scores, Totals, VerificationSignals,
};

use super::graph::graph_pressure;
use super::privacy::ambiguity_count;
use super::{RawFile, ScanState};

pub(super) struct ScoringFacts {
    ambiguity_hits: usize,
    graph_pressure: f32,
    shared_file_count: usize,
    privacy_score: f32,
}

/// Orchestrates the full local scan and assembles the report returned to the desktop UI.

pub(super) fn language_stats(raw_files: &[RawFile]) -> Vec<LanguageStat> {
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
pub(super) fn expensive_files(raw_files: &[RawFile]) -> Vec<FileSignal> {
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
pub(super) fn totals(state: &ScanState, default_context_files: &[RawFile]) -> Totals {
    let files_over_8k_tokens = default_context_files
        .iter()
        .filter(|file| file.estimated_tokens >= 8_000)
        .count();
    let files_over_32k_tokens = default_context_files
        .iter()
        .filter(|file| file.estimated_tokens >= 32_000)
        .count();

    Totals {
        total_files: state.total_files,
        source_files: default_context_files.len(),
        ignored_files: state.ignored_files,
        estimated_source_tokens: default_context_files
            .iter()
            .map(|file| file.estimated_tokens)
            .sum(),
        files_over_8k_tokens,
        files_over_32k_tokens,
    }
}

/// Precomputes reusable counts that feed multiple deterministic scoring dimensions.
pub(super) fn scoring_facts(
    raw_files: &[RawFile],
    privacy: &PrivacySignals,
    repo_graph: &RepoGraphSummary,
) -> ScoringFacts {
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
        + (privacy.private_url_count as f32 * 0.3)
        + (repo_graph.sensitive_module_refs as f32 * 0.15);

    ScoringFacts {
        ambiguity_hits,
        graph_pressure: graph_pressure(repo_graph),
        shared_file_count,
        privacy_score: privacy_score.min(10.0),
    }
}

/// Applies the V1 weighted scoring model for expense, readiness, retry risk, and compression.
pub(super) fn score_report(
    totals: &Totals,
    verification: &VerificationSignals,
    facts: &ScoringFacts,
) -> Scores {
    let context_burden = clamp_score(
        totals.estimated_source_tokens as f32 / 24_000.0
            + totals.files_over_8k_tokens as f32 * 0.8
            + totals.files_over_32k_tokens as f32 * 1.8
            + totals.source_files as f32 / 800.0
            + facts.graph_pressure * 0.15,
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
            + totals.files_over_32k_tokens as f32 * 1.5
            + facts.graph_pressure * 0.6,
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
    let retry_risk =
        if verification_debt >= 6.5 || ai_expense_score >= 7.0 || facts.graph_pressure >= 7.5 {
            "High"
        } else if verification_debt >= 3.5 || ai_expense_score >= 4.5 || facts.graph_pressure >= 4.0
        {
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
pub(super) fn cost_drivers(
    totals: &Totals,
    verification: &VerificationSignals,
    privacy: &PrivacySignals,
    facts: &ScoringFacts,
    expensive_files: &[FileSignal],
    repo_graph: &RepoGraphSummary,
    context_classification: &ContextClassification,
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

    let generated_or_dependency_tokens = context_classification.totals.generated_reference_tokens
        + context_classification.totals.dependency_lockfile_tokens;
    if generated_or_dependency_tokens >= 10_000 {
        drivers.push(CostDriver {
            title: "Generated or dependency context can inflate scans".to_string(),
            severity: if generated_or_dependency_tokens >= 75_000 {
                "high"
            } else {
                "medium"
            }
            .to_string(),
            explanation: format!(
                "{} generated/reference or dependency-lockfile tokens are summarized instead of counted as AI-eligible repository context.",
                generated_or_dependency_tokens
            ),
            affected_count: Some(
                context_classification.totals.generated_reference_files
                    + context_classification.totals.dependency_lockfile_files,
            ),
        });
    }

    if facts.graph_pressure >= 3.5 {
        drivers.push(CostDriver {
            title: "Import graph may amplify AI changes".to_string(),
            severity: if facts.graph_pressure >= 7.0 {
                "high"
            } else {
                "medium"
            }
            .to_string(),
            explanation: format!(
                "{} resolved imports, max fan-in {}, max fan-out {}, and {} circular import files.",
                repo_graph.resolved_imports,
                repo_graph.max_fan_in,
                repo_graph.max_fan_out,
                repo_graph.circular_import_files
            ),
            affected_count: Some(
                repo_graph
                    .hub_files
                    .len()
                    .max(repo_graph.circular_import_files)
                    .max(repo_graph.unresolved_imports),
            ),
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

    drivers.truncate(6);
    drivers
}

/// Stores a small evidence sample of ignored paths without making huge repos noisy.

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
