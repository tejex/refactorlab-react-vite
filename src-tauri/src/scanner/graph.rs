use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value;

use crate::report::{
    clamp_score, GraphFileSignal, PortabilitySignal, PortabilitySignals, RepoGraphSummary,
    UnresolvedImportSignal,
};

use super::ecosystems::is_js_source;
use super::RawFile;

pub(super) fn repo_graph(
    graph_files: &[RawFile],
    all_files: &[RawFile],
) -> (RepoGraphSummary, PortabilitySignals) {
    let known_paths = all_files
        .iter()
        .map(|file| normalize_repo_path(&file.path))
        .collect::<BTreeSet<_>>();
    let mut summary = RepoGraphSummary::default();
    let mut portability = PortabilitySignals::default();
    let mut adjacency: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut fan_in: BTreeMap<String, usize> = BTreeMap::new();
    let mut fan_out: BTreeMap<String, usize> = BTreeMap::new();
    let mut sensitive_by_file: BTreeMap<String, usize> = BTreeMap::new();

    let js_files = graph_files
        .iter()
        .filter(|file| is_js_source(file))
        .collect::<Vec<_>>();
    summary.analyzed_file_count = js_files.len();
    let package_directories = package_directories(all_files);

    for file in js_files.iter().copied() {
        let references = js_like_imports(&file.text);
        let mut local_static_fan_out = 0;

        for reference in references {
            if is_sensitive_module_ref(&reference.specifier) {
                summary.sensitive_module_refs += 1;
                *sensitive_by_file.entry(file.path.clone()).or_default() += 1;
            }
            if reference.dynamic {
                summary.dynamic_imports += 1;
                continue;
            }

            summary.static_module_references += 1;
            let typescript_substitution = typescript_js_substitution_enabled(&file.path, all_files);
            match classify_static_reference(
                file,
                &reference.specifier,
                &known_paths,
                &package_directories,
                typescript_substitution,
            ) {
                StaticReference::ResolvedLocal(resolved) => {
                    summary.resolved_local_static_references += 1;
                    summary.relative_imports +=
                        usize::from(is_relative_import(&reference.specifier));
                    local_static_fan_out += 1;
                    *fan_in.entry(resolved.clone()).or_default() += 1;
                    adjacency
                        .entry(file.path.clone())
                        .or_default()
                        .push(resolved);
                }
                StaticReference::ExternalPackage => {
                    summary.external_package_static_references += 1;
                }
                StaticReference::UnresolvedLocal => {
                    summary.unresolved_local_static_references += 1;
                    summary.relative_imports += 1;
                    if summary.unresolved_import_details.len() < 200 {
                        summary
                            .unresolved_import_details
                            .push(UnresolvedImportSignal {
                                source_path: normalize_repo_path(&file.path),
                                specifier: reference.specifier.replace('\\', "/"),
                            });
                    }
                }
                StaticReference::MachineSpecificAbsolute => {
                    summary.machine_specific_absolute_static_references += 1;
                    portability.machine_specific_absolute_imports += 1;
                    portability.file_signals.push(PortabilitySignal {
                        path: normalize_repo_path(&file.path),
                        category: "absolute local filesystem import".to_string(),
                        count: 1,
                    });
                }
                StaticReference::Other => summary.other_static_references += 1,
            }
        }
        fan_out.insert(file.path.clone(), local_static_fan_out);
    }

    summary.total_imports = summary.static_module_references + summary.dynamic_imports;
    summary.external_imports = summary.external_package_static_references;
    summary.resolved_imports = summary.resolved_local_static_references;
    summary.unresolved_imports = summary.unresolved_local_static_references;

    let circular_files = circular_import_files(&adjacency);
    summary.circular_import_files = circular_files.len();
    summary.max_fan_in = fan_in.values().copied().max().unwrap_or(0);
    summary.max_fan_out = fan_out.values().copied().max().unwrap_or(0);

    let mut hub_files = js_files
        .iter()
        .filter_map(|file| {
            let fan_in_count = fan_in.get(&file.path).copied().unwrap_or(0);
            let fan_out_count = fan_out.get(&file.path).copied().unwrap_or(0);
            let sensitive_count = sensitive_by_file.get(&file.path).copied().unwrap_or(0);
            let mut signals = Vec::new();

            if fan_in_count >= 5 {
                signals.push("high-fan-in".to_string());
            }
            if fan_out_count >= 10 {
                signals.push("high-fan-out".to_string());
            }
            if circular_files.contains(&file.path) {
                signals.push("circular-import".to_string());
            }
            if sensitive_count > 0 {
                signals.push("sensitive-module-reference".to_string());
            }
            if fan_in_count > 0 && fan_in_count == summary.max_fan_in {
                signals.push("highest-local-static-fan-in".to_string());
            }
            if fan_out_count > 0 && fan_out_count == summary.max_fan_out {
                signals.push("highest-local-static-fan-out".to_string());
            }

            (!signals.is_empty()).then(|| GraphFileSignal {
                path: normalize_repo_path(&file.path),
                fan_in: fan_in_count,
                fan_out: fan_out_count,
                signals,
            })
        })
        .collect::<Vec<_>>();

    hub_files.sort_by(|a, b| {
        let a_total = a.fan_in + a.fan_out;
        let b_total = b.fan_in + b.fan_out;
        b_total.cmp(&a_total).then_with(|| a.path.cmp(&b.path))
    });
    hub_files.truncate(8);
    summary.hub_files = hub_files;
    summary.unresolved_import_details.sort_by(|a, b| {
        a.source_path
            .cmp(&b.source_path)
            .then_with(|| a.specifier.cmp(&b.specifier))
    });
    summary
        .unresolved_import_details
        .dedup_by(|a, b| a.source_path == b.source_path && a.specifier == b.specifier);
    portability.file_signals.sort_by(|a, b| a.path.cmp(&b.path));
    let mut compacted = Vec::<PortabilitySignal>::new();
    for signal in portability.file_signals {
        if let Some(existing) = compacted
            .iter_mut()
            .find(|existing| existing.path == signal.path && existing.category == signal.category)
        {
            existing.count += signal.count;
        } else {
            compacted.push(signal);
        }
    }
    portability.file_signals = compacted;
    (summary, portability)
}

struct ModuleReference {
    specifier: String,
    dynamic: bool,
}

enum StaticReference {
    ResolvedLocal(String),
    ExternalPackage,
    UnresolvedLocal,
    MachineSpecificAbsolute,
    Other,
}

fn js_like_imports(text: &str) -> Vec<ModuleReference> {
    let mut imports = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("//") || trimmed.starts_with("/*") {
            continue;
        }

        if (trimmed.starts_with("import ") || trimmed.starts_with("export "))
            && trimmed.contains(" from ")
        {
            if let Some(index) = trimmed.find(" from ") {
                push_quoted(&mut imports, &trimmed[index + 6..], false);
            }
        } else if trimmed.starts_with("import ") && !trimmed.starts_with("import(") {
            push_quoted(&mut imports, trimmed, false);
        }

        if let Some(specifier) = quoted_after(trimmed, "require(") {
            imports.push(ModuleReference {
                specifier,
                dynamic: false,
            });
        }
        if let Some(specifier) = quoted_after(trimmed, "import(") {
            imports.push(ModuleReference {
                specifier,
                dynamic: true,
            });
        }
    }

    imports
}

fn push_quoted(imports: &mut Vec<ModuleReference>, value: &str, dynamic: bool) {
    if let Some(specifier) = first_quoted(value) {
        imports.push(ModuleReference { specifier, dynamic });
    }
}

fn quoted_after(value: &str, marker: &str) -> Option<String> {
    value
        .find(marker)
        .and_then(|index| first_quoted(&value[index + marker.len()..]))
}

fn first_quoted(value: &str) -> Option<String> {
    let mut chars = value.char_indices();
    while let Some((start, quote)) = chars.next() {
        if quote != '\'' && quote != '"' {
            continue;
        }
        let content_start = start + quote.len_utf8();
        let rest = &value[content_start..];
        let Some(end) = rest.find(quote) else {
            continue;
        };
        return Some(rest[..end].to_string());
    }
    None
}

fn is_relative_import(specifier: &str) -> bool {
    specifier.starts_with("./")
        || specifier.starts_with("../")
        || specifier.starts_with(".\\")
        || specifier.starts_with("..\\")
}

fn classify_static_reference(
    file: &RawFile,
    specifier: &str,
    known_paths: &BTreeSet<String>,
    package_directories: &[String],
    typescript_substitution: bool,
) -> StaticReference {
    if is_machine_specific_absolute(specifier) {
        return StaticReference::MachineSpecificAbsolute;
    }
    if is_relative_import(specifier) {
        return resolve_relative_import(
            &file.path,
            specifier,
            known_paths,
            typescript_substitution,
        )
        .map(StaticReference::ResolvedLocal)
        .unwrap_or(StaticReference::UnresolvedLocal);
    }
    if specifier.starts_with('/') {
        let scope = nearest_package_directory(&file.path, package_directories);
        let rooted = normalize_import_path(scope, specifier.trim_start_matches('/'));
        return resolve_candidate(&rooted, known_paths, typescript_substitution)
            .map(StaticReference::ResolvedLocal)
            .unwrap_or(StaticReference::UnresolvedLocal);
    }
    if specifier.starts_with("http://")
        || specifier.starts_with("https://")
        || specifier.starts_with("data:")
    {
        return StaticReference::Other;
    }
    StaticReference::ExternalPackage
}

fn is_machine_specific_absolute(specifier: &str) -> bool {
    if specifier.starts_with("file://")
        || specifier.starts_with("\\\\")
        || specifier.starts_with("//")
    {
        return true;
    }
    let bytes = specifier.as_bytes();
    if bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'/' | b'\\')
    {
        return true;
    }
    if !specifier.starts_with('/') {
        return false;
    }
    let first = specifier
        .trim_start_matches('/')
        .split('/')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    !matches!(
        first.as_str(),
        "src" | "app" | "lib" | "components" | "pages" | "assets" | "public"
    )
}

fn package_directories(files: &[RawFile]) -> Vec<String> {
    let mut directories = files
        .iter()
        .filter_map(|file| {
            (file.path == "package.json" || file.path.ends_with("/package.json")).then(|| {
                file.path
                    .rsplit_once('/')
                    .map(|(dir, _)| dir)
                    .unwrap_or("")
                    .to_string()
            })
        })
        .collect::<Vec<_>>();
    directories.sort_by_key(|directory| std::cmp::Reverse(directory.len()));
    directories
}

fn nearest_package_directory<'a>(path: &str, directories: &'a [String]) -> &'a str {
    directories
        .iter()
        .find(|directory| directory.is_empty() || path.starts_with(&format!("{directory}/")))
        .map(String::as_str)
        .unwrap_or("")
}

pub(super) fn resolve_relative_import(
    from_path: &str,
    specifier: &str,
    known_paths: &BTreeSet<String>,
    typescript_js_substitution: bool,
) -> Option<String> {
    let normalized_from = normalize_repo_path(from_path);
    let parent = normalized_from
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    let joined = normalize_import_path(parent, specifier);
    resolve_candidate(&joined, known_paths, typescript_js_substitution)
}

fn resolve_candidate(
    joined: &str,
    known_paths: &BTreeSet<String>,
    typescript_js_substitution: bool,
) -> Option<String> {
    let mut candidates = Vec::new();
    if typescript_js_substitution && joined.ends_with(".js") {
        let source_stem = joined.trim_end_matches(".js");
        candidates.extend([
            format!("{source_stem}.ts"),
            format!("{source_stem}.tsx"),
            format!("{source_stem}.d.ts"),
        ]);
    }
    candidates.push(joined.to_string());
    let extensions = [
        "ts", "tsx", "d.ts", "js", "jsx", "json", "css", "scss", "vue", "svelte", "astro",
    ];

    for extension in extensions {
        candidates.push(format!("{joined}.{extension}"));
    }
    for extension in extensions {
        candidates.push(format!("{joined}/index.{extension}"));
    }

    candidates
        .into_iter()
        .find(|candidate| known_paths.contains(candidate))
}

pub(super) fn typescript_js_substitution_enabled(from_path: &str, all_files: &[RawFile]) -> bool {
    let normalized_from = normalize_repo_path(from_path);
    let mut nearest_depth = None;
    let mut modes = BTreeSet::new();

    for file in all_files.iter().filter(|file| {
        let filename = file.path.rsplit('/').next().unwrap_or(&file.path);
        filename == "tsconfig.json"
            || (filename.starts_with("tsconfig.") && filename.ends_with(".json"))
    }) {
        let directory = file
            .path
            .rsplit_once('/')
            .map(|(path, _)| path)
            .unwrap_or("");
        if !directory.is_empty() && !normalized_from.starts_with(&format!("{directory}/")) {
            continue;
        }
        let depth = directory.split('/').filter(|part| !part.is_empty()).count();
        if nearest_depth.is_some_and(|nearest| depth < nearest) {
            continue;
        }
        let Some(value) = parse_jsonc_value(&file.text) else {
            continue;
        };
        let Some(mode) = value
            .get("compilerOptions")
            .and_then(|options| options.get("moduleResolution"))
            .and_then(Value::as_str)
            .map(str::to_lowercase)
        else {
            continue;
        };
        if nearest_depth.is_none_or(|nearest| depth > nearest) {
            nearest_depth = Some(depth);
            modes.clear();
        }
        modes.insert(mode);
    }

    !modes.is_empty()
        && modes.iter().all(|mode| {
            matches!(
                mode.as_str(),
                "bundler" | "node" | "node10" | "node16" | "nodenext"
            )
        })
}

fn parse_jsonc_value(text: &str) -> Option<Value> {
    serde_json::from_str(text).ok().or_else(|| {
        let without_comments = strip_jsonc_comments(text);
        let without_trailing_commas = strip_jsonc_trailing_commas(&without_comments);
        serde_json::from_str(&without_trailing_commas).ok()
    })
}

fn strip_jsonc_comments(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    let mut in_string = false;
    let mut escaped = false;

    while let Some(character) = chars.next() {
        if in_string {
            output.push(character);
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
            continue;
        }

        if character == '"' {
            in_string = true;
            output.push(character);
            continue;
        }

        if character == '/' && chars.peek() == Some(&'/') {
            chars.next();
            for comment_character in chars.by_ref() {
                if comment_character == '\n' {
                    output.push('\n');
                    break;
                }
            }
            continue;
        }

        if character == '/' && chars.peek() == Some(&'*') {
            chars.next();
            let mut previous = '\0';
            for comment_character in chars.by_ref() {
                if comment_character == '\n' {
                    output.push('\n');
                }
                if previous == '*' && comment_character == '/' {
                    break;
                }
                previous = comment_character;
            }
            continue;
        }

        output.push(character);
    }

    output
}

fn strip_jsonc_trailing_commas(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    let mut in_string = false;
    let mut escaped = false;

    while let Some(character) = chars.next() {
        if in_string {
            output.push(character);
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
            continue;
        }

        if character == '"' {
            in_string = true;
            output.push(character);
            continue;
        }

        if character == ',' {
            let mut lookahead = chars.clone();
            let next_non_whitespace = lookahead.find(|next| !next.is_whitespace());
            if matches!(next_non_whitespace, Some('}' | ']')) {
                continue;
            }
        }

        output.push(character);
    }

    output
}

fn normalize_import_path(parent: &str, specifier: &str) -> String {
    let parent = normalize_repo_path(parent);
    let specifier = normalize_repo_path(specifier);
    let combined = if parent.is_empty() {
        specifier
    } else {
        format!("{parent}/{specifier}")
    };
    let mut parts = Vec::new();

    for part in combined.split('/') {
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

pub(super) fn normalize_repo_path(path: &str) -> String {
    path.replace('\\', "/")
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .collect::<Vec<_>>()
        .join("/")
}

fn circular_import_files(adjacency: &BTreeMap<String, Vec<String>>) -> BTreeSet<String> {
    let mut state = BTreeMap::new();
    let mut stack = Vec::new();
    let mut circular = BTreeSet::new();

    for node in adjacency.keys() {
        if state.get(node).copied().unwrap_or(0) == 0 {
            visit_import_node(node, adjacency, &mut state, &mut stack, &mut circular);
        }
    }

    circular
}

fn visit_import_node(
    node: &str,
    adjacency: &BTreeMap<String, Vec<String>>,
    state: &mut BTreeMap<String, u8>,
    stack: &mut Vec<String>,
    circular: &mut BTreeSet<String>,
) {
    state.insert(node.to_string(), 1);
    stack.push(node.to_string());

    if let Some(neighbors) = adjacency.get(node) {
        for neighbor in neighbors {
            match state.get(neighbor).copied().unwrap_or(0) {
                0 => visit_import_node(neighbor, adjacency, state, stack, circular),
                1 => {
                    if let Some(index) = stack.iter().position(|path| path == neighbor) {
                        for path in &stack[index..] {
                            circular.insert(path.clone());
                        }
                    }
                }
                _ => {}
            }
        }
    }

    stack.pop();
    state.insert(node.to_string(), 2);
}

fn is_sensitive_module_ref(specifier: &str) -> bool {
    let lowered = specifier.to_lowercase();
    lowered.contains("auth")
        || lowered.contains("secret")
        || lowered.contains("token")
        || lowered.contains("credential")
        || lowered.contains("password")
        || lowered.contains("env")
        || lowered.contains("config")
        || lowered.contains("api-key")
        || lowered.contains("apikey")
}

pub(super) fn graph_pressure(repo_graph: &RepoGraphSummary) -> f32 {
    clamp_score(
        repo_graph.max_fan_in as f32 / 5.0
            + repo_graph.max_fan_out as f32 / 8.0
            + repo_graph.circular_import_files as f32 * 0.9
            + repo_graph.unresolved_imports as f32 / 30.0
            + repo_graph.hub_files.len() as f32 * 0.35,
    )
}
