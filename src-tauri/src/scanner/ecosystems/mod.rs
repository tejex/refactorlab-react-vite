use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value;

use crate::report::{
    AnalyzerCoverage, EntrypointFact, PackageScopeFact, TechnologyFact, VerificationSignals,
};

use super::graph::normalize_repo_path;
use super::verification::{detect_package_manager, detect_verification};
use super::RawFile;

const ANALYZER_ID: &str = "javascript-package";
const ANALYZER_VERSION: &str = "1.1";
const MAX_MANIFESTS: usize = 64;
const MAX_SCRIPTS_PER_MANIFEST: usize = 200;
const MAX_SCRIPT_BYTES: usize = 4096;

pub(super) struct RepositoryIndex<'a> {
    pub(super) files: &'a [RawFile],
    pub(super) has_ci_config: bool,
}

#[derive(Default)]
pub(super) struct EcosystemAnalysis {
    pub(super) package_scopes: Vec<PackageScopeFact>,
    pub(super) verification: VerificationSignals,
    pub(super) entrypoints: Vec<EntrypointFact>,
    pub(super) technologies: Vec<TechnologyFact>,
    pub(super) coverage: Vec<AnalyzerCoverage>,
}

pub(super) trait EcosystemAnalyzer {
    fn analyze(&self, index: &RepositoryIndex<'_>) -> EcosystemAnalysis;
}

pub(super) struct JavaScriptPackageAnalyzer;

impl EcosystemAnalyzer for JavaScriptPackageAnalyzer {
    fn analyze(&self, index: &RepositoryIndex<'_>) -> EcosystemAnalysis {
        let mut analysis = EcosystemAnalysis {
            verification: detect_verification(index.files, index.has_ci_config),
            ..EcosystemAnalysis::default()
        };
        let known_paths = index
            .files
            .iter()
            .map(|file| normalize_repo_path(&file.path))
            .collect::<BTreeSet<_>>();

        for manifest in index
            .files
            .iter()
            .filter(|file| file.path == "package.json" || file.path.ends_with("/package.json"))
            .take(MAX_MANIFESTS)
        {
            let Ok(value) = serde_json::from_str::<Value>(&manifest.text) else {
                continue;
            };
            let scope = package_scope(manifest, &value, index.files, &known_paths);
            analysis
                .entrypoints
                .extend(html_entrypoints(&scope, index.files, &known_paths));
            analysis
                .entrypoints
                .extend(script_entrypoints(&scope, &value, &known_paths));
            analysis
                .technologies
                .extend(technology_facts(&scope, &value, index.files));
            analysis.package_scopes.push(scope);
        }

        analysis.package_scopes.sort_by(|a, b| a.id.cmp(&b.id));
        analysis.entrypoints.sort_by(|a, b| {
            a.path
                .cmp(&b.path)
                .then_with(|| a.kind.cmp(&b.kind))
                .then_with(|| a.evidence_source.cmp(&b.evidence_source))
        });
        analysis.entrypoints.dedup_by(|a, b| {
            a.path == b.path && a.kind == b.kind && a.evidence_source == b.evidence_source
        });
        analysis.technologies.sort_by(|a, b| {
            a.package_scope_id
                .cmp(&b.package_scope_id)
                .then_with(|| a.name.cmp(&b.name))
        });
        analysis.coverage = coverage(index.files, &analysis.package_scopes);
        analysis
    }
}

fn package_scope(
    manifest: &RawFile,
    value: &Value,
    files: &[RawFile],
    known_paths: &BTreeSet<String>,
) -> PackageScopeFact {
    let manifest_path = normalize_repo_path(&manifest.path);
    let directory = manifest_path
        .rsplit_once('/')
        .map(|(directory, _)| directory)
        .unwrap_or("")
        .to_string();
    let package_name = value
        .get("name")
        .and_then(Value::as_str)
        .and_then(safe_package_name);
    let declared_entry = value
        .get("main")
        .and_then(Value::as_str)
        .and_then(safe_repository_reference);
    let declared_entry_exists = declared_entry.as_ref().map(|entry| {
        let path = join_scope_path(&directory, entry);
        known_paths.contains(&path)
    });
    let mut dependency_ids = ["dependencies", "devDependencies", "peerDependencies"]
        .into_iter()
        .filter_map(|key| value.get(key).and_then(Value::as_object))
        .flat_map(|dependencies| dependencies.keys().cloned())
        .collect::<Vec<_>>();
    dependency_ids.sort();
    dependency_ids.dedup();

    PackageScopeFact {
        id: manifest_path.clone(),
        display_name: package_name.clone().unwrap_or_else(|| {
            if directory.is_empty() {
                "Root package".to_string()
            } else {
                directory
                    .rsplit('/')
                    .next()
                    .unwrap_or("Package")
                    .to_string()
            }
        }),
        package_name,
        manifest_path: manifest_path.clone(),
        directory,
        ecosystem: "javascript".to_string(),
        package_manager: detect_package_manager(&manifest_path, value, files),
        workspace_declared: value.get("workspaces").is_some(),
        declared_entry,
        declared_entry_exists,
        dependency_ids,
    }
}

fn html_entrypoints(
    scope: &PackageScopeFact,
    files: &[RawFile],
    known_paths: &BTreeSet<String>,
) -> Vec<EntrypointFact> {
    let mut entrypoints = Vec::new();
    for html in files
        .iter()
        .filter(|file| file.extension == "html" && path_is_in_scope(&file.path, &scope.directory))
    {
        for source in html_module_sources(&html.text) {
            let candidate = if source.starts_with('/') {
                join_scope_path(&scope.directory, source.trim_start_matches('/'))
            } else {
                let directory = html.path.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("");
                normalize_join(directory, &source)
            };
            if known_paths.contains(&candidate) {
                entrypoints.push(EntrypointFact {
                    path: candidate,
                    package_scope_id: scope.id.clone(),
                    kind: "frontend".to_string(),
                    evidence_type: "html_module_script".to_string(),
                    evidence_source: normalize_repo_path(&html.path),
                    proof_level: "confirmed".to_string(),
                    reason: format!("referenced by `{}`", normalize_repo_path(&html.path)),
                });
            }
        }
    }
    entrypoints
}

fn script_entrypoints(
    scope: &PackageScopeFact,
    value: &Value,
    known_paths: &BTreeSet<String>,
) -> Vec<EntrypointFact> {
    let mut entrypoints = Vec::new();
    let Some(scripts) = value.get("scripts").and_then(Value::as_object) else {
        return entrypoints;
    };
    for (script_name, body) in scripts.iter().take(MAX_SCRIPTS_PER_MANIFEST) {
        let Some(body) = body.as_str() else { continue };
        let bounded = &body[..body.floor_char_boundary(body.len().min(MAX_SCRIPT_BYTES))];
        for candidate in launched_source_paths(bounded) {
            let candidate = join_scope_path(&scope.directory, &candidate);
            if known_paths.contains(&candidate) {
                entrypoints.push(EntrypointFact {
                    path: candidate,
                    package_scope_id: scope.id.clone(),
                    kind: "server".to_string(),
                    evidence_type: "package_script_launcher".to_string(),
                    evidence_source: format!("{}#scripts.{}", scope.manifest_path, script_name),
                    proof_level: "confirmed".to_string(),
                    reason: format!("executed by the `{script_name}` package script"),
                });
            }
        }
    }
    entrypoints
}

fn technology_facts(
    scope: &PackageScopeFact,
    value: &Value,
    files: &[RawFile],
) -> Vec<TechnologyFact> {
    let mappings = [
        ("express", "Express", None),
        ("@prisma/client", "Prisma", None),
        ("prisma", "Prisma", None),
        ("groq-sdk", "Groq SDK", None),
        ("zod", "Zod", None),
        ("react", "React", None),
        ("vite", "Vite", Some("build tooling")),
        ("react-router", "React Router", None),
        ("react-router-dom", "React Router", None),
        ("@mui/material", "Material UI", None),
        ("antd", "Ant Design", None),
        ("axios", "Axios", None),
        ("typescript", "TypeScript", None),
    ];
    let mut dependencies = BTreeMap::new();
    for (key, group) in [
        ("dependencies", "direct dependency"),
        ("devDependencies", "direct development dependency"),
    ] {
        if let Some(items) = value.get(key).and_then(Value::as_object) {
            for (identifier, version) in items {
                dependencies
                    .entry(identifier.as_str())
                    .or_insert_with(|| (version.as_str().map(str::to_string), group.to_string()));
            }
        }
    }
    let mut by_name: BTreeMap<String, TechnologyFact> = BTreeMap::new();
    for (identifier, name, role) in mappings {
        let Some((version, dependency_group)) = dependencies.get(identifier) else {
            continue;
        };
        let detail = role
            .map(|role| format!("{dependency_group} and {role}"))
            .unwrap_or_else(|| dependency_group.clone());
        let fact = by_name
            .entry(name.to_string())
            .or_insert_with(|| TechnologyFact {
                package_scope_id: scope.id.clone(),
                identifier: identifier.to_string(),
                name: name.to_string(),
                declared_version: version.as_deref().and_then(safe_declared_version),
                details: Vec::new(),
                evidence_sources: vec![scope.manifest_path.clone()],
            });
        if !fact.details.contains(&detail) {
            fact.details.push(detail);
        }
    }
    if value.get("type").and_then(Value::as_str) == Some("module") {
        by_name.insert(
            "ES modules".to_string(),
            TechnologyFact {
                package_scope_id: scope.id.clone(),
                identifier: "package.json#type".to_string(),
                name: "ES modules".to_string(),
                declared_version: None,
                details: vec!["declared by package manifest".to_string()],
                evidence_sources: vec![scope.manifest_path.clone()],
            },
        );
    }
    if let Some(provider) = prisma_provider(files) {
        if let Some(prisma) = by_name.get_mut("Prisma") {
            prisma
                .details
                .push(format!("{provider} provider detected from Prisma schema"));
            prisma
                .evidence_sources
                .push("prisma/schema.prisma".to_string());
        }
    }
    by_name.into_values().collect()
}

fn prisma_provider(files: &[RawFile]) -> Option<String> {
    let schema = files
        .iter()
        .find(|file| file.path == "prisma/schema.prisma")?;
    let mut in_datasource = false;
    for line in schema.text.lines().take(500) {
        let trimmed = line.trim();
        if trimmed.starts_with("datasource ") && trimmed.ends_with('{') {
            in_datasource = true;
            continue;
        }
        if in_datasource && trimmed.starts_with('}') {
            break;
        }
        if in_datasource && trimmed.starts_with("provider") {
            let value = trimmed.split_once('=')?.1.trim().trim_matches(['\'', '"']);
            return safe_provider_name(value);
        }
    }
    None
}

fn safe_provider_name(provider: &str) -> Option<String> {
    match provider {
        "sqlite" => Some("SQLite".to_string()),
        "postgresql" | "postgres" => Some("PostgreSQL".to_string()),
        "mysql" => Some("MySQL".to_string()),
        "sqlserver" => Some("SQL Server".to_string()),
        "mongodb" => Some("MongoDB".to_string()),
        "cockroachdb" => Some("CockroachDB".to_string()),
        _ => None,
    }
}

fn safe_package_name(value: &str) -> Option<String> {
    (!value.is_empty()
        && value.len() <= 214
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '@' | '/' | '_' | '-' | '.')
        }))
    .then(|| value.to_string())
}

fn safe_repository_reference(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let absolute = value.starts_with('/')
        || value.starts_with("\\\\")
        || value.starts_with("file://")
        || value.contains("://")
        || (bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && matches!(bytes[2], b'/' | b'\\'));
    (!absolute && !value.contains('\0') && value.len() <= 512).then(|| value.to_string())
}

fn safe_declared_version(value: &str) -> Option<String> {
    let unsafe_value = value.contains("://")
        || value.starts_with("git@")
        || value.starts_with("file:")
        || value.contains("/Users/")
        || value.contains("\\Users\\");
    (!unsafe_value && value.len() <= 128).then(|| value.to_string())
}

fn coverage(files: &[RawFile], package_scopes: &[PackageScopeFact]) -> Vec<AnalyzerCoverage> {
    let js_count = files.iter().filter(|file| is_js_source(file)).count();
    let entrypoint_evidence_files = if package_scopes.is_empty() {
        0
    } else {
        package_scopes.len()
            + files
                .iter()
                .filter(|file| {
                    file.extension == "html"
                        && package_scopes
                            .iter()
                            .any(|scope| path_is_in_scope(&file.path, &scope.directory))
                })
                .count()
    };
    let mut excluded = files
        .iter()
        .filter(|file| !is_js_source(file) && file.extension != "json")
        .map(|file| file.language.clone())
        .collect::<Vec<_>>();
    excluded.sort();
    excluded.dedup();
    let status = if js_count == 0 {
        "not_applicable"
    } else {
        "partial"
    };
    let mut rows = vec![
        AnalyzerCoverage {
            analyzer_id: ANALYZER_ID.to_string(),
            analyzer_version: ANALYZER_VERSION.to_string(),
            capability: "package commands".to_string(),
            status: if !package_scopes.is_empty() {
                "complete"
            } else {
                "not_applicable"
            }
            .to_string(),
            analyzed_file_count: package_scopes.len(),
            analyzed_languages: vec!["package.json".to_string()],
            excluded_languages: Vec::new(),
            limitations: vec!["bounded npm-family manifest script analysis".to_string()],
        },
        AnalyzerCoverage {
            analyzer_id: "javascript-entrypoints".to_string(),
            analyzer_version: ANALYZER_VERSION.to_string(),
            capability: "entrypoint evidence".to_string(),
            status: if entrypoint_evidence_files > 0 {
                "partial"
            } else {
                "not_applicable"
            }
            .to_string(),
            analyzed_file_count: entrypoint_evidence_files,
            analyzed_languages: vec![
                "package.json scripts".to_string(),
                "HTML module scripts".to_string(),
            ],
            excluded_languages: Vec::new(),
            limitations: vec![
                "supported package-script launchers and HTML module references only".to_string(),
            ],
        },
        AnalyzerCoverage {
            analyzer_id: "javascript-typescript-imports".to_string(),
            analyzer_version: ANALYZER_VERSION.to_string(),
            capability: "JavaScript/TypeScript import candidates".to_string(),
            status: status.to_string(),
            analyzed_file_count: js_count,
            analyzed_languages: vec!["JavaScript".to_string(), "TypeScript".to_string()],
            excluded_languages: excluded,
            limitations: vec![
                "supported static, re-export, require, and dynamic-import syntax only".to_string(),
            ],
        },
    ];
    for (extension, language) in [("py", "Python"), ("rs", "Rust")] {
        let count = files
            .iter()
            .filter(|file| file.extension == extension)
            .count();
        if count > 0 && js_count == 0 && package_scopes.is_empty() {
            rows.push(AnalyzerCoverage {
                analyzer_id: format!("{}-ecosystem", language.to_lowercase()),
                analyzer_version: ANALYZER_VERSION.to_string(),
                capability: "commands, entrypoints, and import graph".to_string(),
                status: "unsupported".to_string(),
                analyzed_file_count: 0,
                analyzed_languages: Vec::new(),
                excluded_languages: vec![language.to_string()],
                limitations: vec![format!("{language} semantic analysis is not implemented")],
            });
        }
    }
    rows
}

pub(super) fn is_js_source(file: &RawFile) -> bool {
    matches!(
        file.extension.as_str(),
        "astro" | "js" | "jsx" | "mjs" | "cjs" | "svelte" | "ts" | "tsx" | "vue"
    )
}

fn html_module_sources(text: &str) -> Vec<String> {
    text.split("<script")
        .skip(1)
        .take(100)
        .filter_map(|tag| {
            let head = tag.split('>').next()?;
            if !head.contains("type=\"module\"") && !head.contains("type='module'") {
                return None;
            }
            attribute_value(head, "src")
        })
        .collect()
}

fn attribute_value(tag: &str, name: &str) -> Option<String> {
    for quote in ['"', '\''] {
        let marker = format!("{name}={quote}");
        if let Some(start) = tag.find(&marker) {
            let value = &tag[start + marker.len()..];
            return value.split(quote).next().map(str::to_string);
        }
    }
    None
}

fn launched_source_paths(body: &str) -> Vec<String> {
    let tokens = body
        .split(|character: char| {
            character.is_whitespace()
                || matches!(character, '\'' | '"' | ';' | '&' | '|' | '(' | ')')
        })
        .filter(|token| !token.is_empty())
        .collect::<Vec<_>>();
    let launchers = ["node", "tsx", "ts-node", "ts-node-dev", "node-dev"];
    tokens
        .windows(2)
        .filter_map(|window| {
            launchers
                .contains(&window[0])
                .then_some(window[1].trim_start_matches("./"))
                .filter(|path| {
                    matches!(
                        path.rsplit('.').next(),
                        Some("js" | "jsx" | "mjs" | "cjs" | "ts" | "tsx")
                    )
                })
                .map(str::to_string)
        })
        .collect()
}

fn path_is_in_scope(path: &str, directory: &str) -> bool {
    if directory.is_empty() {
        !path.contains('/')
    } else {
        path.starts_with(&format!("{directory}/"))
    }
}

fn join_scope_path(directory: &str, path: &str) -> String {
    normalize_join(directory, path.trim_start_matches("./"))
}

fn normalize_join(directory: &str, path: &str) -> String {
    let combined = if directory.is_empty() {
        path.to_string()
    } else {
        format!("{directory}/{path}")
    };
    let mut parts = Vec::new();
    let normalized = combined.replace('\\', "/");
    for part in normalized.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            value => parts.push(value),
        }
    }
    parts.join("/")
}
