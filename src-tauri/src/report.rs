use serde::{Deserialize, Serialize};

use crate::token_counter::TokenizationMetadata;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoScanReport {
    pub repo_name: String,
    pub repo_path: String,
    pub scanned_at: String,
    pub scores: Scores,
    pub totals: Totals,
    pub verification: VerificationSignals,
    #[serde(default)]
    pub package_scopes: Vec<PackageScopeFact>,
    #[serde(default)]
    pub entrypoints: Vec<EntrypointFact>,
    #[serde(default)]
    pub technologies: Vec<TechnologyFact>,
    #[serde(default)]
    pub analyzer_coverage: Vec<AnalyzerCoverage>,
    #[serde(default)]
    pub portability: PortabilitySignals,
    pub privacy: PrivacySignals,
    #[serde(default)]
    pub runtime_signals: Vec<FileFindingSignal>,
    pub repo_graph: RepoGraphSummary,
    pub languages: Vec<LanguageStat>,
    pub expensive_files: Vec<FileSignal>,
    pub top_cost_drivers: Vec<CostDriver>,
    pub ignored_paths: Vec<String>,
    #[serde(default)]
    pub context_classification: ContextClassification,
    #[serde(default = "crate::token_counter::default_tokenization_metadata")]
    pub tokenization: TokenizationMetadata,
    #[serde(default)]
    pub repo_digest: Option<RepoDigest>,
    #[serde(default)]
    pub token_accounting: Option<TokenAccounting>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextClassification {
    pub version: String,
    pub totals: ClassificationTotals,
    pub summaries: Vec<ContextSummary>,
    pub files: Vec<ClassifiedFile>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassificationTotals {
    pub total_readable_tokens: usize,
    pub default_ai_context_tokens: usize,
    pub default_ai_context_files: usize,
    pub authored_source_tokens: usize,
    pub authored_source_files: usize,
    pub source_of_truth_config_tokens: usize,
    pub source_of_truth_config_files: usize,
    pub generated_reference_tokens: usize,
    pub generated_reference_files: usize,
    pub dependency_lockfile_tokens: usize,
    pub dependency_lockfile_files: usize,
    pub build_output_tokens: usize,
    pub build_output_files: usize,
    pub vendored_dependency_tokens: usize,
    pub vendored_dependency_files: usize,
    pub runtime_data_tokens: usize,
    pub runtime_data_files: usize,
    pub unknown_source_tokens: usize,
    pub unknown_source_files: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSummary {
    pub id: String,
    pub title: String,
    pub role: String,
    pub context_policy: String,
    pub total_tokens: usize,
    pub file_count: usize,
    pub source_paths: Vec<String>,
    pub top_files: Vec<ContextSummaryFile>,
    pub details: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSummaryFile {
    pub path: String,
    pub estimated_tokens: usize,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassifiedFile {
    pub path: String,
    pub language: String,
    pub estimated_tokens: usize,
    pub line_count: usize,
    pub size_bytes: u64,
    pub classification: FileClassification,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileClassification {
    pub role: String,
    pub context_policy: String,
    pub confidence: f32,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoDigest {
    pub generated_at: String,
    pub packet_tokens: usize,
    pub sections: Vec<RepoDigestSection>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoDigestSection {
    pub id: String,
    pub title: String,
    pub content: String,
    pub estimated_tokens: usize,
    pub budget_tokens: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenAccounting {
    pub ai_eligible_repository_tokens: usize,
    pub repository_packet_tokens: usize,
    pub potentially_avoidable_context_tokens: usize,
    pub potential_input_token_reduction_percent: u8,
    pub basis: String,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scores {
    pub ai_expense_score: f32,
    pub ai_readiness_score: u8,
    pub context_burden: f32,
    pub verification_debt: f32,
    pub ambiguity_risk: f32,
    pub blast_radius: f32,
    pub privacy_risk: String,
    pub retry_risk: String,
    pub compression_opportunity_percent: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    pub total_files: usize,
    pub source_files: usize,
    pub ignored_files: usize,
    pub estimated_source_tokens: usize,
    pub files_over_8k_tokens: usize,
    pub files_over_32k_tokens: usize,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationSignals {
    pub has_build_script: bool,
    pub has_test_script: bool,
    pub has_typecheck_script: bool,
    pub has_lint_script: bool,
    pub has_ci_config: bool,
    pub build_scripts: Vec<String>,
    pub test_scripts: Vec<String>,
    pub typecheck_scripts: Vec<String>,
    pub lint_scripts: Vec<String>,
    pub commands: Vec<VerificationCommand>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationCommand {
    pub category: String,
    pub script_name: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub script_body: String,
    pub manifest_path: String,
    pub package_manager: Option<String>,
    pub exact_command: Option<String>,
    #[serde(default)]
    pub package_scope_id: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageScopeFact {
    pub id: String,
    pub display_name: String,
    pub package_name: Option<String>,
    pub manifest_path: String,
    pub directory: String,
    pub ecosystem: String,
    pub package_manager: Option<String>,
    pub workspace_declared: bool,
    pub declared_entry: Option<String>,
    pub declared_entry_exists: Option<bool>,
    pub dependency_ids: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntrypointFact {
    pub path: String,
    pub package_scope_id: String,
    pub kind: String,
    pub evidence_type: String,
    pub evidence_source: String,
    pub proof_level: String,
    pub reason: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TechnologyFact {
    pub package_scope_id: String,
    pub identifier: String,
    pub name: String,
    pub declared_version: Option<String>,
    pub details: Vec<String>,
    pub evidence_sources: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzerCoverage {
    pub analyzer_id: String,
    pub analyzer_version: String,
    pub capability: String,
    pub status: String,
    pub analyzed_file_count: usize,
    pub analyzed_languages: Vec<String>,
    pub excluded_languages: Vec<String>,
    pub limitations: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacySignals {
    pub env_files: Vec<String>,
    pub secret_candidate_count: usize,
    pub secret_candidate_files: Vec<String>,
    pub private_url_count: usize,
    pub findings: Vec<String>,
    pub file_signals: Vec<FileFindingSignal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFindingSignal {
    pub path: String,
    pub category: String,
    pub count: usize,
    #[serde(default)]
    pub context_role: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortabilitySignals {
    pub machine_specific_absolute_imports: usize,
    pub file_signals: Vec<PortabilitySignal>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortabilitySignal {
    pub path: String,
    pub category: String,
    pub count: usize,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoGraphSummary {
    pub total_imports: usize,
    pub relative_imports: usize,
    pub external_imports: usize,
    pub resolved_imports: usize,
    pub unresolved_imports: usize,
    pub unresolved_import_details: Vec<UnresolvedImportSignal>,
    pub circular_import_files: usize,
    pub max_fan_in: usize,
    pub max_fan_out: usize,
    pub sensitive_module_refs: usize,
    pub hub_files: Vec<GraphFileSignal>,
    #[serde(default)]
    pub analyzed_file_count: usize,
    #[serde(default)]
    pub static_module_references: usize,
    #[serde(default)]
    pub resolved_local_static_references: usize,
    #[serde(default)]
    pub external_package_static_references: usize,
    #[serde(default)]
    pub unresolved_local_static_references: usize,
    #[serde(default)]
    pub machine_specific_absolute_static_references: usize,
    #[serde(default)]
    pub other_static_references: usize,
    #[serde(default)]
    pub dynamic_imports: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnresolvedImportSignal {
    pub source_path: String,
    pub specifier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphFileSignal {
    pub path: String,
    pub fan_in: usize,
    pub fan_out: usize,
    pub signals: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageStat {
    pub language: String,
    pub extension: String,
    pub files: usize,
    pub estimated_tokens: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSignal {
    pub path: String,
    pub language: String,
    pub estimated_tokens: usize,
    pub line_count: usize,
    pub size_bytes: u64,
    pub signals: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostDriver {
    pub title: String,
    pub severity: String,
    pub explanation: String,
    pub affected_count: Option<usize>,
}

/// Converts a numeric 0-10 risk score into the user-facing Low/Medium/High label.
pub fn label_risk(score: f32) -> String {
    if score >= 7.0 {
        "High".to_string()
    } else if score >= 4.0 {
        "Medium".to_string()
    } else {
        "Low".to_string()
    }
}

/// Normalizes score math to one decimal place and keeps values inside the 0-10 range.
pub fn clamp_score(value: f32) -> f32 {
    (value * 10.0).round().clamp(0.0, 100.0) / 10.0
}
