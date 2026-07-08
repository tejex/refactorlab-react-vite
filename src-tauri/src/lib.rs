mod report;
mod scanner;
mod storage;

use std::fs;
use std::path::PathBuf;

use report::{
    CostDriver, FileSignal, LanguageStat, PrivacySignals, RepoScanReport, Scores, Totals,
    VerificationSignals,
};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportedReport<'a> {
    report: &'a RepoScanReport,
    raw_facts: ExportRawFacts<'a>,
    calculated_scores: &'a Scores,
    cost_drivers: &'a [CostDriver],
    formulas: ExportFormulas,
    scoring_notes: Vec<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportRawFacts<'a> {
    totals: &'a Totals,
    verification: &'a VerificationSignals,
    privacy: &'a PrivacySignals,
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
            languages: &report.languages,
            expensive_files: &report.expensive_files,
            ignored_paths: &report.ignored_paths,
        },
        calculated_scores: &report.scores,
        cost_drivers: &report.top_cost_drivers,
        formulas: export_formulas(report),
        scoring_notes: vec![
            "All scores are deterministic local heuristics.",
            "No AI model call is used to generate this report.",
            "Actual AI cost depends on model pricing, prompt shape, and task scope.",
        ],
    }
}

/// Builds human-readable formula notes from the exact scanned values in the report.
fn export_formulas(report: &RepoScanReport) -> ExportFormulas {
    let source_tokens = report.totals.estimated_source_tokens;
    let context_waste = report.scores.compression_opportunity_percent as usize;
    let compact_repo_tokens =
        source_tokens.saturating_mul(100_usize.saturating_sub(context_waste)) / 100;
    let potential_tokens_saved = source_tokens.saturating_sub(compact_repo_tokens);

    ExportFormulas {
        ai_cost_risk: "0.35 * context burden + 0.25 * verification debt + 0.15 * ambiguity risk + 0.15 * blast radius + 0.10 * privacy risk",
        tokens_at_risk: "estimatedSourceTokens is sum(scanned text file character length / 4)",
        estimated_compact_repo_map_tokens: format!(
            "{} source tokens * (1 - {}% context waste) = {} estimated compact repo map tokens",
            source_tokens, context_waste, compact_repo_tokens
        ),
        potential_tokens_saved: format!(
            "{} source tokens - {} estimated compact repo map tokens = {} potential tokens saved",
            source_tokens, compact_repo_tokens, potential_tokens_saved
        ),
        context_waste: "compressionOpportunityPercent estimates potential reduction versus broad repo context",
        retry_burn_risk: "Low/Medium/High from verification debt and overall AI cost risk",
        privacy_risk: "Low/Medium/High from .env files, secret-like assignments, and private/internal URL signals",
    }
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
