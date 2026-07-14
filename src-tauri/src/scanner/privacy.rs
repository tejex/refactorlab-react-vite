use std::collections::BTreeMap;

use crate::report::{ContextClassification, FileFindingSignal, PrivacySignals};

use super::files::is_env_file;
use super::graph::normalize_repo_path;
use super::RawFile;

const AMBIGUITY_PATTERNS: &[(&str, &str)] = &[
    ("eval(", "eval"),
    ("new Function(", "new Function"),
    ("innerHTML", "innerHTML"),
    ("insertAdjacentHTML", "insertAdjacentHTML"),
    ("document.write", "document.write"),
    ("JSON.parse(", "JSON.parse"),
    ("localStorage", "localStorage access"),
    ("sessionStorage", "sessionStorage access"),
    ("process.env.", "process.env access"),
    ("import(", "dynamic import"),
];

pub(super) fn detect_privacy(
    raw_files: &[RawFile],
    classification: &ContextClassification,
) -> PrivacySignals {
    let mut privacy = PrivacySignals::default();
    let roles = context_roles(classification);

    for file in raw_files {
        if is_env_file(&file.path) {
            privacy.env_files.push(file.path.clone());
            privacy.file_signals.push(FileFindingSignal {
                path: normalize_repo_path(&file.path),
                category: "environment file".to_string(),
                count: 1,
                context_role: privacy_context_role(
                    &file.path,
                    roles.get(&file.path).map(String::as_str),
                ),
            });
        }

        let secret_count = count_secret_candidates(&file.text);
        if secret_count > 0 {
            privacy.secret_candidate_count += secret_count;
            if privacy.secret_candidate_files.len() < 12 {
                privacy.secret_candidate_files.push(file.path.clone());
            }
            privacy.file_signals.push(FileFindingSignal {
                path: normalize_repo_path(&file.path),
                category: "potential secret-like string".to_string(),
                count: secret_count,
                context_role: privacy_context_role(
                    &file.path,
                    roles.get(&file.path).map(String::as_str),
                ),
            });
        }

        let private_url_count = count_private_urls(&file.text);
        privacy.private_url_count += private_url_count;
        if private_url_count > 0 {
            privacy.file_signals.push(FileFindingSignal {
                path: normalize_repo_path(&file.path),
                category: "private/internal URL".to_string(),
                count: private_url_count,
                context_role: privacy_context_role(
                    &file.path,
                    roles.get(&file.path).map(String::as_str),
                ),
            });
        }
    }

    if !privacy.env_files.is_empty() {
        privacy.findings.push(format!(
            "{} .env-style files detected",
            privacy.env_files.len()
        ));
    }
    if privacy.secret_candidate_count > 0 {
        privacy.findings.push(format!(
            "{} secret-like assignments detected",
            privacy.secret_candidate_count
        ));
    }
    if privacy.private_url_count > 0 {
        privacy.findings.push(format!(
            "{} private/internal URL signals detected",
            privacy.private_url_count
        ));
    }

    privacy.file_signals.sort_by(|a, b| {
        a.path
            .cmp(&b.path)
            .then_with(|| a.category.cmp(&b.category))
    });

    privacy
}

pub(super) fn detect_runtime_signals(
    raw_files: &[RawFile],
    classification: &ContextClassification,
) -> Vec<FileFindingSignal> {
    let mut signals = Vec::new();
    let roles = context_roles(classification);

    for file in raw_files {
        for (pattern, category) in AMBIGUITY_PATTERNS {
            let count = file.text.matches(pattern).count();
            if count > 0 {
                signals.push(FileFindingSignal {
                    path: normalize_repo_path(&file.path),
                    category: (*category).to_string(),
                    count,
                    context_role: privacy_context_role(
                        &file.path,
                        roles.get(&file.path).map(String::as_str),
                    ),
                });
            }
        }
    }

    signals.sort_by(|a, b| {
        a.path
            .cmp(&b.path)
            .then_with(|| a.category.cmp(&b.category))
    });
    signals
}

fn context_roles(classification: &ContextClassification) -> BTreeMap<String, String> {
    classification
        .files
        .iter()
        .map(|file| {
            (
                normalize_repo_path(&file.path),
                file.classification.role.clone(),
            )
        })
        .collect()
}

fn privacy_context_role(path: &str, classifier_role: Option<&str>) -> String {
    let normalized = normalize_repo_path(path);
    let filename = normalized
        .rsplit('/')
        .next()
        .unwrap_or(&normalized)
        .to_lowercase();
    if classifier_role == Some("generated_reference") {
        return "generated_reference".to_string();
    }
    if filename.ends_with(".example")
        || filename.contains(".example.")
        || matches!(filename.as_str(), "readme.md" | "readme" | "changelog.md")
        || matches!(normalized.rsplit('.').next(), Some("md" | "mdx"))
    {
        return "example_documentation".to_string();
    }
    if is_env_file(&normalized) || classifier_role == Some("source_of_truth_config") {
        return "sensitive_environment_configuration".to_string();
    }
    "authored_source".to_string()
}

/// Builds a lightweight import/dependency graph from deterministic source text patterns.

pub(super) fn ambiguity_count(text: &str) -> usize {
    AMBIGUITY_PATTERNS
        .iter()
        .map(|(pattern, _)| text.matches(pattern).count())
        .sum()
}

/// Flags central-looking files whose changes may affect a wider part of the app.

fn count_secret_candidates(text: &str) -> usize {
    text.lines()
        .filter(|line| {
            let lowered = line.trim().to_lowercase();
            if lowered.starts_with("//") || lowered.starts_with('#') || lowered.len() < 12 {
                return false;
            }
            let has_assignment = lowered.contains('=') || lowered.contains(':');
            let has_secret_word = lowered.contains("api_key")
                || lowered.contains("apikey")
                || lowered.contains("secret")
                || lowered.contains("access_token")
                || lowered.contains("auth_token")
                || lowered.contains("private_key")
                || lowered.contains("password");
            has_assignment && has_secret_word
                || line.contains("BEGIN PRIVATE KEY")
                || line.contains("BEGIN OPENSSH KEY")
                || line.contains("BEGIN RSA PRIVATE KEY")
        })
        .count()
}

/// Counts localhost, private IP, and internal-domain signals that should stay local-first.
fn count_private_urls(text: &str) -> usize {
    [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        ".internal",
        "intranet",
        "http://10.",
        "https://10.",
        "http://192.168.",
        "https://192.168.",
        "http://172.16.",
        "https://172.16.",
    ]
    .iter()
    .map(|needle| text.matches(needle).count())
    .sum()
}
