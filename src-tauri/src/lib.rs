mod classifier;
mod digest;
mod report;
mod scanner;
mod storage;
mod token_counter;

pub use digest::render_repository_packet;

use std::fs;
use std::path::PathBuf;

use report::{
    ContextClassification, CostDriver, FileSignal, LanguageStat, PrivacySignals, RepoDigest,
    RepoGraphSummary, RepoScanReport, Scores, TokenAccounting, Totals, VerificationSignals,
};
use serde::Serialize;
use tauri_plugin_clipboard_manager::ClipboardExt;
use token_counter::TokenizationMetadata;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportedReport<'a> {
    report: &'a RepoScanReport,
    raw_facts: ExportRawFacts<'a>,
    calculated_scores: &'a Scores,
    cost_drivers: &'a [CostDriver],
    tokenization: &'a TokenizationMetadata,
    repo_digest: &'a Option<RepoDigest>,
    token_accounting: &'a Option<TokenAccounting>,
    formulas: ExportFormulas,
    scoring_notes: Vec<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportRawFacts<'a> {
    totals: &'a Totals,
    verification: &'a VerificationSignals,
    privacy: &'a PrivacySignals,
    repo_graph: &'a RepoGraphSummary,
    context_classification: &'a ContextClassification,
    languages: &'a [LanguageStat],
    expensive_files: &'a [FileSignal],
    ignored_paths: &'a [String],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportFormulas {
    ai_cost_risk: &'static str,
    ai_eligible_repository_context: &'static str,
    repository_packet_tokens: String,
    potentially_avoidable_context: String,
    potential_input_token_reduction: &'static str,
    retry_burn_risk: &'static str,
    privacy_risk: &'static str,
}

/// Tauri command called by the UI after folder selection; scans locally and stores a copy in SQLite.
#[tauri::command]
fn scan_repo(path: String, app: tauri::AppHandle) -> Result<RepoScanReport, String> {
    let report = scanner::scan_repo(PathBuf::from(path)).map_err(|error| error.to_string())?;
    storage::save_report(&app, &report).map_err(|error| error.to_string())?;
    Ok(report)
}

/// Tauri command used by the save dialog flow to write the current report as JSON.
#[tauri::command]
fn export_report(path: String, report: RepoScanReport) -> Result<(), String> {
    let payload = export_payload(&report);
    let json = serde_json::to_string_pretty(&payload).map_err(|error| error.to_string())?;
    fs::write(path, json).map_err(|error| error.to_string())
}

/// Writes the exact final Markdown repository packet selected by the save dialog.
#[tauri::command]
fn export_packet(path: String, report: RepoScanReport) -> Result<(), String> {
    fs::write(path, packet_markdown(&report)?).map_err(|error| error.to_string())
}

/// Copies the exact final Markdown repository packet to the native system clipboard.
#[tauri::command]
fn copy_packet(report: RepoScanReport, app: tauri::AppHandle) -> Result<(), String> {
    app.clipboard()
        .write_text(packet_markdown(&report)?)
        .map_err(|error| error.to_string())
}

fn packet_markdown(report: &RepoScanReport) -> Result<String, String> {
    report
        .repo_digest
        .as_ref()
        .map(|_| render_repository_packet(report))
        .ok_or_else(|| "Repository packet is not available for this scan.".to_string())
}

/// Wraps the report with formulas and repeated raw-fact sections for a more explainable export file.
fn export_payload(report: &RepoScanReport) -> ExportedReport<'_> {
    ExportedReport {
        report,
        raw_facts: ExportRawFacts {
            totals: &report.totals,
            verification: &report.verification,
            privacy: &report.privacy,
            repo_graph: &report.repo_graph,
            context_classification: &report.context_classification,
            languages: &report.languages,
            expensive_files: &report.expensive_files,
            ignored_paths: &report.ignored_paths,
        },
        calculated_scores: &report.scores,
        cost_drivers: &report.top_cost_drivers,
        tokenization: &report.tokenization,
        repo_digest: &report.repo_digest,
        token_accounting: &report.token_accounting,
        formulas: export_formulas(report),
        scoring_notes: vec![
            "All scores are deterministic local heuristics.",
            "No AI model call is used to generate this report.",
            "Repository-packet and AI-eligible repository totals use the same explicit tokenizer and encoding.",
            "Actual token use depends on model, prompt shape, tools, cache, and task scope.",
        ],
    }
}

/// Builds human-readable formula notes from the exact scanned values in the report.
fn export_formulas(report: &RepoScanReport) -> ExportFormulas {
    let (eligible_tokens, packet_tokens, avoidable_tokens, _reduction_percent) =
        token_accounting_values(report);

    ExportFormulas {
        ai_cost_risk: "0.35 * context burden + 0.25 * verification debt + 0.15 * ambiguity risk + 0.15 * blast radius + 0.10 * privacy risk",
        ai_eligible_repository_context: "sum(TokenCounter.count(file content)) for files included by the deterministic context classifier",
        repository_packet_tokens: format!(
            "TokenCounter.count(renderRepositoryPacket(repoDigest)) = {} repository-packet tokens",
            packet_tokens
        ),
        potentially_avoidable_context: format!(
            "{} AI-eligible repository tokens - {} repository-packet tokens = {} potentially avoidable context tokens",
            eligible_tokens, packet_tokens, avoidable_tokens
        ),
        potential_input_token_reduction: if report.token_accounting.is_some() {
            "round(potentiallyAvoidableContextTokens / aiEligibleRepositoryTokens * 100) to the nearest whole percentage point, clamped to 0-100"
        } else {
            "Fallback: compressionOpportunityPercent estimates potential reduction versus broad repo context"
        },
        retry_burn_risk: "Low/Medium/High from verification debt and overall AI cost risk",
        privacy_risk: "Low/Medium/High from .env files, secret-like assignments, and private/internal URL signals",
    }
}

fn token_accounting_values(report: &RepoScanReport) -> (usize, usize, usize, usize) {
    if let Some(accounting) = &report.token_accounting {
        return (
            accounting.ai_eligible_repository_tokens,
            accounting.repository_packet_tokens,
            accounting.potentially_avoidable_context_tokens,
            accounting.potential_input_token_reduction_percent as usize,
        );
    }

    let source_tokens = report.totals.estimated_source_tokens;
    let context_waste = report.scores.compression_opportunity_percent as usize;
    let packet_tokens = source_tokens.saturating_mul(100_usize.saturating_sub(context_waste)) / 100;
    let potentially_avoidable_tokens = source_tokens.saturating_sub(packet_tokens);

    (
        source_tokens,
        packet_tokens,
        potentially_avoidable_tokens,
        context_waste,
    )
}

/// Builds and runs the Tauri app, registering plugins and commands exposed to React.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_repo,
            export_report,
            export_packet,
            copy_packet
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Fixer desktop app");
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{export_packet, export_payload, packet_markdown, report, scanner, token_counter};
    use report::{
        CostDriver, FileSignal, LanguageStat, PrivacySignals, RepoDigest, RepoDigestSection,
        RepoGraphSummary, RepoScanReport, Scores, TokenAccounting, Totals, VerificationSignals,
    };

    #[test]
    fn export_payload_includes_packet_accounting_and_tokenization() {
        let report = sample_report();
        let value = serde_json::to_value(export_payload(&report)).expect("export should serialize");

        assert!(value.get("tokenization").is_some());
        assert!(value.get("repoDigest").is_some());
        assert!(value.get("tokenAccounting").is_some());
        assert_eq!(
            value["tokenAccounting"]["basis"],
            "same_tokenizer_exact_packet"
        );
        assert_eq!(value["repoDigest"]["packetTokens"], 25);
        assert_eq!(value["tokenization"]["tokenizer"], "tiktoken-rs");
        assert_eq!(value["tokenization"]["encoding"], "o200k_base");
        assert_eq!(
            value["formulas"]["potentiallyAvoidableContext"],
            "100 AI-eligible repository tokens - 25 repository-packet tokens = 75 potentially avoidable context tokens"
        );
        assert_eq!(
            value["formulas"]["potentialInputTokenReduction"],
            "round(potentiallyAvoidableContextTokens / aiEligibleRepositoryTokens * 100) to the nearest whole percentage point, clamped to 0-100"
        );
    }

    #[test]
    fn packet_export_writes_the_exact_rendered_markdown_without_json_wrapping() {
        let report = sample_report();
        let expected = packet_markdown(&report).expect("packet should render");
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock should be valid")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "fixer-packet-export-{}-{nonce}.md",
            std::process::id()
        ));

        export_packet(path.display().to_string(), report).expect("packet should export");
        let exported = fs::read_to_string(&path).expect("packet should be readable");
        let _ = fs::remove_file(path);

        assert_eq!(exported, expected);
        assert!(exported.starts_with("# Repository Context\n"));
        assert!(!exported.starts_with('{'));
    }

    #[test]
    fn exported_packet_bytes_match_the_recorded_o200k_token_count() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock should be valid")
            .as_nanos();
        let repo_path = std::env::temp_dir().join(format!(
            "fixer-export-token-source-{}-{nonce}",
            std::process::id()
        ));
        let export_path = std::env::temp_dir().join(format!(
            "fixer-export-token-packet-{}-{nonce}.md",
            std::process::id()
        ));
        fs::create_dir_all(repo_path.join("src")).expect("test repo should be created");
        fs::write(
            repo_path.join("package.json"),
            r#"{"packageManager":"npm@10","scripts":{"build":"tsc -b"}}"#,
        )
        .expect("manifest should be written");
        fs::write(
            repo_path.join("src/main.ts"),
            "export const greeting = 'hello';\n",
        )
        .expect("source should be written");

        let report = scanner::scan_repo(repo_path.clone()).expect("scan should succeed");
        let recorded_tokens = report
            .repo_digest
            .as_ref()
            .expect("packet digest should exist")
            .packet_tokens;
        assert_eq!(report.tokenization.encoding.as_deref(), Some("o200k_base"));
        export_packet(export_path.display().to_string(), report).expect("packet should export");

        let exported_bytes = fs::read(&export_path).expect("exported packet should be readable");
        let exported_markdown =
            std::str::from_utf8(&exported_bytes).expect("exported packet should be valid UTF-8");
        let counter = token_counter::default_token_counter();

        assert_eq!(counter.count(exported_markdown), recorded_tokens);

        let _ = fs::remove_file(export_path);
        let _ = fs::remove_dir_all(repo_path);
    }

    #[test]
    fn packet_actions_explain_when_an_older_report_has_no_digest() {
        let mut report = sample_report();
        report.repo_digest = None;

        assert_eq!(
            packet_markdown(&report),
            Err("Repository packet is not available for this scan.".to_string())
        );
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
                compression_opportunity_percent: 75,
            },
            totals: Totals {
                total_files: 2,
                source_files: 2,
                ignored_files: 0,
                estimated_source_tokens: 100,
                files_over_8k_tokens: 0,
                files_over_32k_tokens: 0,
            },
            verification: VerificationSignals::default(),
            package_scopes: vec![],
            entrypoints: vec![],
            technologies: vec![],
            analyzer_coverage: vec![],
            portability: Default::default(),
            privacy: PrivacySignals::default(),
            runtime_signals: vec![],
            repo_graph: RepoGraphSummary::default(),
            languages: vec![LanguageStat {
                language: "TypeScript".to_string(),
                extension: "ts".to_string(),
                files: 2,
                estimated_tokens: 100,
            }],
            expensive_files: vec![FileSignal {
                path: "src/main.ts".to_string(),
                language: "TypeScript".to_string(),
                estimated_tokens: 80,
                line_count: 20,
                size_bytes: 320,
                signals: vec![],
            }],
            top_cost_drivers: vec![CostDriver {
                title: "Source context is heavy".to_string(),
                severity: "medium".to_string(),
                explanation: "Large source context.".to_string(),
                affected_count: Some(2),
            }],
            ignored_paths: vec![],
            context_classification: Default::default(),
            tokenization: token_counter::TokenizationMetadata {
                tokenizer: "tiktoken-rs".to_string(),
                method: "byte_pair_encoding".to_string(),
                encoding: Some("o200k_base".to_string()),
                fallback_used: false,
                notes: vec![],
            },
            repo_digest: Some(RepoDigest {
                generated_at: "1".to_string(),
                packet_tokens: 25,
                sections: vec![RepoDigestSection {
                    id: "project-overview".to_string(),
                    title: "Project Overview".to_string(),
                    content: "- Repo: sample".to_string(),
                    estimated_tokens: 25,
                    budget_tokens: 500,
                }],
                notes: vec![],
            }),
            token_accounting: Some(TokenAccounting {
                ai_eligible_repository_tokens: 100,
                repository_packet_tokens: 25,
                potentially_avoidable_context_tokens: 75,
                potential_input_token_reduction_percent: 75,
                basis: "same_tokenizer_exact_packet".to_string(),
                notes: vec![],
            }),
        }
    }
}
