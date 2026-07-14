use std::collections::BTreeMap;

use crate::report::{ClassifiedFile, RepoDigest, RepoDigestSection, RepoScanReport};
use crate::token_counter::TokenCounter;

use super::packet::{normalize_packet_path, packet_path};

pub fn generate_repo_digest(
    report: &RepoScanReport,
    token_counter: &dyn TokenCounter,
) -> RepoDigest {
    let classified_by_path = report
        .context_classification
        .files
        .iter()
        .filter_map(|file| packet_path(&file.path).map(|path| (path, file)))
        .collect::<BTreeMap<_, _>>();
    let mut sections = Vec::new();

    sections.push(build_section(
        "project-overview",
        "Project Overview",
        500,
        vec![
            format!("Repo: {}", report.repo_name),
            format!("Path: {}", report.repo_path),
            format!("Source files: {}", report.totals.source_files),
            format!(
                "AI-eligible repository context tokens: {}",
                report.totals.estimated_source_tokens
            ),
            format!(
                "Total readable tokens: {}",
                report.context_classification.totals.total_readable_tokens
            ),
            format!("Main languages: {}", language_summary(report)),
            format!(
                "Build script detected: {}",
                yes_no(report.verification.has_build_script)
            ),
            format!(
                "Test script detected: {}",
                yes_no(report.verification.has_test_script)
            ),
            format!(
                "CI config detected: {}",
                yes_no(report.verification.has_ci_config)
            ),
        ],
        Vec::new(),
        token_counter,
    ));

    sections.push(build_section(
        "verification-signals",
        "Verification Signals",
        400,
        vec![
            format!(
                "Build script: {}",
                present_missing(report.verification.has_build_script)
            ),
            format!(
                "Test script: {}",
                present_missing(report.verification.has_test_script)
            ),
            format!(
                "Typecheck script: {}",
                present_missing(report.verification.has_typecheck_script)
            ),
            format!(
                "Lint script: {}",
                present_missing(report.verification.has_lint_script)
            ),
            format!(
                "CI config: {}",
                present_missing(report.verification.has_ci_config)
            ),
        ],
        Vec::new(),
        token_counter,
    ));

    sections.push(build_section(
        "context-classification",
        "Context Classification",
        500,
        vec![
            format!(
                "AI-eligible repository context: {} tokens / {} files",
                report
                    .context_classification
                    .totals
                    .default_ai_context_tokens,
                report
                    .context_classification
                    .totals
                    .default_ai_context_files
            ),
            format!(
                "Authored source: {} tokens / {} files",
                report.context_classification.totals.authored_source_tokens,
                report.context_classification.totals.authored_source_files
            ),
            format!(
                "Source-of-truth config: {} tokens / {} files",
                report
                    .context_classification
                    .totals
                    .source_of_truth_config_tokens,
                report
                    .context_classification
                    .totals
                    .source_of_truth_config_files
            ),
            format!(
                "Generated reference: {} tokens / {} files",
                report
                    .context_classification
                    .totals
                    .generated_reference_tokens,
                report
                    .context_classification
                    .totals
                    .generated_reference_files
            ),
            format!(
                "Dependency lockfiles: {} tokens / {} files",
                report
                    .context_classification
                    .totals
                    .dependency_lockfile_tokens,
                report
                    .context_classification
                    .totals
                    .dependency_lockfile_files
            ),
            format!(
                "Runtime data: {} tokens / {} files",
                report.context_classification.totals.runtime_data_tokens,
                report.context_classification.totals.runtime_data_files
            ),
            format!(
                "Summary buckets: {}",
                report.context_classification.summaries.len()
            ),
        ],
        report
            .context_classification
            .summaries
            .iter()
            .map(|summary| {
                format!(
                    "{}: {} tokens / {} files / {}",
                    summary.title, summary.total_tokens, summary.file_count, summary.context_policy
                )
            })
            .collect(),
        token_counter,
    ));

    sections.push(build_section(
        "summary-context",
        "Summary Context",
        500,
        report
            .context_classification
            .summaries
            .iter()
            .map(|summary| {
                let sources = if summary.source_paths.is_empty() {
                    "no source-of-truth pair detected".to_string()
                } else {
                    format!("source-of-truth: {}", summary.source_paths.join(", "))
                };
                format!(
                    "{}: {} tokens across {} files; {}",
                    summary.title, summary.total_tokens, summary.file_count, sources
                )
            })
            .collect(),
        Vec::new(),
        token_counter,
    ));

    sections.push(build_section(
        "context-burden",
        "Context Burden",
        900,
        vec![
            format!(
                "AI-eligible repository context tokens: {}",
                report.totals.estimated_source_tokens
            ),
            format!(
                "Files over 8k tokens: {}",
                report.totals.files_over_8k_tokens
            ),
            format!(
                "Files over 32k tokens: {}",
                report.totals.files_over_32k_tokens
            ),
        ],
        report
            .expensive_files
            .iter()
            .take(10)
            .map(|file| {
                format!(
                    "{} — {} tokens — {}",
                    file.path, file.estimated_tokens, file.language
                )
            })
            .collect(),
        token_counter,
    ));

    if report.repo_graph.total_imports > 0 || !report.repo_graph.hub_files.is_empty() {
        sections.push(build_section(
            "repo-graph-summary",
            "Repo Graph Summary",
            900,
            vec![
                format!("Total imports: {}", report.repo_graph.total_imports),
                format!("Relative imports: {}", report.repo_graph.relative_imports),
                format!("External imports: {}", report.repo_graph.external_imports),
                format!("Resolved imports: {}", report.repo_graph.resolved_imports),
                format!(
                    "Unresolved imports: {}",
                    report.repo_graph.unresolved_imports
                ),
                format!("Max fan-in: {}", report.repo_graph.max_fan_in),
                format!("Max fan-out: {}", report.repo_graph.max_fan_out),
                format!(
                    "Circular import files: {}",
                    report.repo_graph.circular_import_files
                ),
                format!("Hub files: {}", report.repo_graph.hub_files.len()),
            ],
            report
                .repo_graph
                .hub_files
                .iter()
                .take(10)
                .map(|file| graph_file_row(file.path.as_str(), file.fan_in, &classified_by_path))
                .collect(),
            token_counter,
        ));
    }

    if !report.privacy.env_files.is_empty()
        || report.privacy.secret_candidate_count > 0
        || report.privacy.private_url_count > 0
        || report.repo_graph.sensitive_module_refs > 0
    {
        sections.push(build_section(
            "privacy-signals",
            "Privacy Signals",
            400,
            vec![
                format!(".env-style files: {}", report.privacy.env_files.len()),
                format!(
                    "Potential secret-like strings: {}",
                    report.privacy.secret_candidate_count
                ),
                format!(
                    "Private/internal URLs: {}",
                    report.privacy.private_url_count
                ),
                format!(
                    "Sensitive module references: {}",
                    report.repo_graph.sensitive_module_refs
                ),
            ],
            Vec::new(),
            token_counter,
        ));
    }

    let ambiguity_matches = cost_driver_count(report, "Runtime ambiguity patterns found");
    if ambiguity_matches > 0 {
        sections.push(build_section(
            "ambiguity-signals",
            "Ambiguity Signals",
            400,
            vec![
                format!("Runtime ambiguity matches: {}", ambiguity_matches),
                "Tracked patterns include eval, new Function, innerHTML, insertAdjacentHTML, document.write, JSON.parse, storage access, process.env, and dynamic import.".to_string(),
            ],
            Vec::new(),
            token_counter,
        ));
    }

    sections.push(build_section(
        "cost-drivers",
        "Cost Drivers",
        700,
        Vec::new(),
        report
            .top_cost_drivers
            .iter()
            .take(10)
            .map(|driver| {
                let count = driver
                    .affected_count
                    .map(|value| format!(" — count {}", value))
                    .unwrap_or_default();
                format!(
                    "{} — {} — {}{}",
                    driver.title, driver.severity, driver.explanation, count
                )
            })
            .collect(),
        token_counter,
    ));

    sections.push(build_section(
        "scoring-summary",
        "Scoring Summary",
        500,
        vec![
            format!("AI cost pressure: {:.1}/10", report.scores.ai_expense_score),
            format!("Retry loop risk: {}", report.scores.retry_risk),
            format!("Sensitive data risk: {}", report.scores.privacy_risk),
            format!("Context burden: {:.1}/10", report.scores.context_burden),
            format!(
                "Verification debt: {:.1}/10",
                report.scores.verification_debt
            ),
            format!("Ambiguity risk: {:.1}/10", report.scores.ambiguity_risk),
            format!("Blast radius: {:.1}/10", report.scores.blast_radius),
            format!("Privacy risk: {}", report.scores.privacy_risk),
        ],
        Vec::new(),
        token_counter,
    ));

    RepoDigest {
        generated_at: report.scanned_at.clone(),
        packet_tokens: 0,
        sections,
        notes: vec![
            "Digest generated from deterministic repo facts only.".to_string(),
            "AI-eligible repository context leaves generated/reference, lock file, and runtime-data buckets summarized separately.".to_string(),
            "Summary buckets preserve evidence about excluded generated/reference and dependency context.".to_string(),
            "No file contents or secret values are included in the digest.".to_string(),
        ],
    }
}

/// Compares AI-eligible repository context with the exact final Markdown packet.

fn build_section(
    id: &str,
    title: &str,
    budget_tokens: usize,
    summary_rows: Vec<String>,
    candidate_rows: Vec<String>,
    token_counter: &dyn TokenCounter,
) -> RepoDigestSection {
    let mut detail_rows = candidate_rows;
    let mut content = section_content(&summary_rows, &detail_rows);
    let mut estimated_tokens = token_counter.count(&format!("## {title}\n{content}"));

    while estimated_tokens > budget_tokens && !detail_rows.is_empty() {
        detail_rows.pop();
        content = section_content(&summary_rows, &detail_rows);
        estimated_tokens = token_counter.count(&format!("## {title}\n{content}"));
    }

    RepoDigestSection {
        id: id.to_string(),
        title: title.to_string(),
        content,
        estimated_tokens,
        budget_tokens,
    }
}

fn section_content(summary_rows: &[String], detail_rows: &[String]) -> String {
    summary_rows
        .iter()
        .chain(detail_rows.iter())
        .map(|row| format!("- {row}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn language_summary(report: &RepoScanReport) -> String {
    let summary = report
        .languages
        .iter()
        .take(5)
        .map(|language| {
            format!(
                "{} {} files / {} tokens",
                language.language, language.files, language.estimated_tokens
            )
        })
        .collect::<Vec<_>>()
        .join(", ");

    if summary.is_empty() {
        "None detected".to_string()
    } else {
        summary
    }
}

fn graph_file_row<'a>(
    path: &str,
    fan_in: usize,
    classified_by_path: &BTreeMap<String, &'a ClassifiedFile>,
) -> String {
    let path = normalize_packet_path(path);
    match classified_by_path.get(&path) {
        Some(file) => format!(
            "{path} — importedBy {fan_in} — {} tokens — {}",
            file.estimated_tokens, file.language
        ),
        None => format!("{path} — importedBy {fan_in} — metadata join unavailable"),
    }
}

fn cost_driver_count(report: &RepoScanReport, title: &str) -> usize {
    report
        .top_cost_drivers
        .iter()
        .find(|driver| driver.title == title)
        .and_then(|driver| driver.affected_count)
        .unwrap_or(0)
}

fn yes_no(value: bool) -> &'static str {
    if value {
        "yes"
    } else {
        "no"
    }
}

fn present_missing(value: bool) -> &'static str {
    if value {
        "detected"
    } else {
        "missing"
    }
}
