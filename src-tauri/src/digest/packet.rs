use std::collections::BTreeMap;

use crate::report::{ClassifiedFile, FileFindingSignal, RepoScanReport};

const REPOSITORY_PACKET_TITLE: &str = "# Repository Context";

/// Renders the user-facing packet directly from normalized deterministic report facts.
pub fn render_repository_packet(report: &RepoScanReport) -> String {
    let mut blocks = vec![REPOSITORY_PACKET_TITLE.to_string()];
    push_packet_section(
        &mut blocks,
        "Project Overview",
        project_overview_rows(report),
    );
    push_packet_section(&mut blocks, "Project Shape", project_shape_rows(report));
    push_packet_section(&mut blocks, "AI-Eligible Languages", language_rows(report));
    if let Some(block) = technology_stack_block(report) {
        blocks.push(block);
    }
    push_packet_section(
        &mut blocks,
        "Repository Structure",
        repository_structure_rows(report),
    );
    push_packet_section(
        &mut blocks,
        "Entrypoints and Important Files",
        important_file_rows(report),
    );
    if let Some(block) = command_block(report) {
        blocks.push(block);
    }
    push_packet_section(&mut blocks, "Import Analysis", import_graph_rows(report));
    push_packet_section(
        &mut blocks,
        "Unresolved Imports",
        unresolved_import_rows(report),
    );
    push_packet_section(&mut blocks, "Portability Signals", portability_rows(report));
    push_packet_section(&mut blocks, "Analysis Coverage", coverage_rows(report));
    if let Some(block) = finding_block(report) {
        blocks.push(block);
    }
    push_packet_section(
        &mut blocks,
        "Context Accounting",
        context_accounting_rows(report),
    );
    push_packet_section(
        &mut blocks,
        "Deterministic Repository Warnings",
        deterministic_warning_rows(report),
    );
    push_packet_section(&mut blocks, "Methodology", methodology_rows(report));
    format!("{}\n", blocks.join("\n\n"))
}

fn project_shape_rows(report: &RepoScanReport) -> Vec<String> {
    report
        .package_scopes
        .iter()
        .filter_map(|scope| {
            let manifest = packet_path(&scope.manifest_path)?;
            let location = if scope.directory.is_empty() {
                "root package"
            } else {
                "package scope"
            };
            let workspace = scope
                .workspace_declared
                .then_some("; workspace declaration present")
                .unwrap_or("");
            Some(format!(
                "- {} — `{manifest}` ({location}{workspace})",
                scope.display_name
            ))
        })
        .collect()
}

fn language_rows(report: &RepoScanReport) -> Vec<String> {
    let mut rows = vec![format!(
        "- Scope: {} AI-eligible repository files",
        report
            .context_classification
            .totals
            .default_ai_context_files
    )];
    rows.extend(report.languages.iter().map(|language| {
        format!(
            "- {} — {} files / {} tokens",
            language.language, language.files, language.estimated_tokens
        )
    }));
    rows
}

fn push_packet_section(blocks: &mut Vec<String>, title: &str, mut rows: Vec<String>) {
    rows.sort();
    rows.dedup();
    if !rows.is_empty() {
        blocks.push(format!("## {title}\n{}", rows.join("\n")));
    }
}

fn project_overview_rows(report: &RepoScanReport) -> Vec<String> {
    let mut rows = vec![format!("- Repository: {}", report.repo_name)];
    if !report.context_classification.files.is_empty() {
        rows.push(format!(
            "- Scanned text files: {}",
            report.context_classification.files.len()
        ));
    }
    if !report.languages.is_empty() {
        let mut languages = report
            .languages
            .iter()
            .map(|language| language.language.as_str())
            .collect::<Vec<_>>();
        languages.sort();
        languages.dedup();
        rows.push(format!("- AI-eligible languages: {}", languages.join(", ")));
    }
    rows
}

fn technology_stack_block(report: &RepoScanReport) -> Option<String> {
    let mut scopes = report.package_scopes.iter().collect::<Vec<_>>();
    scopes.sort_by(|a, b| a.id.cmp(&b.id));
    let mut groups = Vec::new();
    for scope in scopes {
        let mut facts = report
            .technologies
            .iter()
            .filter(|fact| fact.package_scope_id == scope.id)
            .collect::<Vec<_>>();
        facts.sort_by(|a, b| a.name.cmp(&b.name));
        if facts.is_empty() {
            continue;
        }
        let rows = facts
            .into_iter()
            .map(|fact| {
                let detail = if fact.details.is_empty() {
                    "deterministically detected".to_string()
                } else {
                    fact.details.join("; ")
                };
                format!("- {} — {detail}", fact.name)
            })
            .collect::<Vec<_>>();
        groups.push(format!(
            "### {}\n{}",
            package_heading(scope.directory.as_str(), &scope.display_name),
            rows.join("\n")
        ));
    }
    (!groups.is_empty()).then(|| format!("## Technology Stack\n{}", groups.join("\n\n")))
}

fn repository_structure_rows(report: &RepoScanReport) -> Vec<String> {
    const MAX_STRUCTURE_ROWS: usize = 16;
    const ROOT_LEVEL_KEY: &str = "\0repository-root";

    let mut directories: BTreeMap<String, (usize, usize)> = BTreeMap::new();
    for file in &report.context_classification.files {
        let Some(path) = packet_path(&file.path) else {
            continue;
        };
        let root = path
            .split_once('/')
            .map(|(root, _)| root)
            .unwrap_or(ROOT_LEVEL_KEY);
        let entry = directories.entry(root.to_string()).or_default();
        entry.0 += 1;
        entry.1 += file.estimated_tokens;
    }
    let mut directories = directories.into_iter().collect::<Vec<_>>();
    directories.sort_by(|(left_path, left), (right_path, right)| {
        right
            .1
            .cmp(&left.1)
            .then_with(|| right.0.cmp(&left.0))
            .then_with(|| left_path.cmp(right_path))
    });
    let mut visible = if directories.len() <= MAX_STRUCTURE_ROWS {
        directories
    } else {
        let omitted = directories.split_off(MAX_STRUCTURE_ROWS - 1);
        let omitted_totals = omitted.into_iter().fold((0usize, 0usize), |total, item| {
            (total.0 + item.1 .0, total.1 + item.1 .1)
        });
        directories.push(("\0other-directories".to_string(), omitted_totals));
        directories
    };
    visible
        .drain(..)
        .map(|(directory, (files, tokens))| match directory.as_str() {
            ROOT_LEVEL_KEY => {
                format!("- Repository root — {files} scanned text files / {tokens} tokens")
            }
            "\0other-directories" => format!(
                "- Other top-level directories — {files} scanned text files / {tokens} tokens"
            ),
            _ => format!("- `{directory}/` — {files} scanned text files / {tokens} tokens"),
        })
        .collect()
}

fn important_file_rows(report: &RepoScanReport) -> Vec<String> {
    let metadata = classified_file_map(report);
    let mut reasons: BTreeMap<String, Vec<String>> = BTreeMap::new();

    for entrypoint in report
        .entrypoints
        .iter()
        .filter(|entrypoint| entrypoint.proof_level == "confirmed")
    {
        let Some(path) = packet_path(&entrypoint.path) else {
            continue;
        };
        add_reason(
            &mut reasons,
            &path,
            format!(
                "confirmed {} entrypoint; {}",
                entrypoint.kind, entrypoint.reason
            ),
        );
    }

    for (path, file) in &metadata {
        if file.classification.role == "source_of_truth_config" {
            add_reason(&mut reasons, path, configuration_reason(path));
        }
    }

    for hub in &report.repo_graph.hub_files {
        let Some(path) = packet_path(&hub.path) else {
            continue;
        };
        if hub.fan_in == report.repo_graph.max_fan_in && hub.fan_in > 0 {
            add_reason(
                &mut reasons,
                &path,
                format!(
                    "highest repository-local static fan-in: imported by {} files",
                    hub.fan_in
                ),
            );
        }
        if hub.fan_out == report.repo_graph.max_fan_out && hub.fan_out > 0 {
            add_reason(
                &mut reasons,
                &path,
                format!(
                    "highest repository-local static fan-out: imports {} local files",
                    hub.fan_out
                ),
            );
        }
    }

    let mut eligible = metadata
        .iter()
        .filter(|(_, file)| {
            file.classification.role == "authored_source"
                && is_ai_eligible(&file.classification.context_policy)
        })
        .collect::<Vec<_>>();
    eligible.sort_by(|(left_path, left), (right_path, right)| {
        right
            .estimated_tokens
            .cmp(&left.estimated_tokens)
            .then_with(|| left_path.cmp(right_path))
    });
    let selected = eligible.into_iter().take(5).collect::<Vec<_>>();
    let selected_count = selected.len();
    for (index, (path, _)) in selected.into_iter().enumerate() {
        add_reason(
            &mut reasons,
            path,
            if index == 0 {
                "largest AI-eligible source file".to_string()
            } else {
                format!("one of the {selected_count} largest AI-eligible source files")
            },
        );
    }

    reasons
        .into_iter()
        .map(|(path, reasons)| {
            let reason = reasons.join("; ");
            match metadata.get(&path) {
                Some(file) => format!(
                    "- `{path}` — {reason}; {} tokens; {}",
                    file.estimated_tokens, file.language
                ),
                None => format!("- `{path}` — {reason}; metadata join unavailable"),
            }
        })
        .collect()
}

fn add_reason(reasons: &mut BTreeMap<String, Vec<String>>, path: &str, reason: String) {
    let file_reasons = reasons.entry(path.to_string()).or_default();
    if !file_reasons.contains(&reason) {
        file_reasons.push(reason);
    }
}

fn command_block(report: &RepoScanReport) -> Option<String> {
    if report.package_scopes.is_empty() {
        return None;
    }
    let mut scopes = report.package_scopes.iter().collect::<Vec<_>>();
    scopes.sort_by(|a, b| a.id.cmp(&b.id));
    let mut groups = Vec::new();
    for scope in scopes {
        let commands = &report.verification.commands;
        let mut rows = Vec::new();
        for (category, label) in [
            ("development", "Development"),
            ("build", "Build"),
            ("test", "Tests"),
            ("lint", "Lint"),
        ] {
            let mut matches = commands
                .iter()
                .filter(|command| {
                    command.package_scope_id == scope.id && command.category == category
                })
                .collect::<Vec<_>>();
            matches.sort_by(|a, b| a.script_name.cmp(&b.script_name));
            if matches.is_empty() {
                rows.push(format!("- {label}: not detected"));
            } else {
                for command in matches {
                    rows.push(match &command.exact_command {
                        Some(exact) => format!("- {label}: `{exact}`"),
                        None => format!(
                            "- {label}: script `{}`; package manager not detected",
                            command.script_name
                        ),
                    });
                }
            }
        }
        let dedicated = commands.iter().find(|command| {
            command.package_scope_id == scope.id && command.category == "typecheck"
        });
        let included = commands.iter().find(|command| {
            command.package_scope_id == scope.id && command.category == "typecheck_included"
        });
        rows.push(if let Some(command) = dedicated {
            command
                .exact_command
                .as_ref()
                .map(|exact| format!("- Dedicated typecheck: `{exact}`"))
                .unwrap_or_else(|| {
                    format!(
                        "- Dedicated typecheck: script `{}`; package manager not detected",
                        command.script_name
                    )
                })
        } else if let Some(command) = included {
            command
                .exact_command
                .as_ref()
                .map(|exact| format!("- Type checking: performed as part of `{exact}`"))
                .unwrap_or_else(|| {
                    format!(
                        "- Type checking: included in script `{}`",
                        command.script_name
                    )
                })
        } else {
            "- Dedicated typecheck: not detected".to_string()
        });
        groups.push(format!(
            "### {}\n{}",
            package_heading(&scope.directory, &scope.display_name),
            rows.join("\n")
        ));
    }
    Some(format!(
        "## Development and Verification Commands\n{}",
        groups.join("\n\n")
    ))
}

fn import_graph_rows(report: &RepoScanReport) -> Vec<String> {
    if report.repo_graph.analyzed_file_count == 0 {
        return Vec::new();
    }
    let metadata = classified_file_map(report);
    let mut rows = vec![
        format!("- AI-eligible JavaScript/TypeScript files parsed for imports: {}", report.repo_graph.analyzed_file_count),
        format!("- Static module references: {}", report.repo_graph.static_module_references),
        format!("- Resolved repository-local static references: {}", report.repo_graph.resolved_local_static_references),
        format!("- External package static references: {}", report.repo_graph.external_package_static_references),
        format!("- JavaScript/TypeScript unresolved repository-local static references: {} across {} parsed files", report.repo_graph.unresolved_local_static_references, report.repo_graph.analyzed_file_count),
        format!("- Machine-specific absolute static references: {}", report.repo_graph.machine_specific_absolute_static_references),
        format!("- Other or unclassified static references: {}", report.repo_graph.other_static_references),
        format!("- Dynamic imports: {} (reported separately; excluded from fan-in, fan-out, and cycles)", report.repo_graph.dynamic_imports),
        format!("- Maximum repository-local static fan-in: {}", report.repo_graph.max_fan_in),
        format!("- Maximum repository-local static fan-out: {}", report.repo_graph.max_fan_out),
        format!("- Circular repository-local static dependency files: {}", report.repo_graph.circular_import_files),
    ];
    for hub in &report.repo_graph.hub_files {
        let Some(path) = packet_path(&hub.path) else {
            continue;
        };
        match metadata.get(&path) {
            Some(file) => rows.push(format!(
                "- `{path}` — local static fan-in {} / fan-out {}; {} tokens; {}",
                hub.fan_in, hub.fan_out, file.estimated_tokens, file.language
            )),
            None => rows.push(format!(
                "- `{path}` — local static fan-in {} / fan-out {}; metadata join unavailable",
                hub.fan_in, hub.fan_out
            )),
        }
    }
    rows
}

fn portability_rows(report: &RepoScanReport) -> Vec<String> {
    if report.portability.machine_specific_absolute_imports == 0 {
        return Vec::new();
    }
    let mut rows = vec![format!(
        "- Machine-specific absolute imports: {}",
        report.portability.machine_specific_absolute_imports
    )];
    rows.extend(report.portability.file_signals.iter().filter_map(|signal| {
        let path = packet_path(&signal.path)?;
        Some(format!("- `{path}` — {}", signal.category))
    }));
    rows
}

fn coverage_rows(report: &RepoScanReport) -> Vec<String> {
    let mut rows = vec![format!(
        "- File and token classification: complete for {} readable text files",
        report.context_classification.files.len()
    )];

    if let Some(imports) = report
        .analyzer_coverage
        .iter()
        .find(|coverage| coverage.analyzer_id == "javascript-typescript-imports")
    {
        let candidate_files = imports
            .analyzed_file_count
            .max(report.repo_graph.analyzed_file_count);
        let parsed_files = report.repo_graph.analyzed_file_count;
        let skipped_files = candidate_files.saturating_sub(parsed_files);
        if candidate_files > 0 {
            rows.push(format!(
                "- JavaScript/TypeScript import file coverage: complete for the AI-eligible supported-file scope; {candidate_files} candidate {} examined, {parsed_files} AI-eligible supported {} parsed, {skipped_files} candidate {} skipped because their context roles are outside the import-graph scope",
                file_label(candidate_files),
                file_label(parsed_files),
                file_label(skipped_files),
            ));
            rows.push("- Import syntax coverage: partial; static imports, re-exports, require calls, and dynamic imports are supported".to_string());
        }
        if !imports.excluded_languages.is_empty() {
            rows.push(format!(
                "- Other detected languages not analyzed for imports: {}",
                imports.excluded_languages.join(", ")
            ));
        }
    }

    if let Some(commands) = report
        .analyzer_coverage
        .iter()
        .find(|coverage| coverage.analyzer_id == "javascript-package")
    {
        if commands.analyzed_file_count > 0 {
            let manifest_label = if commands.analyzed_file_count == 1 {
                "manifest"
            } else {
                "manifests"
            };
            rows.push(format!(
                "- Package-command analysis: {} for {} package.json {manifest_label} under bounded npm-family script rules",
                commands.status, commands.analyzed_file_count,
            ));
        }
    }

    if let Some(entrypoints) = report
        .analyzer_coverage
        .iter()
        .find(|coverage| coverage.analyzer_id == "javascript-entrypoints")
    {
        if entrypoints.analyzed_file_count > 0 {
            rows.push(format!(
                "- Entrypoint analysis: {} by bounded rules for supported package scripts and HTML module references; {} evidence files examined",
                entrypoints.status, entrypoints.analyzed_file_count
            ));
        }
    }

    rows.extend(
        report
            .analyzer_coverage
            .iter()
            .filter(|coverage| coverage.status == "unsupported")
            .map(|coverage| {
                let excluded = if coverage.excluded_languages.is_empty() {
                    String::new()
                } else {
                    format!(": {}", coverage.excluded_languages.join(", "))
                };
                format!("- {}: unsupported{}", coverage.capability, excluded)
            }),
    );
    rows
}

fn unresolved_import_rows(report: &RepoScanReport) -> Vec<String> {
    report
        .repo_graph
        .unresolved_import_details
        .iter()
        .filter_map(|signal| {
            let source = packet_path(&signal.source_path)?;
            Some(format!(
                "- `{source}` → `{}`",
                signal.specifier.replace('\\', "/")
            ))
        })
        .collect()
}

fn finding_block(report: &RepoScanReport) -> Option<String> {
    let mut signals = report
        .privacy
        .file_signals
        .iter()
        .chain(report.runtime_signals.iter())
        .collect::<Vec<&FileFindingSignal>>();
    signals.sort_by(|left, right| {
        normalize_packet_path(&left.path)
            .cmp(&normalize_packet_path(&right.path))
            .then_with(|| left.category.cmp(&right.category))
    });
    let mut by_role: BTreeMap<String, BTreeMap<String, Vec<&FileFindingSignal>>> = BTreeMap::new();
    for signal in signals {
        let Some(path) = packet_path(&signal.path) else {
            continue;
        };
        by_role
            .entry(signal.context_role.clone())
            .or_default()
            .entry(path)
            .or_default()
            .push(signal);
    }
    let mut groups = Vec::new();
    for (role, title) in [
        (
            "sensitive_environment_configuration",
            "Environment and configuration",
        ),
        ("authored_source", "Authored source"),
        ("example_documentation", "Examples and documentation"),
        ("generated_reference", "Generated and reference output"),
    ] {
        let Some(files) = by_role.get(role) else {
            continue;
        };
        if role == "generated_reference" {
            let count: usize = files.values().flatten().map(|signal| signal.count).sum();
            groups.push(format!(
                "### {title}\n- {count} pattern matches across {} generated/reference files",
                files.len()
            ));
            continue;
        }
        let rows = files
            .iter()
            .map(|(path, signals)| {
                let details = signals
                    .iter()
                    .map(|signal| format!("{}: {}", signal.category, signal.count))
                    .collect::<Vec<_>>()
                    .join("; ");
                format!("- `{path}` — {details}")
            })
            .collect::<Vec<_>>();
        groups.push(format!("### {title}\n{}", rows.join("\n")));
    }
    (!groups.is_empty()).then(|| format!("## Privacy and Runtime Signals\n{}", groups.join("\n\n")))
}

fn context_accounting_rows(report: &RepoScanReport) -> Vec<String> {
    let totals = &report.context_classification.totals;
    let mut rows = vec![
        format!(
            "- Total readable repository context: {} tokens",
            totals.total_readable_tokens
        ),
        format!(
            "- Included — AI-eligible repository context: {} tokens / {} files",
            totals.default_ai_context_tokens, totals.default_ai_context_files
        ),
        format!(
            "- Included — Authored source: {} tokens / {} files",
            totals.authored_source_tokens, totals.authored_source_files
        ),
        format!(
            "- Included — Source-of-truth configuration: {} tokens / {} files",
            totals.source_of_truth_config_tokens, totals.source_of_truth_config_files
        ),
        format!(
            "- Summarized — Dependency lockfiles: {} tokens / {} files",
            totals.dependency_lockfile_tokens, totals.dependency_lockfile_files
        ),
        format!(
            "- Summarized — Generated/reference output: {} tokens / {} files",
            totals.generated_reference_tokens, totals.generated_reference_files
        ),
        format!(
            "- Excluded — Runtime data: {} tokens / {} files",
            totals.runtime_data_tokens, totals.runtime_data_files
        ),
    ];
    if totals.build_output_files > 0 {
        rows.push(format!(
            "- Excluded — Build output: {} tokens / {} files",
            totals.build_output_tokens, totals.build_output_files
        ));
    }
    if totals.vendored_dependency_files > 0 {
        rows.push(format!(
            "- Excluded — Vendored dependencies: {} tokens / {} files",
            totals.vendored_dependency_tokens, totals.vendored_dependency_files
        ));
    }
    if let Some(accounting) = &report.token_accounting {
        rows.push(format!(
            "- Repository-packet tokens: {}",
            accounting.repository_packet_tokens
        ));
        rows.push(format!(
            "- Potentially avoidable context: {} tokens",
            accounting.potentially_avoidable_context_tokens
        ));
        rows.push(format!(
            "- Potential input-token reduction: {}%",
            accounting.potential_input_token_reduction_percent
        ));
    }
    rows
}

fn deterministic_warning_rows(report: &RepoScanReport) -> Vec<String> {
    let mut rows = Vec::new();
    if !report.package_scopes.is_empty() && !report.verification.has_test_script {
        rows.push("- Test script missing".to_string());
    }
    if !report.package_scopes.is_empty() && !report.verification.has_ci_config {
        rows.push("- CI configuration missing".to_string());
    }
    for scope in &report.package_scopes {
        if scope.declared_entry_exists == Some(false) {
            if let (Some(manifest), Some(entry)) = (
                packet_path(&scope.manifest_path),
                scope.declared_entry.as_deref(),
            ) {
                if let Some(entry) = packet_path(entry) {
                    rows.push(format!(
                        "- Declared package entry file is missing: `{manifest}` → `{entry}`"
                    ));
                }
            }
        }
    }
    if report.repo_graph.unresolved_imports > 0 {
        rows.push(format!(
            "- JavaScript/TypeScript unresolved repository-local static references: {}",
            report.repo_graph.unresolved_imports
        ));
    }
    if report.repo_graph.circular_import_files > 0 {
        rows.push(format!(
            "- Circular import files: {}",
            report.repo_graph.circular_import_files
        ));
    }
    if report.privacy.secret_candidate_count > 0 {
        rows.push(format!(
            "- Potential secret-like signals: {}",
            report.privacy.secret_candidate_count
        ));
    }
    let runtime_count: usize = report
        .runtime_signals
        .iter()
        .map(|signal| signal.count)
        .sum();
    if runtime_count > 0 {
        rows.push(format!(
            "- Runtime ambiguity-pattern matches: {runtime_count}"
        ));
    }
    rows
}

fn methodology_rows(report: &RepoScanReport) -> Vec<String> {
    let mut rows = vec![
        "- Deterministic scanner facts only; no AI model generated this packet".to_string(),
        "- Repository-relative paths only; secret values, private URL values, and source snippets are omitted".to_string(),
        "- Secret-like and private-URL findings are deterministic pattern matches and were not externally validated".to_string(),
        "- Import arithmetic: static references = resolved local + external package + unresolved local + machine-specific absolute + other/unclassified".to_string(),
        "- Fan-in, fan-out, and cycle analysis use resolved repository-local static references only; dynamic imports are separate".to_string(),
        format!("- Context classifier: {}", report.context_classification.version),
        format!("- Tokenizer: {} / {}", report.tokenization.tokenizer, report.tokenization.method),
    ];
    if let Some(encoding) = &report.tokenization.encoding {
        rows.push(format!("- Tokenizer encoding: {encoding}"));
    }
    if report.tokenization.fallback_used {
        rows.push("- Tokenizer fallback used for both repository and packet totals".to_string());
    }
    rows
}

fn classified_file_map(report: &RepoScanReport) -> BTreeMap<String, &ClassifiedFile> {
    report
        .context_classification
        .files
        .iter()
        .filter_map(|file| packet_path(&file.path).map(|path| (path, file)))
        .collect()
}

fn is_ai_eligible(policy: &str) -> bool {
    matches!(
        policy,
        "include_full" | "include_if_task_relevant" | "include_in_default_context"
    )
}

fn configuration_reason(path: &str) -> String {
    let filename = path.rsplit('/').next().unwrap_or(path);
    match filename {
        "package.json" => "package manifest".to_string(),
        "tsconfig.json" => "TypeScript configuration".to_string(),
        "schema.prisma" => "database schema".to_string(),
        "Cargo.toml" => "Rust package manifest".to_string(),
        value if value.starts_with("vite.config.") => "build configuration".to_string(),
        _ => "source-of-truth configuration".to_string(),
    }
}

fn package_heading(directory: &str, name: &str) -> String {
    if directory.is_empty() {
        format!("Root package — {name}")
    } else {
        format!(
            "{} package — {name}",
            directory.rsplit('/').next().unwrap_or(directory)
        )
    }
}

fn file_label(count: usize) -> &'static str {
    if count == 1 {
        "file"
    } else {
        "files"
    }
}

pub(super) fn packet_path(path: &str) -> Option<String> {
    (!is_absolute_path(path)).then(|| normalize_packet_path(path))
}

pub(super) fn normalize_packet_path(path: &str) -> String {
    let path = path.replace('\\', "/");
    let mut parts = Vec::new();
    for part in path.split('/') {
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

fn is_absolute_path(value: &str) -> bool {
    let bytes = value.as_bytes();
    value.starts_with('/')
        || value.starts_with("\\\\")
        || (bytes.len() >= 3
            && bytes[1] == b':'
            && matches!(bytes[2], b'\\' | b'/')
            && bytes[0].is_ascii_alphabetic())
}
