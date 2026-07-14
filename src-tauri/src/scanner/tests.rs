use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use super::graph::{repo_graph, resolve_relative_import, typescript_js_substitution_enabled};
use super::verification::detect_verification;
use super::{scan_repo, RawFile};
use crate::digest::render_repository_packet;
use crate::token_counter::default_token_counter;

struct TestRepo {
    path: PathBuf,
}

impl TestRepo {
    fn new(name: &str) -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock should be valid")
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("fixer-{name}-{}-{nonce}", std::process::id()));
        fs::create_dir_all(&path).expect("test repo should be created");
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TestRepo {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[test]
fn typescript_import_resolution_uses_config_and_complete_scan_index() {
    let importer = raw_file(
        "src/services/generation.ts",
        "ts",
        concat!(
            "import groq from '../lib/groq.js';\n",
            "import { prompt } from './prompt';\n",
            "import { PrismaClient } from '../generated/prisma/client';\n",
            "import { missingJs } from './missing.js';\n",
            "import { missing } from './really-missing';\n",
        ),
    );
    let groq = raw_file("src/lib/groq.ts", "ts", "export default {};\n");
    let prompt = raw_file(
        "src/services/prompt.ts",
        "ts",
        "export const prompt = '';\n",
    );
    let generated = raw_file(
        "src/generated/prisma/client.ts",
        "ts",
        "export class PrismaClient {}\n",
    );
    let tsconfig = raw_file(
        "tsconfig.json",
        "json",
        r#"{
                // TypeScript configuration uses JSON with comments.
                "compilerOptions": {
                    "module": "ESNext",
                    "moduleResolution": "bundler",
                },
            }"#,
    );
    let graph_files = vec![importer.clone()];
    let all_files = vec![importer, groq, prompt, generated, tsconfig];

    assert!(
        typescript_js_substitution_enabled("src/services/generation.ts", &all_files),
        "JSONC moduleResolution should enable TypeScript source substitution"
    );

    let (graph, _) = repo_graph(&graph_files, &all_files);

    assert_eq!(
        graph.resolved_imports, 3,
        "unexpected unresolved imports: {:?}",
        graph.unresolved_import_details
    );
    assert_eq!(graph.unresolved_imports, 2);
    assert_eq!(
        graph
            .unresolved_import_details
            .iter()
            .map(|finding| finding.specifier.as_str())
            .collect::<Vec<_>>(),
        vec!["./missing.js", "./really-missing"]
    );
}

#[test]
fn relative_import_resolution_normalizes_slashes_without_guessing_missing_files() {
    let known_paths = ["src/lib/groq.ts", "src/services/prompt.ts"]
        .into_iter()
        .map(str::to_string)
        .collect::<BTreeSet<_>>();

    assert_eq!(
        resolve_relative_import(
            "src\\services\\generation.ts",
            "..\\lib\\groq.js",
            &known_paths,
            true,
        )
        .as_deref(),
        Some("src/lib/groq.ts")
    );
    assert_eq!(
        resolve_relative_import("src/services/generation.ts", "./prompt", &known_paths, true,)
            .as_deref(),
        Some("src/services/prompt.ts")
    );
    assert_eq!(
        resolve_relative_import(
            "src/services/generation.ts",
            "../lib/absent.js",
            &known_paths,
            true,
        ),
        None
    );
    assert_eq!(
        resolve_relative_import(
            "src/services/generation.ts",
            "../lib/groq.js",
            &known_paths,
            false,
        ),
        None
    );
}

#[test]
fn verification_distinguishes_dedicated_included_and_missing_typecheck_commands() {
    let dedicated = detect_verification(
        &[raw_file(
            "package.json",
            "json",
            r#"{"packageManager":"npm@10","scripts":{"typecheck":"tsc --noEmit"}}"#,
        )],
        false,
    );
    let included = detect_verification(
        &[raw_file(
            "package.json",
            "json",
            r#"{"packageManager":"npm@10","scripts":{"build":"tsc -b && vite build"}}"#,
        )],
        false,
    );
    let missing = detect_verification(
        &[raw_file(
            "package.json",
            "json",
            r#"{"packageManager":"npm@10","scripts":{"build":"vite build"}}"#,
        )],
        false,
    );

    assert!(dedicated
        .commands
        .iter()
        .any(|command| command.category == "typecheck"
            && command.exact_command.as_deref() == Some("npm run typecheck")));
    assert!(included
        .commands
        .iter()
        .any(|command| command.category == "typecheck_included"
            && command.exact_command.as_deref() == Some("npm run build")));
    assert!(!included
        .commands
        .iter()
        .any(|command| command.category == "typecheck"));
    assert!(!missing.has_typecheck_script);
    assert!(!missing.commands.iter().any(|command| {
        matches!(
            command.category.as_str(),
            "typecheck" | "typecheck_included"
        )
    }));
}

fn raw_file(path: &str, extension: &str, text: &str) -> RawFile {
    RawFile {
        path: path.to_string(),
        language: "Test".to_string(),
        extension: extension.to_string(),
        text: text.to_string(),
        line_count: text.lines().count(),
        size_bytes: text.len() as u64,
        estimated_tokens: 1,
    }
}

fn write_fixture(repo: &TestRepo, path: &str, text: &str) {
    let destination = repo.path().join(path);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).expect("fixture parent should be created");
    }
    fs::write(destination, text).expect("fixture file should be written");
}

#[test]
fn package_scopes_commands_entrypoints_and_technologies_keep_their_evidence() {
    let repo = TestRepo::new("package-scopes");
    write_fixture(
        &repo,
        "package.json",
        r#"{
          "name":"server-package","type":"module","main":"index.js",
          "scripts":{"dev":"concurrently \"tsx src/server.ts\" \"cd client && npm run dev\"","build":"vite build && curl https://private.example/build?token=do-not-export"},
          "dependencies":{"express":"https://private.example/express.tgz","@prisma/client":"^6","groq-sdk":"^1","zod":"^4"},
          "devDependencies":{"prisma":"^6"}
        }"#,
    );
    write_fixture(&repo, "package-lock.json", r#"{"lockfileVersion":3}"#);
    write_fixture(
        &repo,
        "client/package.json",
        r#"{
          "name":"web-client","type":"module",
          "scripts":{"dev":"vite","build":"tsc -b && vite build","lint":"eslint ."},
          "dependencies":{"react":"^19","react-router-dom":"^7","@mui/material":"^7","antd":"^5","axios":"^1"},
          "devDependencies":{"vite":"^7","typescript":"~5"}
        }"#,
    );
    write_fixture(
        &repo,
        "client/index.html",
        r#"<script type="module" src="/src/main.tsx"></script>"#,
    );
    write_fixture(&repo, "client/src/main.tsx", "export const app = true;\n");
    write_fixture(&repo, "src/server.ts", "export const server = true;\n");
    write_fixture(
        &repo,
        "src/generated/reference.ts",
        "export const generatedReference = true;\n",
    );
    write_fixture(
        &repo,
        "prisma/schema.prisma",
        "datasource db {\n  provider = \"sqlite\"\n  url = env(\"PRIVATE_DATABASE_URL\")\n}\n",
    );

    let report = scan_repo(repo.path().to_path_buf()).expect("fixture scan should succeed");
    assert_eq!(report.package_scopes.len(), 2);
    assert!(report.package_scopes.iter().any(|scope| {
        scope.id == "package.json"
            && scope.display_name == "server-package"
            && scope.declared_entry.as_deref() == Some("index.js")
            && scope.declared_entry_exists == Some(false)
            && !scope.workspace_declared
    }));
    assert!(report.package_scopes.iter().any(|scope| {
        scope.id == "client/package.json" && scope.package_manager.as_deref() == Some("npm")
    }));
    for (scope, category, command) in [
        ("package.json", "development", "npm run dev"),
        ("client/package.json", "development", "npm run dev"),
        ("client/package.json", "build", "npm run build"),
        ("client/package.json", "lint", "npm run lint"),
        ("client/package.json", "typecheck_included", "npm run build"),
    ] {
        assert!(report.verification.commands.iter().any(|fact| {
            fact.package_scope_id == scope
                && fact.category == category
                && fact.exact_command.as_deref() == Some(command)
        }));
    }
    assert!(report.entrypoints.iter().any(|entrypoint| {
        entrypoint.path == "client/src/main.tsx"
            && entrypoint.evidence_source == "client/index.html"
    }));
    assert!(report.entrypoints.iter().any(|entrypoint| {
        entrypoint.path == "src/server.ts"
            && entrypoint.evidence_source == "package.json#scripts.dev"
    }));
    assert!(!report
        .entrypoints
        .iter()
        .any(|entrypoint| entrypoint.path == "index.js"));
    assert!(report.technologies.iter().any(|technology| {
        technology.package_scope_id == "package.json"
            && technology.name == "Prisma"
            && technology
                .details
                .iter()
                .any(|detail| detail.contains("SQLite"))
    }));
    assert!(report.technologies.iter().any(|technology| {
        technology.package_scope_id == "client/package.json" && technology.name == "React"
    }));
    let vite = report
        .technologies
        .iter()
        .find(|technology| {
            technology.package_scope_id == "client/package.json" && technology.name == "Vite"
        })
        .expect("Vite technology fact should be present");
    assert_eq!(
        vite.details,
        vec!["direct development dependency and build tooling"]
    );
    assert!(!vite
        .details
        .iter()
        .any(|detail| detail == "direct dependency"));
    let import_coverage = report
        .analyzer_coverage
        .iter()
        .find(|coverage| coverage.analyzer_id == "javascript-typescript-imports")
        .expect("import coverage should be present");
    assert_eq!(import_coverage.analyzed_file_count, 3);
    assert_eq!(report.repo_graph.analyzed_file_count, 2);
    assert!(report
        .analyzer_coverage
        .iter()
        .any(|coverage| coverage.analyzer_id == "javascript-package"
            && coverage.analyzed_file_count == 2));
    assert!(report
        .analyzer_coverage
        .iter()
        .any(|coverage| coverage.analyzer_id == "javascript-entrypoints"
            && coverage.analyzed_file_count == 3));

    let packet = render_repository_packet(&report);
    let diagnostic = serde_json::to_string(&report).expect("report should serialize");
    assert!(packet.contains("Declared package entry file is missing"));
    assert!(packet.contains("`src/server.ts` — confirmed server entrypoint"));
    assert!(packet.contains("`client/src/main.tsx` — confirmed frontend entrypoint"));
    assert!(packet.contains("Vite — direct development dependency and build tooling"));
    assert!(packet.contains(
        "3 candidate files examined, 2 AI-eligible supported files parsed, 1 candidate file skipped"
    ));
    assert!(!packet.contains("PRIVATE_DATABASE_URL"));
    for forbidden in ["private.example", "do-not-export", "PRIVATE_DATABASE_URL"] {
        assert!(!diagnostic.contains(forbidden));
    }
}

#[test]
fn import_categories_reconcile_and_absolute_specifiers_are_redacted() {
    let source = concat!(
        "import './local';\n",
        "export * from './local';\n",
        "import React from 'react';\n",
        "import('/src/local');\n",
        "import '/src/local';\n",
        "import '/Users/alice/private.ts';\n",
        "import 'C:\\\\Users\\\\alice\\\\private.ts';\n",
        "import '\\\\\\\\server\\\\share\\\\private.ts';\n",
        "import 'file:///Users/alice/private.ts';\n",
        "import './missing';\n",
        "import 'https://example.invalid/module.js';\n",
    );
    let importer = raw_file("src/main.ts", "ts", source);
    let local = raw_file("src/local.ts", "ts", "export const local = true;\n");
    let package = raw_file("package.json", "json", r#"{"name":"fixture"}"#);
    let (graph, portability) = repo_graph(
        &[importer.clone(), local.clone()],
        &[importer, local, package],
    );

    assert_eq!(graph.dynamic_imports, 1);
    assert_eq!(graph.resolved_local_static_references, 3);
    assert_eq!(graph.external_package_static_references, 1);
    assert_eq!(graph.unresolved_local_static_references, 1);
    assert_eq!(graph.machine_specific_absolute_static_references, 4);
    assert_eq!(graph.other_static_references, 1);
    assert_eq!(graph.max_fan_out, 3);
    assert_eq!(portability.machine_specific_absolute_imports, 4);
    assert_eq!(
        graph.static_module_references,
        graph.resolved_local_static_references
            + graph.external_package_static_references
            + graph.unresolved_local_static_references
            + graph.machine_specific_absolute_static_references
            + graph.other_static_references
    );
    let serialized = serde_json::to_string(&(graph, portability)).expect("facts should serialize");
    for forbidden in [
        "/Users/alice",
        "C:\\\\Users",
        "server\\\\share",
        "file:///Users",
    ] {
        assert!(!serialized.contains(forbidden));
    }
}

#[test]
fn privacy_findings_keep_context_roles_without_emitting_values() {
    let repo = TestRepo::new("privacy-context");
    write_fixture(&repo, ".env", "API_KEY=do-not-emit-this-value\n");
    write_fixture(&repo, ".env.example", "API_KEY=example-value\n");
    write_fixture(&repo, "README.md", "API_KEY=documentation-value\n");
    write_fixture(
        &repo,
        "src/auth.ts",
        "const api_key = process.env.API_KEY;\n",
    );
    write_fixture(
        &repo,
        "src/generated/client.ts",
        "const api_key = 'generated-placeholder';\n",
    );

    let report = scan_repo(repo.path().to_path_buf()).expect("privacy fixture should scan");
    for role in [
        "sensitive_environment_configuration",
        "example_documentation",
        "authored_source",
        "generated_reference",
    ] {
        assert!(report
            .privacy
            .file_signals
            .iter()
            .any(|signal| signal.context_role == role));
    }
    let packet = render_repository_packet(&report);
    assert!(packet.contains("### Generated and reference output"));
    for forbidden in [
        "do-not-emit-this-value",
        "documentation-value",
        "generated-placeholder",
    ] {
        assert!(!packet.contains(forbidden));
    }
}

#[test]
fn unsupported_python_and_rust_repositories_do_not_report_false_missing_or_zero_results() {
    for (name, manifest, source) in [
        ("python", "pyproject.toml", "src/main.py"),
        ("rust", "Cargo.toml", "src/main.rs"),
    ] {
        let repo = TestRepo::new(name);
        write_fixture(&repo, manifest, "[project]\nname = \"fixture\"\n");
        write_fixture(&repo, source, "placeholder source\n");
        let report = scan_repo(repo.path().to_path_buf()).expect("unsupported fixture should scan");
        let packet = render_repository_packet(&report);
        assert!(packet.contains("unsupported"));
        assert!(!packet.contains("Test script missing"));
        assert!(!packet.contains("unresolved repository-local static references: 0"));
        assert!(packet.contains("## AI-Eligible Languages"));
        assert!(packet.contains("## Context Accounting"));
    }
}

#[test]
fn repeated_scans_produce_identical_unified_token_accounting() {
    let repo = TestRepo::new("repeated-token-accounting");
    let manifest = r#"{"scripts":{"build":"tsc","test":"vitest","typecheck":"tsc --noEmit","lint":"eslint ."}}"#;
    let source = "export const greeting = 'hello 世界 👋🏽';\nconsole.log(greeting);\n";
    fs::create_dir_all(repo.path().join("src")).expect("src directory should be created");
    fs::write(repo.path().join("package.json"), manifest)
        .expect("package manifest should be written");
    fs::write(repo.path().join("src/main.ts"), source).expect("source file should be written");

    let first = scan_repo(repo.path().to_path_buf()).expect("first scan should succeed");
    let second = scan_repo(repo.path().to_path_buf()).expect("second scan should succeed");

    assert_eq!(first.tokenization, second.tokenization);
    assert_eq!(first.tokenization.tokenizer, "tiktoken-rs");
    assert_eq!(first.tokenization.encoding.as_deref(), Some("o200k_base"));
    assert!(!first.tokenization.fallback_used);
    assert_eq!(
        first.totals.estimated_source_tokens,
        second.totals.estimated_source_tokens
    );
    assert_eq!(first.token_accounting, second.token_accounting);

    let counter = default_token_counter();
    assert_eq!(
        first.totals.estimated_source_tokens,
        counter.count(manifest) + counter.count(source)
    );

    let digest = first
        .repo_digest
        .as_ref()
        .expect("packet digest should exist");
    let packet = render_repository_packet(&first);
    assert_eq!(digest.packet_tokens, counter.count(&packet));

    let accounting = first
        .token_accounting
        .as_ref()
        .expect("token accounting should exist");
    assert_eq!(
        accounting.ai_eligible_repository_tokens,
        first.totals.estimated_source_tokens
    );
    assert_eq!(accounting.repository_packet_tokens, digest.packet_tokens);
}

#[test]
fn empty_repo_clamps_avoidable_context_to_zero() {
    let repo = TestRepo::new("empty-token-accounting");
    let report = scan_repo(repo.path().to_path_buf()).expect("empty scan should succeed");
    let digest = report
        .repo_digest
        .as_ref()
        .expect("packet digest should exist");
    let accounting = report
        .token_accounting
        .as_ref()
        .expect("token accounting should exist");

    assert_eq!(accounting.ai_eligible_repository_tokens, 0);
    assert!(digest.packet_tokens > 0);
    assert_eq!(accounting.repository_packet_tokens, digest.packet_tokens);
    assert_eq!(accounting.potentially_avoidable_context_tokens, 0);
    assert_eq!(accounting.potential_input_token_reduction_percent, 0);
    assert!(accounting
        .notes
        .iter()
        .any(|note| note.contains("clamped to 0 tokens")));
}
