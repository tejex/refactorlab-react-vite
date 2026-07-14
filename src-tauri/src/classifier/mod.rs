use serde::Deserialize;
use serde_json::Value;

use crate::report::{
    ClassificationTotals, ClassifiedFile, ContextClassification, ContextSummary,
    ContextSummaryFile, FileClassification,
};

const CLASSIFIER_RULES_JSON: &str = include_str!("rules.json");

pub struct FileClassifier {
    registry: RuleRegistry,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuleRegistry {
    version: String,
    rules: Vec<ClassifierRule>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClassifierRule {
    id: String,
    role: String,
    context_policy: String,
    confidence: f32,
    reason: String,
    #[serde(rename = "match")]
    matcher: RuleMatcher,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuleMatcher {
    #[serde(default)]
    filename_any: Vec<String>,
    #[serde(default)]
    filename_starts_with_any: Vec<String>,
    #[serde(default)]
    filename_ends_with_any: Vec<String>,
    #[serde(default)]
    extension_any: Vec<String>,
    #[serde(default)]
    path_segment_any: Vec<String>,
    #[serde(default)]
    path_contains_any: Vec<String>,
    #[serde(default)]
    header_contains_any: Vec<String>,
}

pub struct FileClassificationInput<'a> {
    pub path: &'a str,
    pub extension: &'a str,
    pub language: &'a str,
    pub text: &'a str,
    pub estimated_tokens: usize,
    pub line_count: usize,
    pub size_bytes: u64,
}

impl FileClassifier {
    pub fn bundled() -> Self {
        let registry = serde_json::from_str::<RuleRegistry>(CLASSIFIER_RULES_JSON)
            .expect("bundled classifier rules should be valid JSON");
        Self { registry }
    }

    pub fn classify_files<'a, I>(&self, files: I) -> ContextClassification
    where
        I: IntoIterator<Item = FileClassificationInput<'a>>,
    {
        let mut classified = Vec::new();
        let mut summary_seeds = Vec::new();

        for file in files {
            let classified_file = self.classify_file(&file);
            summary_seeds.push(SummarySeed {
                path: classified_file.path.clone(),
                role: classified_file.classification.role.clone(),
                context_policy: classified_file.classification.context_policy.clone(),
                estimated_tokens: classified_file.estimated_tokens,
                reason: classified_file
                    .classification
                    .reasons
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "no classifier reason emitted".to_string()),
                package_count: package_lock_count(file.path, file.text),
            });
            classified.push(classified_file);
        }

        classified.sort_by(|a, b| a.path.cmp(&b.path));

        let totals = classification_totals(&classified);
        let summaries = context_summaries(&summary_seeds);

        ContextClassification {
            version: self.registry.version.clone(),
            totals,
            summaries,
            files: classified,
        }
    }

    fn classify_file(&self, file: &FileClassificationInput<'_>) -> ClassifiedFile {
        let mut matches = self
            .registry
            .rules
            .iter()
            .filter(|rule| rule.matches(&file))
            .collect::<Vec<_>>();
        matches.sort_by(|a, b| {
            b.confidence
                .partial_cmp(&a.confidence)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.id.cmp(&b.id))
        });

        let classification = matches
            .first()
            .map(|rule| FileClassification {
                role: rule.role.clone(),
                context_policy: rule.context_policy.clone(),
                confidence: rule.confidence,
                reasons: vec![format!("{}: {}", rule.id, rule.reason)],
            })
            .unwrap_or_else(|| fallback_classification(&file));

        ClassifiedFile {
            path: file.path.to_string(),
            language: file.language.to_string(),
            estimated_tokens: file.estimated_tokens,
            line_count: file.line_count,
            size_bytes: file.size_bytes,
            classification,
        }
    }
}

#[derive(Debug, Clone)]
struct SummarySeed {
    path: String,
    role: String,
    context_policy: String,
    estimated_tokens: usize,
    reason: String,
    package_count: Option<usize>,
}

impl ClassifierRule {
    fn matches(&self, file: &FileClassificationInput<'_>) -> bool {
        self.matcher.matches(file)
    }
}

impl RuleMatcher {
    fn matches(&self, file: &FileClassificationInput<'_>) -> bool {
        let filename = filename(file.path);
        let path_lower = file.path.to_lowercase();
        let filename_lower = filename.to_lowercase();
        let extension_lower = file.extension.to_lowercase();
        let header_lower = file
            .text
            .lines()
            .take(12)
            .collect::<Vec<_>>()
            .join("\n")
            .to_lowercase();

        any_match(&self.filename_any, |value| filename_lower == value)
            || any_match(&self.filename_starts_with_any, |value| {
                filename_lower.starts_with(value)
            })
            || any_match(&self.filename_ends_with_any, |value| {
                filename_lower.ends_with(value)
            })
            || any_match(&self.extension_any, |value| extension_lower == value)
            || any_match(&self.path_segment_any, |value| {
                path_lower.split('/').any(|segment| segment == value)
            })
            || any_match(&self.path_contains_any, |value| path_lower.contains(value))
            || any_match(&self.header_contains_any, |value| {
                header_lower.contains(value)
            })
    }
}

fn fallback_classification(file: &FileClassificationInput<'_>) -> FileClassification {
    if authored_source_extension(file.extension) {
        return FileClassification {
            role: "authored_source".to_string(),
            context_policy: "include_full".to_string(),
            confidence: 0.62,
            reasons: vec![
                "fallback: source-like extension with no generated/dependency signal".to_string(),
            ],
        };
    }

    FileClassification {
        role: "unknown_source".to_string(),
        context_policy: "include_if_task_relevant".to_string(),
        confidence: 0.45,
        reasons: vec!["fallback: no classifier rule matched".to_string()],
    }
}

fn classification_totals(files: &[ClassifiedFile]) -> ClassificationTotals {
    let mut totals = ClassificationTotals::default();

    for file in files {
        let tokens = file.estimated_tokens;
        totals.total_readable_tokens += tokens;

        if include_in_default_context(&file.classification) {
            totals.default_ai_context_tokens += tokens;
            totals.default_ai_context_files += 1;
        }

        match file.classification.role.as_str() {
            "authored_source" => {
                totals.authored_source_tokens += tokens;
                totals.authored_source_files += 1;
            }
            "source_of_truth_config" => {
                totals.source_of_truth_config_tokens += tokens;
                totals.source_of_truth_config_files += 1;
            }
            "generated_reference" => {
                totals.generated_reference_tokens += tokens;
                totals.generated_reference_files += 1;
            }
            "dependency_lockfile" => {
                totals.dependency_lockfile_tokens += tokens;
                totals.dependency_lockfile_files += 1;
            }
            "build_output" => {
                totals.build_output_tokens += tokens;
                totals.build_output_files += 1;
            }
            "vendored_dependency" => {
                totals.vendored_dependency_tokens += tokens;
                totals.vendored_dependency_files += 1;
            }
            "runtime_data" => {
                totals.runtime_data_tokens += tokens;
                totals.runtime_data_files += 1;
            }
            _ => {
                totals.unknown_source_tokens += tokens;
                totals.unknown_source_files += 1;
            }
        }
    }

    totals
}

fn context_summaries(seeds: &[SummarySeed]) -> Vec<ContextSummary> {
    let mut summaries = Vec::new();

    if let Some(summary) = summary_for_role(
        seeds,
        "dependency_lockfile",
        "Dependency Lockfiles",
        "Dependency resolution artifacts summarized from lockfiles.",
    ) {
        summaries.push(summary);
    }

    if let Some(summary) = summary_for_role(
        seeds,
        "generated_reference",
        "Generated Reference Output",
        "Generated/reference files summarized instead of passed as full default context.",
    ) {
        summaries.push(summary);
    }

    if let Some(summary) = summary_for_role(
        seeds,
        "runtime_data",
        "Runtime Data",
        "Runtime or local environment files excluded from AI-eligible repository context.",
    ) {
        summaries.push(summary);
    }

    summaries
}

fn summary_for_role(
    seeds: &[SummarySeed],
    role: &str,
    title: &str,
    intro: &str,
) -> Option<ContextSummary> {
    let mut matching = seeds
        .iter()
        .filter(|seed| seed.role == role)
        .collect::<Vec<_>>();
    if matching.is_empty() {
        return None;
    }

    matching.sort_by(|a, b| {
        b.estimated_tokens
            .cmp(&a.estimated_tokens)
            .then_with(|| a.path.cmp(&b.path))
    });
    let total_tokens = matching.iter().map(|seed| seed.estimated_tokens).sum();
    let file_count = matching.len();
    let context_policy = matching
        .first()
        .map(|seed| seed.context_policy.clone())
        .unwrap_or_else(|| "include_summary".to_string());
    let mut details = vec![intro.to_string()];
    let package_total = matching
        .iter()
        .filter_map(|seed| seed.package_count)
        .sum::<usize>();
    if package_total > 0 {
        details.push(format!(
            "Approximate resolved package entries: {}",
            package_total
        ));
    }
    if role == "generated_reference" {
        details.push(format!(
            "Top generated root: {}",
            top_path_root(&matching[0].path)
        ));
    }

    Some(ContextSummary {
        id: role.replace('_', "-"),
        title: title.to_string(),
        role: role.to_string(),
        context_policy,
        total_tokens,
        file_count,
        source_paths: source_paths_for_summary(seeds, role),
        top_files: matching
            .into_iter()
            .take(8)
            .map(|seed| ContextSummaryFile {
                path: seed.path.clone(),
                estimated_tokens: seed.estimated_tokens,
                reason: seed.reason.clone(),
            })
            .collect(),
        details,
    })
}

fn source_paths_for_summary(seeds: &[SummarySeed], role: &str) -> Vec<String> {
    let mut paths = seeds
        .iter()
        .filter(|seed| seed.role == "source_of_truth_config")
        .filter(|seed| {
            role != "dependency_lockfile"
                || seed.path.rsplit('/').next().unwrap_or(seed.path.as_str()) == "package.json"
        })
        .map(|seed| seed.path.clone())
        .collect::<Vec<_>>();
    paths.sort();
    paths.dedup();
    paths.truncate(8);
    paths
}

fn top_path_root(path: &str) -> String {
    let parts = path.split('/').collect::<Vec<_>>();
    if let Some(index) = parts
        .iter()
        .position(|part| matches!(*part, "generated" | "__generated__" | "gen" | "codegen"))
    {
        return parts[..=index].join("/");
    }

    parts.into_iter().take(2).collect::<Vec<_>>().join("/")
}

fn package_lock_count(path: &str, text: &str) -> Option<usize> {
    if path.rsplit('/').next()? != "package-lock.json" {
        return None;
    }

    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return None;
    };

    value
        .get("packages")
        .and_then(Value::as_object)
        .map(|packages| packages.len())
        .or_else(|| {
            value
                .get("dependencies")
                .and_then(Value::as_object)
                .map(|dependencies| dependencies.len())
        })
}

fn any_match<F>(values: &[String], mut predicate: F) -> bool
where
    F: FnMut(&str) -> bool,
{
    values
        .iter()
        .map(|value| value.to_lowercase())
        .any(|value| predicate(&value))
}

fn filename(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn authored_source_extension(extension: &str) -> bool {
    matches!(
        extension,
        "astro"
            | "c"
            | "cpp"
            | "cs"
            | "css"
            | "go"
            | "h"
            | "html"
            | "java"
            | "js"
            | "jsx"
            | "kt"
            | "md"
            | "php"
            | "py"
            | "rb"
            | "rs"
            | "scss"
            | "sh"
            | "sql"
            | "svelte"
            | "ts"
            | "tsx"
            | "vue"
            | "xml"
            | "yaml"
            | "yml"
    )
}

pub fn include_in_default_context(classification: &FileClassification) -> bool {
    matches!(
        classification.context_policy.as_str(),
        "include_full" | "include_if_task_relevant" | "include_in_default_context"
    )
}

#[cfg(test)]
mod tests;
