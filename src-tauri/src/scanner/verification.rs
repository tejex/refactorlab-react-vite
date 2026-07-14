use std::collections::BTreeSet;

use serde_json::Value;

use crate::report::{VerificationCommand, VerificationSignals};

use super::graph::normalize_repo_path;
use super::RawFile;

pub(super) fn detect_verification(
    raw_files: &[RawFile],
    has_ci_config: bool,
) -> VerificationSignals {
    let mut signals = VerificationSignals {
        has_ci_config,
        ..VerificationSignals::default()
    };

    for file in raw_files
        .iter()
        .filter(|file| file.path.ends_with("package.json"))
    {
        let Ok(value) = serde_json::from_str::<Value>(&file.text) else {
            continue;
        };
        let Some(scripts) = value.get("scripts").and_then(Value::as_object) else {
            continue;
        };
        let package_manager = detect_package_manager(file.path.as_str(), &value, raw_files);

        for (name, command) in scripts {
            let Some(command) = command.as_str() else {
                continue;
            };
            let rendered = name.clone();
            let key = name.to_lowercase();
            let command_lower = command.to_lowercase();

            let mut categories = Vec::new();
            if key == "dev" || key.starts_with("dev:") || key == "start" {
                categories.push("development");
            }
            if key.contains("build") {
                signals.build_scripts.push(rendered.clone());
                categories.push("build");
            }
            if key.contains("test")
                || command_lower.contains("vitest")
                || command_lower.contains("jest")
            {
                signals.test_scripts.push(rendered.clone());
                categories.push("test");
            }
            let named_typecheck = key.contains("typecheck") || key.contains("type-check");
            let explicit_typecheck = command_explicitly_typechecks(command);
            let dedicated_typecheck = named_typecheck && explicit_typecheck;
            let included_typecheck = !named_typecheck && explicit_typecheck;
            if dedicated_typecheck || included_typecheck {
                signals.typecheck_scripts.push(rendered.clone());
                categories.push(if dedicated_typecheck {
                    "typecheck"
                } else {
                    "typecheck_included"
                });
            }
            if key.contains("lint") || command_lower.contains("eslint") {
                signals.lint_scripts.push(rendered.clone());
                categories.push("lint");
            }

            for category in categories {
                signals.commands.push(VerificationCommand {
                    category: category.to_string(),
                    script_name: name.clone(),
                    script_body: String::new(),
                    manifest_path: normalize_repo_path(&file.path),
                    exact_command: package_manager
                        .as_deref()
                        .map(|manager| format!("{manager} run {name}")),
                    package_manager: package_manager.clone(),
                    package_scope_id: normalize_repo_path(&file.path),
                });
            }
        }
    }

    signals.commands.sort_by(|a, b| {
        command_category_rank(&a.category)
            .cmp(&command_category_rank(&b.category))
            .then_with(|| a.manifest_path.cmp(&b.manifest_path))
            .then_with(|| a.script_name.cmp(&b.script_name))
    });
    signals.commands.dedup_by(|a, b| {
        a.category == b.category
            && a.manifest_path == b.manifest_path
            && a.script_name == b.script_name
    });

    signals.has_build_script = !signals.build_scripts.is_empty();
    signals.has_test_script = !signals.test_scripts.is_empty();
    signals.has_typecheck_script = !signals.typecheck_scripts.is_empty();
    signals.has_lint_script = !signals.lint_scripts.is_empty();
    signals
}

pub(super) fn detect_package_manager(
    manifest_path: &str,
    package_json: &Value,
    raw_files: &[RawFile],
) -> Option<String> {
    if let Some(manager) = package_json
        .get("packageManager")
        .and_then(Value::as_str)
        .and_then(|value| value.split('@').next())
        .filter(|value| matches!(*value, "npm" | "pnpm" | "yarn" | "bun"))
    {
        return Some(manager.to_string());
    }

    let parent = manifest_path
        .rsplit_once('/')
        .map(|(path, _)| path)
        .unwrap_or("");
    let candidates = [
        ("npm", "package-lock.json"),
        ("npm", "npm-shrinkwrap.json"),
        ("pnpm", "pnpm-lock.yaml"),
        ("yarn", "yarn.lock"),
        ("bun", "bun.lock"),
        ("bun", "bun.lockb"),
    ];
    let ancestors = ancestor_directories(parent);
    let nearest_depth = ancestors.iter().enumerate().find_map(|(depth, directory)| {
        candidates
            .iter()
            .any(|(_, filename)| {
                let expected = if directory.is_empty() {
                    (*filename).to_string()
                } else {
                    format!("{directory}/{filename}")
                };
                raw_files.iter().any(|file| file.path == expected)
            })
            .then_some(depth)
    });
    let mut detected = candidates
        .into_iter()
        .filter(|(_, filename)| {
            nearest_depth.is_some_and(|depth| {
                let directory = &ancestors[depth];
                let expected = if directory.is_empty() {
                    filename.to_string()
                } else {
                    format!("{directory}/{filename}")
                };
                raw_files.iter().any(|file| file.path == expected)
            })
        })
        .map(|(manager, _)| manager)
        .collect::<BTreeSet<_>>();

    (detected.len() == 1).then(|| detected.pop_first().unwrap_or_default().to_string())
}

fn ancestor_directories(parent: &str) -> Vec<String> {
    let mut ancestors = Vec::new();
    let mut current = parent.to_string();
    loop {
        ancestors.push(current.clone());
        let Some((next, _)) = current.rsplit_once('/') else {
            if !current.is_empty() {
                ancestors.push(String::new());
            }
            break;
        };
        current = next.to_string();
    }
    ancestors
}

fn command_category_rank(category: &str) -> usize {
    match category {
        "development" => 0,
        "build" => 1,
        "test" => 2,
        "typecheck" => 3,
        "typecheck_included" => 4,
        "lint" => 5,
        _ => 6,
    }
}

fn command_explicitly_typechecks(command: &str) -> bool {
    command
        .split(['&', '|', ';'])
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .any(|segment| {
            let tokens = segment
                .split_whitespace()
                .map(|token| {
                    token
                        .trim_matches(|character: char| matches!(character, '\'' | '"' | '(' | ')'))
                })
                .collect::<Vec<_>>();
            let executable = match tokens.as_slice() {
                ["npx" | "bunx", executable, ..] => Some(*executable),
                ["pnpm" | "yarn" | "npm", "exec", executable, ..] => Some(*executable),
                [executable, ..] => Some(*executable),
                _ => None,
            };
            matches!(
                executable,
                Some("tsc" | "tsc.cmd" | "vue-tsc" | "svelte-check")
            )
        })
}
