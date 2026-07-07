use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreDimension {
    pub value: u32,
    pub max: u32,
    pub level: String,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageStat {
    pub language: String,
    pub extension: String,
    pub files: u32,
    pub lines: u32,
    pub bytes: u64,
    pub token_estimate: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFinding {
    pub path: String,
    pub language: String,
    pub extension: String,
    pub line_count: u32,
    pub size_bytes: u64,
    pub token_estimate: u64,
    pub flags: Vec<String>,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostDriver {
    pub id: String,
    pub title: String,
    pub impact: String,
    pub reason: String,
    pub evidence: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedScripts {
    pub build: Vec<String>,
    pub test: Vec<String>,
    pub typecheck: Vec<String>,
    pub other: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoTotals {
    pub files: u32,
    pub analyzed_files: u32,
    pub ignored_files: u32,
    pub lines: u32,
    pub bytes: u64,
    pub token_estimate: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenHeavyDirectory {
    pub path: String,
    pub token_estimate: u64,
    pub files: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedVendorNoise {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoScanReport {
    pub source_path: String,
    pub source_type: String,
    pub scanned_at: String,
    pub ai_expense_score: ScoreDimension,
    pub ai_readiness_score: ScoreDimension,
    pub context_burden: ScoreDimension,
    pub verification_debt: ScoreDimension,
    pub ambiguity_risk: ScoreDimension,
    pub blast_radius: ScoreDimension,
    pub privacy_risk: ScoreDimension,
    pub top_cost_drivers: Vec<CostDriver>,
    pub files: Vec<FileFinding>,
    pub languages: Vec<LanguageStat>,
    pub totals: RepoTotals,
    pub large_files: Vec<FileFinding>,
    pub token_heavy_directories: Vec<TokenHeavyDirectory>,
    pub generated_vendor_noise: Vec<GeneratedVendorNoise>,
    pub scripts: DetectedScripts,
    pub privacy_findings: Vec<String>,
    pub notes: Vec<String>,
}

pub fn score_dimension(value: u32, max: u32, reasons: Vec<String>) -> ScoreDimension {
    let level = if max == 10 {
        if value >= 7 {
            "high"
        } else if value >= 4 {
            "medium"
        } else {
            "low"
        }
    } else if value >= 70 {
        "high"
    } else if value >= 35 {
        "medium"
    } else {
        "low"
    };

    ScoreDimension {
        value,
        max,
        level: level.to_string(),
        reasons,
    }
}

pub fn readiness_dimension(value: u32, reasons: Vec<String>) -> ScoreDimension {
    let level = if value >= 78 {
        "ready"
    } else if value >= 52 {
        "medium"
    } else {
        "high"
    };
    ScoreDimension {
        value,
        max: 100,
        level: level.to_string(),
        reasons,
    }
}
