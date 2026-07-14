use std::fs;
use std::io;
use std::path::Path;

use crate::token_counter::TokenCounter;

use super::{RawFile, ScanState};

const SOURCE_EXTENSIONS: &[&str] = &[
    "astro", "c", "cpp", "cs", "css", "go", "graphql", "h", "html", "java", "js", "json", "jsx",
    "kt", "lock", "lockb", "md", "php", "prisma", "py", "rb", "rs", "scss", "sh", "sql", "svelte",
    "toml", "ts", "tsx", "vue", "xml", "yaml", "yml", "env",
];

const IGNORED_DIRS: &[&str] = &[
    ".git",
    ".next",
    ".cache",
    ".turbo",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
];

pub(super) fn walk_repo(
    root: &Path,
    current: &Path,
    state: &mut ScanState,
    token_counter: &dyn TokenCounter,
) -> io::Result<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        let relative = relative_path(root, &path);

        if is_ci_config(&relative) {
            state.has_ci_config = true;
        }

        if file_type.is_symlink() {
            continue;
        }

        if should_ignore(&relative) {
            remember_ignored_path(state, &relative);
            let count = if file_type.is_dir() {
                count_files_capped(&path, 50_000)
            } else {
                1
            };
            state.total_files += count;
            state.ignored_files += count;
            continue;
        }

        if file_type.is_dir() {
            walk_repo(root, &path, state, token_counter)?;
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        state.total_files += 1;
        let extension = normalized_extension(&path, &relative);
        if !SOURCE_EXTENSIONS.contains(&extension.as_str()) {
            continue;
        }

        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        if is_binary(&bytes) {
            continue;
        }
        if bytes.len() > 2_000_000 {
            remember_ignored_path(state, &relative);
            state.ignored_files += 1;
            continue;
        }

        let text = String::from_utf8_lossy(&bytes).to_string();
        let line_count = if text.is_empty() {
            0
        } else {
            text.lines().count()
        };
        let estimated_tokens = token_counter.count(&text);
        state.raw_files.push(RawFile {
            path: relative,
            language: language_for(&extension).to_string(),
            extension,
            text,
            line_count,
            size_bytes: bytes.len() as u64,
            estimated_tokens,
        });
    }

    Ok(())
}

/// Extracts deterministic verification signals such as package scripts and CI configuration.

fn remember_ignored_path(state: &mut ScanState, relative: &str) {
    if state.ignored_paths.len() < 50 {
        state.ignored_paths.push(relative.to_string());
    }
}

/// Checks whether a path is generated, vendored, or otherwise noisy for source-context analysis.
fn should_ignore(relative: &str) -> bool {
    relative.split('/').any(|part| IGNORED_DIRS.contains(&part))
        || relative.ends_with(".map")
        || relative.ends_with(".min.js")
        || relative.ends_with(".min.css")
}

/// Counts ignored files without fully trusting huge dependency/build folders to be cheap to traverse.
fn count_files_capped(path: &Path, cap: usize) -> usize {
    let Ok(entries) = fs::read_dir(path) else {
        return 1;
    };
    let mut count = 0;

    for entry in entries.flatten() {
        if count >= cap {
            return cap;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            count += count_files_capped(&entry.path(), cap.saturating_sub(count));
        } else if file_type.is_file() {
            count += 1;
        }
    }

    count.max(1)
}

/// Produces the extension key used for source filtering, with special handling for .env files.
fn normalized_extension(path: &Path, relative: &str) -> String {
    if is_env_file(relative) {
        return "env".to_string();
    }

    path.extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_else(|| {
            path.file_name()
                .map(|value| value.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        })
}

/// Maps a normalized extension to the language label displayed in the report.
fn language_for(extension: &str) -> &'static str {
    match extension {
        "astro" => "Astro",
        "c" | "h" => "C",
        "cpp" => "C++",
        "cs" => "C#",
        "css" => "CSS",
        "env" => "Environment",
        "go" => "Go",
        "graphql" => "GraphQL",
        "html" => "HTML",
        "java" => "Java",
        "js" => "JavaScript",
        "json" => "JSON",
        "jsx" => "React JSX",
        "kt" => "Kotlin",
        "lock" => "Lockfile",
        "lockb" => "Lockfile",
        "md" => "Markdown",
        "php" => "PHP",
        "prisma" => "Prisma",
        "py" => "Python",
        "rb" => "Ruby",
        "rs" => "Rust",
        "scss" => "SCSS",
        "sh" => "Shell",
        "sql" => "SQL",
        "svelte" => "Svelte",
        "toml" => "TOML",
        "ts" => "TypeScript",
        "tsx" => "React TSX",
        "vue" => "Vue",
        "xml" => "XML",
        "yaml" | "yml" => "YAML",
        _ => "Other",
    }
}

/// Uses a cheap null-byte check to avoid treating binary assets as source text.
fn is_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8_000).any(|byte| *byte == 0)
}

/// Recognizes common CI config paths that improve verification readiness.
fn is_ci_config(relative: &str) -> bool {
    relative.starts_with(".github/workflows/")
        || relative == ".gitlab-ci.yml"
        || relative == ".circleci/config.yml"
}

/// Detects .env-style filenames so they can be counted as privacy-sensitive local files.
pub(super) fn is_env_file(relative: &str) -> bool {
    Path::new(relative)
        .file_name()
        .map(|value| {
            let name = value.to_string_lossy();
            name == ".env" || name.starts_with(".env.") || name.ends_with(".env")
        })
        .unwrap_or(false)
}

/// Converts absolute filesystem paths into stable repo-relative paths for reports.
fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}
