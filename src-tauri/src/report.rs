use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoScanReport {
    pub repo_name: String,
    pub repo_path: String,
    pub scanned_at: String,
    pub scores: Scores,
    pub totals: Totals,
    pub verification: VerificationSignals,
    pub privacy: PrivacySignals,
    pub languages: Vec<LanguageStat>,
    pub expensive_files: Vec<FileSignal>,
    pub top_cost_drivers: Vec<CostDriver>,
    pub ignored_paths: Vec<String>,
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
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacySignals {
    pub env_files: Vec<String>,
    pub secret_candidate_count: usize,
    pub secret_candidate_files: Vec<String>,
    pub private_url_count: usize,
    pub findings: Vec<String>,
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
