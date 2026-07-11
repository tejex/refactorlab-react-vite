use std::collections::BTreeMap;

use crate::report::{ContextEstimate, FileSignal, RepoDigest, RepoDigestSection, RepoScanReport};
use crate::token_counter::TokenCounter;

const REPOSITORY_PACKET_TITLE: &str = "# Repository Context";
const REPOSITORY_PACKET_SECTION_ORDER: &[&str] = &[
    "project-overview",
    "verification-signals",
    "context-classification",
    "summary-context",
    "context-burden",
    "repo-graph-summary",
    "privacy-signals",
    "ambiguity-signals",
    "cost-drivers",
    "scoring-summary",
];

/// Renders a stable Markdown artifact from an existing deterministic repository digest.
///
/// The packet intentionally excludes digest metadata and machine-specific absolute paths. It is
/// not connected to diagnostic JSON export; later milestones can measure and export this exact
/// returned string.
pub fn render_repository_packet(repo_digest: &RepoDigest) -> String {
    let mut sections = repo_digest
        .sections
        .iter()
        .filter_map(|section| {
            let lines = sorted_packet_lines(section.content.lines());
            (!lines.is_empty()).then_some((section, lines))
        })
        .collect::<Vec<_>>();

    sections.sort_by(|(left, left_lines), (right, right_lines)| {
        packet_section_rank(&left.id)
            .cmp(&packet_section_rank(&right.id))
            .then_with(|| left.id.cmp(&right.id))
            .then_with(|| left.title.cmp(&right.title))
            .then_with(|| left_lines.cmp(right_lines))
    });

    let mut blocks = vec![REPOSITORY_PACKET_TITLE.to_string()];
    blocks.extend(
        sections
            .into_iter()
            .map(|(section, lines)| format!("## {}\n{}", section.title, lines.join("\n"))),
    );

    let notes = sorted_packet_lines(repo_digest.notes.iter().map(String::as_str));
    if !notes.is_empty() {
        blocks.push(format!(
            "## AI Context Notes\n{}",
            notes
                .into_iter()
                .map(|note| {
                    if note.starts_with("- ") {
                        note
                    } else {
                        format!("- {note}")
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }

    format!("{}\n", blocks.join("\n\n"))
}

fn sorted_packet_lines<'a>(lines: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut lines = lines
        .into_iter()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !contains_machine_specific_path(line))
        .map(str::to_string)
        .collect::<Vec<_>>();
    lines.sort();
    lines.dedup();
    lines
}

fn packet_section_rank(id: &str) -> usize {
    REPOSITORY_PACKET_SECTION_ORDER
        .iter()
        .position(|known_id| *known_id == id)
        .unwrap_or(REPOSITORY_PACKET_SECTION_ORDER.len())
}

fn contains_machine_specific_path(line: &str) -> bool {
    let fact = line.strip_prefix("- ").unwrap_or(line).trim();
    let Some((label, value)) = fact.split_once(':') else {
        return false;
    };

    label.trim().eq_ignore_ascii_case("path") && is_absolute_path(value.trim())
}

fn is_absolute_path(value: &str) -> bool {
    let bytes = value.as_bytes();
    value.starts_with('/')
        || value.starts_with("\\\\")
        || (bytes.len() >= 3
            && bytes[1] == b':'
            && matches!(bytes[2], b'\\' | b'/')
            && bytes[0].is_ascii_alphabetic())
}

/// Generates a compact Markdown-like digest from deterministic scanner facts only.
pub fn generate_repo_digest(
    report: &RepoScanReport,
    token_counter: &dyn TokenCounter,
) -> RepoDigest {
    let expensive_by_path = report
        .expensive_files
        .iter()
        .map(|file| (file.path.as_str(), file))
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
                "Likely AI context tokens: {}",
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
                "Likely AI context: {} tokens / {} files",
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
                "Likely AI context tokens: {}",
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
                .map(|file| graph_file_row(file.path.as_str(), file.fan_in, &expensive_by_path))
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

    let estimated_tokens = sections
        .iter()
        .map(|section| section.estimated_tokens)
        .sum();

    RepoDigest {
        generated_at: report.scanned_at.clone(),
        estimated_tokens,
        sections,
        notes: vec![
            "Digest generated from deterministic repo facts only.".to_string(),
            "Likely AI context leaves generated/reference, lock file, and runtime-data buckets summarized separately.".to_string(),
            "Summary buckets preserve evidence about excluded generated/reference and dependency context.".to_string(),
            "No file contents or secret values are included in the digest.".to_string(),
        ],
    }
}

/// Computes the V2 context estimate from broad source tokens minus digest tokens.
pub fn context_estimate_from_digest(
    report: &RepoScanReport,
    digest: &RepoDigest,
) -> ContextEstimate {
    let broad_source_tokens = report.totals.estimated_source_tokens;
    let digest_tokens = digest.estimated_tokens;
    let potentially_avoidable_tokens = broad_source_tokens.saturating_sub(digest_tokens);
    let potentially_avoidable_percent = conservative_context_percent(
        broad_source_tokens,
        digest_tokens,
        potentially_avoidable_tokens,
    );

    ContextEstimate {
        broad_source_tokens,
        digest_tokens,
        potentially_avoidable_tokens,
        potentially_avoidable_percent,
        basis: "digest_derived".to_string(),
        notes: vec![
            "Fixer summary tokens are generated from deterministic repo facts.".to_string(),
            "This is a repo summary size estimate, not the exact working context required for a specific code edit.".to_string(),
            "Actual AI token use depends on model, prompt, tools, cache, and task.".to_string(),
            "Percent is rounded down and capped below 100 when the digest has nonzero tokens.".to_string(),
        ],
    }
}

fn conservative_context_percent(
    broad_source_tokens: usize,
    digest_tokens: usize,
    potentially_avoidable_tokens: usize,
) -> u8 {
    if broad_source_tokens == 0 || potentially_avoidable_tokens == 0 {
        return 0;
    }

    let percent = ((potentially_avoidable_tokens as f64 / broad_source_tokens as f64) * 100.0)
        .floor()
        .clamp(0.0, 100.0) as u8;

    if digest_tokens > 0 {
        percent.min(99)
    } else {
        percent
    }
}

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
    expensive_by_path: &BTreeMap<&'a str, &'a FileSignal>,
) -> String {
    let (tokens, language) = expensive_by_path
        .get(path)
        .map(|file| (file.estimated_tokens, file.language.as_str()))
        .unwrap_or((0, "Unknown"));

    format!("{path} — importedBy {fan_in} — {tokens} tokens — {language}")
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

#[cfg(test)]
mod tests {
    use super::{context_estimate_from_digest, generate_repo_digest, render_repository_packet};
    use crate::report::{
        ContextEstimate, CostDriver, FileSignal, LanguageStat, PrivacySignals, RepoDigest,
        RepoDigestSection, RepoGraphSummary, RepoScanReport, Scores, Totals, VerificationSignals,
    };
    use crate::token_counter::HeuristicTokenCounter;

    #[test]
    fn repository_packet_matches_fixture_and_is_order_independent() {
        let digest = packet_fixture_digest();
        let mut reordered = digest.clone();
        reordered.generated_at = "different-timestamp".to_string();
        reordered.estimated_tokens = 999_999;
        reordered.sections.reverse();
        for section in &mut reordered.sections {
            section.content = section.content.lines().rev().collect::<Vec<_>>().join("\n");
        }
        reordered.notes.reverse();

        let rendered = render_repository_packet(&digest);
        let reordered_rendered = render_repository_packet(&reordered);
        let expected = include_str!("../tests/fixtures/repository_packet.md");

        assert_eq!(rendered, expected);
        assert_eq!(reordered_rendered, expected);
        assert!(!rendered.contains("/Users/example/private-repo"));
        assert!(!rendered.contains("different-timestamp"));
    }

    #[test]
    fn empty_or_path_only_digest_still_generates_a_valid_packet() {
        let empty = RepoDigest {
            generated_at: "1".to_string(),
            estimated_tokens: 0,
            sections: vec![],
            notes: vec![],
        };
        let path_only = RepoDigest {
            generated_at: "2".to_string(),
            estimated_tokens: 12,
            sections: vec![RepoDigestSection {
                id: "project-overview".to_string(),
                title: "Project Overview".to_string(),
                content: "- Path: C:\\Users\\example\\private-repo".to_string(),
                estimated_tokens: 12,
                budget_tokens: 100,
            }],
            notes: vec![],
        };

        assert_eq!(render_repository_packet(&empty), "# Repository Context\n");
        assert_eq!(
            render_repository_packet(&path_only),
            "# Repository Context\n"
        );
    }

    #[test]
    fn digest_generation_is_deterministic_and_uses_expected_sections() {
        let report = sample_report();
        let counter = HeuristicTokenCounter::new();

        let first = generate_repo_digest(&report, &counter);
        let second = generate_repo_digest(&report, &counter);
        let ids = first
            .sections
            .iter()
            .map(|section| section.id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(first.estimated_tokens, second.estimated_tokens);
        assert_eq!(first.sections[0].content, second.sections[0].content);
        assert!(ids.contains(&"project-overview"));
        assert!(ids.contains(&"verification-signals"));
        assert!(ids.contains(&"context-burden"));
        assert!(ids.contains(&"repo-graph-summary"));
        assert!(ids.contains(&"privacy-signals"));
        assert!(ids.contains(&"ambiguity-signals"));
        assert!(ids.contains(&"cost-drivers"));
        assert!(ids.contains(&"scoring-summary"));
    }

    fn packet_fixture_digest() -> RepoDigest {
        RepoDigest {
            generated_at: "1710000000".to_string(),
            estimated_tokens: 321,
            sections: vec![
                RepoDigestSection {
                    id: "verification-signals".to_string(),
                    title: "Verification Signals".to_string(),
                    content: "- Test script: detected\n- Build script: detected\n- Lint script: missing"
                        .to_string(),
                    estimated_tokens: 20,
                    budget_tokens: 400,
                },
                RepoDigestSection {
                    id: "project-overview".to_string(),
                    title: "Project Overview".to_string(),
                    content: "- Source files: 12\n- Path: /Users/example/private-repo\n- Repo: sample\n- Main languages: Rust, TypeScript"
                        .to_string(),
                    estimated_tokens: 30,
                    budget_tokens: 500,
                },
                RepoDigestSection {
                    id: "repo-graph-summary".to_string(),
                    title: "Repo Graph Summary".to_string(),
                    content: "- Unresolved imports: 2\n- Total imports: 18\n- Resolved imports: 16"
                        .to_string(),
                    estimated_tokens: 20,
                    budget_tokens: 900,
                },
            ],
            notes: vec![
                "No file contents or secret values are included in the digest.".to_string(),
                "Digest generated from deterministic repo facts only.".to_string(),
            ],
        }
    }

    #[test]
    fn digest_does_not_include_secret_values_from_privacy_findings() {
        let mut report = sample_report();
        report
            .privacy
            .findings
            .push("actual secret value super_secret_value_123".to_string());
        let counter = HeuristicTokenCounter::new();

        let digest = generate_repo_digest(&report, &counter);
        let text = digest
            .sections
            .iter()
            .map(|section| section.content.as_str())
            .collect::<Vec<_>>()
            .join("\n");

        assert!(!text.contains("super_secret_value_123"));
    }

    #[test]
    fn digest_sections_respect_row_caps_and_budgets() {
        let mut report = sample_report();
        for index in 0..30 {
            report.expensive_files.push(FileSignal {
                path: format!("src/huge-{index}.ts"),
                language: "TypeScript".to_string(),
                estimated_tokens: 10_000 + index,
                line_count: 500,
                size_bytes: 40_000,
                signals: vec!["over-8k-tokens".to_string()],
            });
        }
        let counter = HeuristicTokenCounter::new();

        let digest = generate_repo_digest(&report, &counter);

        for section in digest.sections {
            assert!(section.estimated_tokens <= section.budget_tokens);
        }
    }

    #[test]
    fn context_estimate_uses_digest_tokens_and_clamps_percent() {
        let report = sample_report_with_source_tokens(100);
        let digest = RepoDigest {
            generated_at: "1".to_string(),
            estimated_tokens: 25,
            sections: vec![RepoDigestSection {
                id: "x".to_string(),
                title: "X".to_string(),
                content: "x".to_string(),
                estimated_tokens: 25,
                budget_tokens: 50,
            }],
            notes: vec![],
        };

        let estimate = context_estimate_from_digest(&report, &digest);

        assert_eq!(estimate.broad_source_tokens, 100);
        assert_eq!(estimate.digest_tokens, 25);
        assert_eq!(estimate.potentially_avoidable_tokens, 75);
        assert_eq!(estimate.potentially_avoidable_percent, 75);
        assert_eq!(estimate.basis, "digest_derived");
    }

    #[test]
    fn context_estimate_does_not_round_nonzero_digest_to_100_percent() {
        let report = sample_report_with_source_tokens(231_600);
        let digest = RepoDigest {
            generated_at: "1".to_string(),
            estimated_tokens: 871,
            sections: vec![],
            notes: vec![],
        };

        let estimate = context_estimate_from_digest(&report, &digest);

        assert_eq!(estimate.potentially_avoidable_tokens, 230_729);
        assert_eq!(estimate.potentially_avoidable_percent, 99);
    }

    #[test]
    fn context_estimate_handles_zero_broad_tokens() {
        let report = sample_report_with_source_tokens(0);
        let digest = RepoDigest {
            generated_at: "1".to_string(),
            estimated_tokens: 25,
            sections: vec![],
            notes: vec![],
        };

        let estimate = context_estimate_from_digest(&report, &digest);

        assert_eq!(estimate.potentially_avoidable_tokens, 0);
        assert_eq!(estimate.potentially_avoidable_percent, 0);
    }

    fn sample_report_with_source_tokens(tokens: usize) -> RepoScanReport {
        let mut report = sample_report();
        report.totals.estimated_source_tokens = tokens;
        report
    }

    fn sample_report() -> RepoScanReport {
        RepoScanReport {
            repo_name: "sample".to_string(),
            repo_path: "/tmp/sample".to_string(),
            scanned_at: "1".to_string(),
            scores: Scores {
                ai_expense_score: 7.3,
                ai_readiness_score: 27,
                context_burden: 8.0,
                verification_debt: 6.0,
                ambiguity_risk: 3.0,
                blast_radius: 4.0,
                privacy_risk: "High".to_string(),
                retry_risk: "High".to_string(),
                compression_opportunity_percent: 72,
            },
            totals: Totals {
                total_files: 12,
                source_files: 10,
                ignored_files: 2,
                estimated_source_tokens: 120_000,
                files_over_8k_tokens: 2,
                files_over_32k_tokens: 1,
            },
            verification: VerificationSignals {
                has_build_script: true,
                has_test_script: false,
                has_typecheck_script: true,
                has_lint_script: false,
                has_ci_config: false,
                build_scripts: vec!["build".to_string()],
                test_scripts: vec![],
                typecheck_scripts: vec!["typecheck".to_string()],
                lint_scripts: vec![],
            },
            privacy: PrivacySignals {
                env_files: vec![".env".to_string()],
                secret_candidate_count: 2,
                secret_candidate_files: vec![".env".to_string()],
                private_url_count: 1,
                findings: vec!["2 secret-like assignments detected".to_string()],
            },
            repo_graph: RepoGraphSummary {
                total_imports: 20,
                relative_imports: 14,
                external_imports: 6,
                resolved_imports: 12,
                unresolved_imports: 2,
                circular_import_files: 1,
                max_fan_in: 7,
                max_fan_out: 5,
                sensitive_module_refs: 1,
                hub_files: vec![crate::report::GraphFileSignal {
                    path: "src/core.ts".to_string(),
                    fan_in: 7,
                    fan_out: 5,
                    signals: vec!["high-fan-in".to_string()],
                }],
            },
            languages: vec![LanguageStat {
                language: "TypeScript".to_string(),
                extension: "ts".to_string(),
                files: 8,
                estimated_tokens: 100_000,
            }],
            expensive_files: vec![FileSignal {
                path: "src/core.ts".to_string(),
                language: "TypeScript".to_string(),
                estimated_tokens: 32_500,
                line_count: 900,
                size_bytes: 130_000,
                signals: vec!["over-32k-tokens".to_string()],
            }],
            top_cost_drivers: vec![
                CostDriver {
                    title: "Runtime ambiguity patterns found".to_string(),
                    severity: "medium".to_string(),
                    explanation: "Dynamic patterns detected.".to_string(),
                    affected_count: Some(9),
                },
                CostDriver {
                    title: "Source context is heavy".to_string(),
                    severity: "high".to_string(),
                    explanation: "Large source context.".to_string(),
                    affected_count: Some(10),
                },
            ],
            ignored_paths: vec!["node_modules".to_string()],
            context_classification: Default::default(),
            tokenization: crate::token_counter::default_tokenization_metadata(),
            repo_digest: None,
            context_estimate: None::<ContextEstimate>,
        }
    }
}
