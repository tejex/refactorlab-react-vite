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
    ContextClassification, ContextEstimate, CostDriver, FileSignal, LanguageStat, PrivacySignals,
    RepoDigest, RepoGraphSummary, RepoScanReport, Scores, Totals, VerificationSignals,
};
use serde::Serialize;
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
    context_estimate: &'a Option<ContextEstimate>,
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
    tokens_at_risk: &'static str,
    estimated_compact_repo_map_tokens: String,
    potential_tokens_saved: String,
    context_waste: &'static str,
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
        context_estimate: &report.context_estimate,
        formulas: export_formulas(report),
        scoring_notes: vec![
            "All scores are deterministic local heuristics.",
            "No AI model call is used to generate this report.",
            "Fixer summary and context estimates are generated from deterministic scanner facts.",
            "Actual token use depends on model, prompt shape, tools, cache, and task scope.",
        ],
    }
}

/// Builds human-readable formula notes from the exact scanned values in the report.
fn export_formulas(report: &RepoScanReport) -> ExportFormulas {
    let (source_tokens, compact_repo_tokens, potential_tokens_saved, _context_waste) =
        context_values(report);

    ExportFormulas {
        ai_cost_risk: "0.35 * context burden + 0.25 * verification debt + 0.15 * ambiguity risk + 0.15 * blast radius + 0.10 * privacy risk",
        tokens_at_risk: "estimatedSourceTokens is sum(TokenCounter.count(scanned text file))",
        estimated_compact_repo_map_tokens: format!(
            "contextEstimate.digestTokens = {} Fixer summary tokens from scanner facts",
            compact_repo_tokens
        ),
        potential_tokens_saved: format!(
            "{} likely AI context tokens - {} Fixer summary tokens = {} tokens saved in the summary",
            source_tokens, compact_repo_tokens, potential_tokens_saved
        ),
        context_waste: if report.context_estimate.is_some() {
            "contextEstimate.potentiallyAvoidablePercent is how much smaller the Fixer summary is than the likely AI context"
        } else {
            "Fallback: compressionOpportunityPercent estimates potential reduction versus broad repo context"
        },
        retry_burn_risk: "Low/Medium/High from verification debt and overall AI cost risk",
        privacy_risk: "Low/Medium/High from .env files, secret-like assignments, and private/internal URL signals",
    }
}

fn context_values(report: &RepoScanReport) -> (usize, usize, usize, usize) {
    if let Some(context) = &report.context_estimate {
        return (
            context.broad_source_tokens,
            context.digest_tokens,
            context.potentially_avoidable_tokens,
            context.potentially_avoidable_percent as usize,
        );
    }

    let source_tokens = report.totals.estimated_source_tokens;
    let context_waste = report.scores.compression_opportunity_percent as usize;
    let compact_repo_tokens =
        source_tokens.saturating_mul(100_usize.saturating_sub(context_waste)) / 100;
    let potential_tokens_saved = source_tokens.saturating_sub(compact_repo_tokens);

    (
        source_tokens,
        compact_repo_tokens,
        potential_tokens_saved,
        context_waste,
    )
}

/// Builds and runs the Tauri app, registering plugins and commands exposed to React.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![scan_repo, export_report])
        .run(tauri::generate_context!())
        .expect("failed to run Fixer desktop app");
}

#[cfg(test)]
mod tests {
    use super::{export_payload, report, token_counter};
    use report::{
        ContextEstimate, CostDriver, FileSignal, LanguageStat, PrivacySignals, RepoDigest,
        RepoDigestSection, RepoGraphSummary, RepoScanReport, Scores, Totals, VerificationSignals,
    };

    #[test]
    fn export_payload_includes_v2_digest_context_and_tokenization() {
        let report = sample_report();
        let value = serde_json::to_value(export_payload(&report)).expect("export should serialize");

        assert!(value.get("tokenization").is_some());
        assert!(value.get("repoDigest").is_some());
        assert!(value.get("contextEstimate").is_some());
        assert_eq!(value["contextEstimate"]["basis"], "digest_derived");
        assert_eq!(value["repoDigest"]["estimatedTokens"], 25);
        assert_eq!(
            value["formulas"]["potentialTokensSaved"],
            "100 likely AI context tokens - 25 Fixer summary tokens = 75 tokens saved in the summary"
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
            privacy: PrivacySignals::default(),
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
            tokenization: token_counter::default_tokenization_metadata(),
            repo_digest: Some(RepoDigest {
                generated_at: "1".to_string(),
                estimated_tokens: 25,
                sections: vec![RepoDigestSection {
                    id: "project-overview".to_string(),
                    title: "Project Overview".to_string(),
                    content: "- Repo: sample".to_string(),
                    estimated_tokens: 25,
                    budget_tokens: 500,
                }],
                notes: vec![],
            }),
            context_estimate: Some(ContextEstimate {
                broad_source_tokens: 100,
                digest_tokens: 25,
                potentially_avoidable_tokens: 75,
                potentially_avoidable_percent: 75,
                basis: "digest_derived".to_string(),
                notes: vec![],
            }),
        }
    }
}
