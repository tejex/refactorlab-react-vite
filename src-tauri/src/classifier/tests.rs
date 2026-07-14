use super::{FileClassificationInput, FileClassifier};

#[test]
fn classifies_lockfiles_as_dependency_context() {
    let classifier = FileClassifier::bundled();
    let report = classifier.classify_files([input("package-lock.json", "json", "{}")]);
    let file = &report.files[0];

    assert_eq!(file.classification.role, "dependency_lockfile");
    assert_eq!(file.classification.context_policy, "include_summary");
}

#[test]
fn classifies_generated_paths_as_reference_context_without_framework_rules() {
    let classifier = FileClassifier::bundled();
    let report = classifier.classify_files([input(
        "src/generated/prisma/models/User.ts",
        "ts",
        "export type User = { id: string }",
    )]);
    let file = &report.files[0];

    assert_eq!(file.classification.role, "generated_reference");
    assert_eq!(file.classification.context_policy, "include_summary");
}

#[test]
fn classifies_schema_as_source_of_truth_even_when_prisma_named() {
    let classifier = FileClassifier::bundled();
    let report = classifier.classify_files([input(
        "prisma/schema.prisma",
        "prisma",
        "model User { id String @id }",
    )]);
    let file = &report.files[0];

    assert_eq!(file.classification.role, "source_of_truth_config");
    assert_eq!(file.classification.context_policy, "include_full");
}

#[test]
fn classifies_named_typescript_configs_as_source_of_truth() {
    let classifier = FileClassifier::bundled();
    let report = classifier.classify_files([
        input("client/tsconfig.app.json", "json", "{}"),
        input("client/tsconfig.node.json", "json", "{}"),
    ]);

    assert!(report
        .files
        .iter()
        .all(|file| file.classification.role == "source_of_truth_config"));
    assert_eq!(report.totals.source_of_truth_config_files, 2);
    assert_eq!(report.totals.source_of_truth_config_tokens, 2);
    assert_eq!(report.totals.unknown_source_files, 0);
    assert_eq!(report.totals.total_readable_tokens, 2);
}

#[test]
fn unmatched_internal_classifications_remain_available_diagnostically() {
    let classifier = FileClassifier::bundled();
    let report = classifier.classify_files([input("config/settings.json", "json", "{}")]);
    let file = &report.files[0];

    assert_eq!(file.classification.role, "unknown_source");
    assert_eq!(
        file.classification.context_policy,
        "include_if_task_relevant"
    );
    assert_eq!(report.totals.unknown_source_files, 1);
    assert_eq!(report.totals.unknown_source_tokens, 1);
    assert_eq!(report.totals.total_readable_tokens, 1);
}

#[test]
fn totals_separate_default_context_from_generated_and_lockfiles() {
    let classifier = FileClassifier::bundled();
    let report = classifier.classify_files([
        input("client/package-lock.json", "json", "abcd"),
        input("src/generated/models/User.ts", "ts", "abcd"),
        input("src/App.tsx", "tsx", "abcd"),
        input("package.json", "json", "abcd"),
    ]);

    assert_eq!(report.totals.total_readable_tokens, 4);
    assert_eq!(report.totals.default_ai_context_tokens, 2);
    assert_eq!(report.totals.dependency_lockfile_tokens, 1);
    assert_eq!(report.totals.generated_reference_tokens, 1);
    assert_eq!(report.totals.authored_source_tokens, 1);
    assert_eq!(report.totals.source_of_truth_config_tokens, 1);
    assert_eq!(report.summaries.len(), 2);
}

fn input<'a>(path: &'a str, extension: &'a str, text: &'a str) -> FileClassificationInput<'a> {
    FileClassificationInput {
        path,
        extension,
        language: "Test",
        text,
        estimated_tokens: 1,
        line_count: 1,
        size_bytes: text.len() as u64,
    }
}
