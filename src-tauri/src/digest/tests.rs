use super::{generate_repo_digest, render_repository_packet, token_accounting_from_packet};
use crate::report::{
    AnalyzerCoverage, ClassificationTotals, ClassifiedFile, CostDriver, EntrypointFact,
    FileClassification, FileFindingSignal, FileSignal, GraphFileSignal, LanguageStat,
    PackageScopeFact, PrivacySignals, RepoDigest, RepoDigestSection, RepoGraphSummary,
    RepoScanReport, Scores, TechnologyFact, TokenAccounting, Totals, UnresolvedImportSignal,
    VerificationCommand, VerificationSignals,
};
use crate::token_counter::HeuristicTokenCounter;

#[test]
fn repository_packet_matches_fixture_and_is_order_independent() {
    let report = packet_fixture_report();
    let mut reordered = report.clone();
    reordered.scanned_at = "different-timestamp".to_string();
    reordered.languages.reverse();
    reordered.context_classification.files.reverse();
    reordered.verification.commands.reverse();
    reordered.repo_graph.hub_files.reverse();
    reordered.repo_graph.unresolved_import_details.reverse();
    reordered.privacy.file_signals.reverse();
    reordered.runtime_signals.reverse();

    let rendered = render_repository_packet(&report);
    let reordered_rendered = render_repository_packet(&reordered);
    let expected = include_str!("../../tests/fixtures/repository_packet.md");

    assert_eq!(rendered, expected);
    assert_eq!(reordered_rendered, expected);
    assert!(!rendered.contains("/Users/example/private-repo"));
    assert!(!rendered.contains("different-timestamp"));
    assert!(!rendered.contains("AI cost pressure"));
    assert!(!rendered.contains("Retry loop risk"));
    assert!(!rendered.contains("tokens saved"));
}

#[test]
fn empty_or_partial_report_still_generates_a_valid_packet_without_absolute_paths() {
    let mut report = sample_report();
    report.repo_name = "empty".to_string();
    report.repo_path = "C:\\Users\\example\\private-repo".to_string();
    report.languages.clear();
    report.context_classification = Default::default();
    report.verification = Default::default();
    report.privacy = Default::default();
    report.runtime_signals.clear();
    report.repo_graph = Default::default();
    report.token_accounting = None;

    let rendered = render_repository_packet(&report);

    assert!(rendered.starts_with("# Repository Context\n"));
    assert!(rendered.contains("- Repository: empty"));
    assert!(!rendered.contains("Test script missing"));
    assert!(!rendered.contains("C:\\Users"));
}

#[test]
fn digest_generation_is_deterministic_and_uses_expected_sections() {
    let report = sample_report();
    let counter = HeuristicTokenCounter::new();

    let first = generate_repo_digest(&report, &counter);
    let second = generate_repo_digest(&report, &counter);
    let ids = first
        .sections
        .iter()
        .map(|section| section.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(first.packet_tokens, second.packet_tokens);
    assert_eq!(first.sections[0].content, second.sections[0].content);
    assert!(ids.contains(&"project-overview"));
    assert!(ids.contains(&"verification-signals"));
    assert!(ids.contains(&"context-burden"));
    assert!(ids.contains(&"repo-graph-summary"));
    assert!(ids.contains(&"privacy-signals"));
    assert!(ids.contains(&"ambiguity-signals"));
    assert!(ids.contains(&"cost-drivers"));
    assert!(ids.contains(&"scoring-summary"));
}

#[test]
fn packet_categories_render_once_and_predictive_scores_are_absent() {
    let rendered = render_repository_packet(&packet_fixture_report());

    assert_eq!(rendered.matches("Dependency lockfiles").count(), 1);
    assert_eq!(rendered.matches("Generated/reference output").count(), 1);
    assert_eq!(rendered.matches("Runtime data").count(), 1);
    for forbidden in [
        "AI cost pressure",
        "Retry loop risk",
        "Sensitive data risk",
        "Blast radius",
        "Context burden",
        "Ambiguity risk",
    ] {
        assert!(!rendered.contains(forbidden));
    }
}

#[test]
fn graph_metadata_joins_by_normalized_relative_path() {
    let rendered = render_repository_packet(&packet_fixture_report());

    assert!(rendered
        .contains("`src/core.ts` — local static fan-in 7 / fan-out 5; 32500 tokens; TypeScript"));
    assert!(!rendered.contains("0 tokens; Unknown"));
    assert!(!rendered.contains("src\\core.ts"));
}

#[test]
fn packet_commands_and_actionable_findings_are_exact_stable_and_redacted() {
    let rendered = render_repository_packet(&packet_fixture_report());
    let first_unresolved = rendered
        .find("`src/a.ts` → `../missing-a`")
        .expect("first unresolved import should render");
    let second_unresolved = rendered
        .find("`src/z.ts` → `./missing-z`")
        .expect("second unresolved import should render");

    assert!(rendered.contains("- Build: `npm run build`"));
    assert!(rendered.contains("- Tests: not detected"));
    assert!(rendered.contains("`src/auth.ts` — potential secret-like string: 2"));
    assert!(rendered.contains("`src/render.ts` — innerHTML: 3"));
    assert!(first_unresolved < second_unresolved);
    assert!(!rendered.contains("super_secret_value_123"));
    assert!(!rendered.contains("https://internal.example"));
}

#[test]
fn packet_distinguishes_typecheck_command_states() {
    let mut dedicated = packet_fixture_report();
    let dedicated_packet = render_repository_packet(&dedicated);
    assert!(dedicated_packet.contains("- Dedicated typecheck: `npm run typecheck`"));

    dedicated.verification.commands.retain(|command| {
        !matches!(
            command.category.as_str(),
            "typecheck" | "typecheck_included"
        )
    });
    dedicated.verification.commands.push(VerificationCommand {
        category: "typecheck_included".to_string(),
        script_name: "build".to_string(),
        script_body: "tsc -b && vite build".to_string(),
        manifest_path: "package.json".to_string(),
        package_manager: Some("npm".to_string()),
        exact_command: Some("npm run build".to_string()),
        package_scope_id: "package.json".to_string(),
    });
    let included_packet = render_repository_packet(&dedicated);
    assert!(included_packet.contains("- Type checking: performed as part of `npm run build`"));
    assert!(!included_packet.contains("- Dedicated typecheck: `npm run build`"));

    dedicated.verification.commands.retain(|command| {
        !matches!(
            command.category.as_str(),
            "typecheck" | "typecheck_included"
        )
    });
    dedicated.verification.has_typecheck_script = false;
    let missing_packet = render_repository_packet(&dedicated);
    assert!(missing_packet.contains("- Dedicated typecheck: not detected"));
}

#[test]
fn packet_omits_internal_unknown_source_label_without_discarding_diagnostics() {
    let mut report = packet_fixture_report();
    report.context_classification.totals.unknown_source_tokens = 355;
    report.context_classification.totals.unknown_source_files = 2;
    report.context_classification.files.push(classified_file(
        "config/settings.json",
        "JSON",
        355,
        "unknown_source",
        "include_if_task_relevant",
    ));

    let rendered = render_repository_packet(&report);

    assert!(!rendered.contains("Unknown source"));
    assert!(report
        .context_classification
        .files
        .iter()
        .any(|file| file.classification.role == "unknown_source"));
    assert_eq!(
        report.context_classification.totals.unknown_source_tokens,
        355
    );
}

#[test]
fn important_files_have_deterministic_reasons() {
    let rendered = render_repository_packet(&packet_fixture_report());

    assert!(rendered.contains("`src/main.tsx` — confirmed frontend entrypoint"));
    assert!(rendered.contains("`package.json` — package manifest"));
    assert!(rendered
        .contains("`src/core.ts` — highest repository-local static fan-in: imported by 7 files"));
    assert_eq!(
        rendered.matches("largest AI-eligible source file;").count(),
        1
    );
    assert_eq!(
        rendered
            .matches("one of the 3 largest AI-eligible source files")
            .count(),
        2
    );
}

#[test]
fn packet_polish_scopes_language_coverage_and_structure_totals_precisely() {
    let rendered = render_repository_packet(&packet_fixture_report());

    assert!(rendered.contains("## AI-Eligible Languages"));
    assert!(rendered.contains("- Scope: 4 AI-eligible repository files"));
    assert!(!rendered.contains("## Languages\n"));
    assert!(rendered.contains(
        "6 candidate files examined, 4 AI-eligible supported files parsed, 2 candidate files skipped"
    ));
    assert!(rendered.contains("- Package-command analysis: complete for 1 package.json manifest under bounded npm-family script rules"));
    assert!(rendered.contains(
        "- Entrypoint analysis: partial by bounded rules for supported package scripts and HTML module references; 2 evidence files examined"
    ));
    assert!(!rendered.contains("package commands and entrypoints"));
    assert!(rendered.contains("- Repository root — 3 scanned text files / 260 tokens"));
    assert!(rendered.contains("- `src/` — 4 scanned text files / 35200 tokens"));
    assert_eq!(
        3 + 4,
        packet_fixture_report().context_classification.files.len()
    );
}

fn packet_fixture_report() -> RepoScanReport {
    let mut report = sample_report();
    report.repo_path = "/Users/example/private-repo".to_string();
    report.package_scopes = vec![PackageScopeFact {
        id: "package.json".to_string(),
        display_name: "sample".to_string(),
        package_name: Some("sample".to_string()),
        manifest_path: "package.json".to_string(),
        directory: String::new(),
        ecosystem: "javascript".to_string(),
        package_manager: Some("npm".to_string()),
        workspace_declared: false,
        declared_entry: None,
        declared_entry_exists: None,
        dependency_ids: vec!["express".to_string()],
    }];
    report.entrypoints = vec![EntrypointFact {
        path: "src/main.tsx".to_string(),
        package_scope_id: "package.json".to_string(),
        kind: "frontend".to_string(),
        evidence_type: "html_module_script".to_string(),
        evidence_source: "index.html".to_string(),
        proof_level: "confirmed".to_string(),
        reason: "referenced by `index.html`".to_string(),
    }];
    report.technologies = vec![TechnologyFact {
        package_scope_id: "package.json".to_string(),
        identifier: "express".to_string(),
        name: "Express".to_string(),
        declared_version: Some("^5".to_string()),
        details: vec!["direct dependency".to_string()],
        evidence_sources: vec!["package.json".to_string()],
    }];
    report.analyzer_coverage = vec![
        AnalyzerCoverage {
            analyzer_id: "javascript-package".to_string(),
            analyzer_version: "1.1".to_string(),
            capability: "package commands".to_string(),
            status: "complete".to_string(),
            analyzed_file_count: 1,
            analyzed_languages: vec!["package.json".to_string()],
            excluded_languages: vec![],
            limitations: vec![],
        },
        AnalyzerCoverage {
            analyzer_id: "javascript-entrypoints".to_string(),
            analyzer_version: "1.1".to_string(),
            capability: "entrypoint evidence".to_string(),
            status: "partial".to_string(),
            analyzed_file_count: 2,
            analyzed_languages: vec![
                "package.json scripts".to_string(),
                "HTML module scripts".to_string(),
            ],
            excluded_languages: vec![],
            limitations: vec![],
        },
        AnalyzerCoverage {
            analyzer_id: "javascript-typescript-imports".to_string(),
            analyzer_version: "1.1".to_string(),
            capability: "JavaScript/TypeScript import candidates".to_string(),
            status: "partial".to_string(),
            analyzed_file_count: 6,
            analyzed_languages: vec!["JavaScript".to_string(), "TypeScript".to_string()],
            excluded_languages: vec!["CSS".to_string(), "HTML".to_string()],
            limitations: vec![],
        },
    ];
    report.verification.commands = vec![
        VerificationCommand {
            category: "typecheck".to_string(),
            script_name: "typecheck".to_string(),
            script_body: "tsc --noEmit".to_string(),
            manifest_path: "package.json".to_string(),
            package_manager: Some("npm".to_string()),
            exact_command: Some("npm run typecheck".to_string()),
            package_scope_id: "package.json".to_string(),
        },
        VerificationCommand {
            category: "build".to_string(),
            script_name: "build".to_string(),
            script_body: "tsc".to_string(),
            manifest_path: "package.json".to_string(),
            package_manager: Some("npm".to_string()),
            exact_command: Some("npm run build".to_string()),
            package_scope_id: "package.json".to_string(),
        },
    ];
    report.privacy.file_signals = vec![FileFindingSignal {
        path: "src\\auth.ts".to_string(),
        category: "potential secret-like string".to_string(),
        count: 2,
        context_role: "authored_source".to_string(),
    }];
    report.runtime_signals = vec![FileFindingSignal {
        path: "src\\render.ts".to_string(),
        category: "innerHTML".to_string(),
        count: 3,
        context_role: "authored_source".to_string(),
    }];
    report.repo_graph.unresolved_import_details = vec![
        UnresolvedImportSignal {
            source_path: "src\\z.ts".to_string(),
            specifier: ".\\missing-z".to_string(),
        },
        UnresolvedImportSignal {
            source_path: "src/a.ts".to_string(),
            specifier: "../missing-a".to_string(),
        },
    ];
    report.repo_graph.hub_files = vec![GraphFileSignal {
        path: "src\\core.ts".to_string(),
        fan_in: 7,
        fan_out: 5,
        signals: vec!["high-fan-in".to_string()],
    }];
    report.repo_graph.analyzed_file_count = 4;
    report.repo_graph.static_module_references = 20;
    report.repo_graph.resolved_local_static_references = 12;
    report.repo_graph.external_package_static_references = 6;
    report.repo_graph.unresolved_local_static_references = 2;
    report.context_classification.version = "context-classifier-v2".to_string();
    report.context_classification.totals = ClassificationTotals {
        total_readable_tokens: 35_460,
        default_ai_context_tokens: 34_750,
        default_ai_context_files: 4,
        authored_source_tokens: 34_700,
        authored_source_files: 3,
        source_of_truth_config_tokens: 50,
        source_of_truth_config_files: 1,
        generated_reference_tokens: 500,
        generated_reference_files: 1,
        dependency_lockfile_tokens: 200,
        dependency_lockfile_files: 1,
        build_output_tokens: 0,
        build_output_files: 0,
        vendored_dependency_tokens: 0,
        vendored_dependency_files: 0,
        runtime_data_tokens: 10,
        runtime_data_files: 1,
        unknown_source_tokens: 0,
        unknown_source_files: 0,
    };
    report.context_classification.files = vec![
        classified_file(
            "src\\core.ts",
            "TypeScript",
            32_500,
            "authored_source",
            "include_full",
        ),
        classified_file(
            "src/main.tsx",
            "React TSX",
            1_200,
            "authored_source",
            "include_full",
        ),
        classified_file(
            "src/render.ts",
            "TypeScript",
            1_000,
            "authored_source",
            "include_full",
        ),
        classified_file(
            "package.json",
            "JSON",
            50,
            "source_of_truth_config",
            "include_full",
        ),
        classified_file(
            "package-lock.json",
            "JSON",
            200,
            "dependency_lockfile",
            "include_summary",
        ),
        classified_file(
            "src/generated/api.ts",
            "TypeScript",
            500,
            "generated_reference",
            "include_summary",
        ),
        classified_file(".env", "Environment", 10, "runtime_data", "exclude_noise"),
    ];
    report
}

fn classified_file(
    path: &str,
    language: &str,
    estimated_tokens: usize,
    role: &str,
    context_policy: &str,
) -> ClassifiedFile {
    ClassifiedFile {
        path: path.to_string(),
        language: language.to_string(),
        estimated_tokens,
        line_count: 10,
        size_bytes: 100,
        classification: FileClassification {
            role: role.to_string(),
            context_policy: context_policy.to_string(),
            confidence: 1.0,
            reasons: vec!["test fixture".to_string()],
        },
    }
}

#[test]
fn digest_does_not_include_secret_values_from_privacy_findings() {
    let mut report = sample_report();
    report
        .privacy
        .findings
        .push("actual secret value super_secret_value_123".to_string());
    let counter = HeuristicTokenCounter::new();

    let digest = generate_repo_digest(&report, &counter);
    let text = digest
        .sections
        .iter()
        .map(|section| section.content.as_str())
        .collect::<Vec<_>>()
        .join("\n");

    assert!(!text.contains("super_secret_value_123"));
}

#[test]
fn digest_sections_respect_row_caps_and_budgets() {
    let mut report = sample_report();
    for index in 0..30 {
        report.expensive_files.push(FileSignal {
            path: format!("src/huge-{index}.ts"),
            language: "TypeScript".to_string(),
            estimated_tokens: 10_000 + index,
            line_count: 500,
            size_bytes: 40_000,
            signals: vec!["over-8k-tokens".to_string()],
        });
    }
    let counter = HeuristicTokenCounter::new();

    let digest = generate_repo_digest(&report, &counter);

    for section in digest.sections {
        assert!(section.estimated_tokens <= section.budget_tokens);
    }
}

#[test]
fn token_accounting_uses_exact_packet_tokens_and_clamps_percent() {
    let report = sample_report_with_source_tokens(100);
    let digest = RepoDigest {
        generated_at: "1".to_string(),
        packet_tokens: 25,
        sections: vec![RepoDigestSection {
            id: "x".to_string(),
            title: "X".to_string(),
            content: "x".to_string(),
            estimated_tokens: 25,
            budget_tokens: 50,
        }],
        notes: vec![],
    };

    let accounting = token_accounting_from_packet(&report, &digest);

    assert_eq!(accounting.ai_eligible_repository_tokens, 100);
    assert_eq!(accounting.repository_packet_tokens, 25);
    assert_eq!(accounting.potentially_avoidable_context_tokens, 75);
    assert_eq!(accounting.potential_input_token_reduction_percent, 75);
    assert_eq!(accounting.basis, "same_tokenizer_exact_packet");
}

#[test]
fn token_accounting_rounds_to_nearest_whole_percentage_point() {
    let report = sample_report_with_source_tokens(231_600);
    let digest = RepoDigest {
        generated_at: "1".to_string(),
        packet_tokens: 871,
        sections: vec![],
        notes: vec![],
    };

    let accounting = token_accounting_from_packet(&report, &digest);

    assert_eq!(accounting.potentially_avoidable_context_tokens, 230_729);
    assert_eq!(accounting.potential_input_token_reduction_percent, 100);
}

#[test]
fn token_accounting_covers_current_fractional_and_equal_size_cases() {
    let cases = [
        (45_413, 1_839, 96),
        (100, 25, 75),
        (200, 67, 67),
        (100, 100, 0),
        (100, 125, 0),
        (0, 0, 0),
    ];

    for (eligible, packet, expected_percent) in cases {
        let report = sample_report_with_source_tokens(eligible);
        let digest = RepoDigest {
            generated_at: "1".to_string(),
            packet_tokens: packet,
            sections: vec![],
            notes: vec![],
        };

        let accounting = token_accounting_from_packet(&report, &digest);

        assert_eq!(
            accounting.potential_input_token_reduction_percent, expected_percent,
            "eligible={eligible}, packet={packet}"
        );
        assert!(accounting.potential_input_token_reduction_percent <= 100);
    }
}

#[test]
fn token_accounting_handles_zero_context_and_larger_packet_safely() {
    let report = sample_report_with_source_tokens(0);
    let digest = RepoDigest {
        generated_at: "1".to_string(),
        packet_tokens: 25,
        sections: vec![],
        notes: vec![],
    };

    let accounting = token_accounting_from_packet(&report, &digest);

    assert_eq!(accounting.potentially_avoidable_context_tokens, 0);
    assert_eq!(accounting.potential_input_token_reduction_percent, 0);
    assert!(accounting
        .notes
        .iter()
        .any(|note| note.contains("clamped to 0 tokens")));
}

fn sample_report_with_source_tokens(tokens: usize) -> RepoScanReport {
    let mut report = sample_report();
    report.totals.estimated_source_tokens = tokens;
    report
}

fn sample_report() -> RepoScanReport {
    RepoScanReport {
        repo_name: "sample".to_string(),
        repo_path: "/tmp/sample".to_string(),
        scanned_at: "1".to_string(),
        scores: Scores {
            ai_expense_score: 7.3,
            ai_readiness_score: 27,
            context_burden: 8.0,
            verification_debt: 6.0,
            ambiguity_risk: 3.0,
            blast_radius: 4.0,
            privacy_risk: "High".to_string(),
            retry_risk: "High".to_string(),
            compression_opportunity_percent: 72,
        },
        totals: Totals {
            total_files: 12,
            source_files: 10,
            ignored_files: 2,
            estimated_source_tokens: 120_000,
            files_over_8k_tokens: 2,
            files_over_32k_tokens: 1,
        },
        verification: VerificationSignals {
            has_build_script: true,
            has_test_script: false,
            has_typecheck_script: true,
            has_lint_script: false,
            has_ci_config: false,
            build_scripts: vec!["build".to_string()],
            test_scripts: vec![],
            typecheck_scripts: vec!["typecheck".to_string()],
            lint_scripts: vec![],
            commands: vec![],
        },
        package_scopes: vec![],
        entrypoints: vec![],
        technologies: vec![],
        analyzer_coverage: vec![],
        portability: Default::default(),
        privacy: PrivacySignals {
            env_files: vec![".env".to_string()],
            secret_candidate_count: 2,
            secret_candidate_files: vec![".env".to_string()],
            private_url_count: 1,
            findings: vec!["2 secret-like assignments detected".to_string()],
            file_signals: vec![],
        },
        runtime_signals: vec![],
        repo_graph: RepoGraphSummary {
            total_imports: 20,
            relative_imports: 14,
            external_imports: 6,
            resolved_imports: 12,
            unresolved_imports: 2,
            unresolved_import_details: vec![],
            circular_import_files: 1,
            max_fan_in: 7,
            max_fan_out: 5,
            sensitive_module_refs: 1,
            hub_files: vec![crate::report::GraphFileSignal {
                path: "src/core.ts".to_string(),
                fan_in: 7,
                fan_out: 5,
                signals: vec!["high-fan-in".to_string()],
            }],
            ..RepoGraphSummary::default()
        },
        languages: vec![LanguageStat {
            language: "TypeScript".to_string(),
            extension: "ts".to_string(),
            files: 8,
            estimated_tokens: 100_000,
        }],
        expensive_files: vec![FileSignal {
            path: "src/core.ts".to_string(),
            language: "TypeScript".to_string(),
            estimated_tokens: 32_500,
            line_count: 900,
            size_bytes: 130_000,
            signals: vec!["over-32k-tokens".to_string()],
        }],
        top_cost_drivers: vec![
            CostDriver {
                title: "Runtime ambiguity patterns found".to_string(),
                severity: "medium".to_string(),
                explanation: "Dynamic patterns detected.".to_string(),
                affected_count: Some(9),
            },
            CostDriver {
                title: "Source context is heavy".to_string(),
                severity: "high".to_string(),
                explanation: "Large source context.".to_string(),
                affected_count: Some(10),
            },
        ],
        ignored_paths: vec!["node_modules".to_string()],
        context_classification: Default::default(),
        tokenization: crate::token_counter::default_tokenization_metadata(),
        repo_digest: None,
        token_accounting: None::<TokenAccounting>,
    }
}
