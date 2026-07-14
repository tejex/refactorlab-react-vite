mod ecosystems;
mod files;
mod graph;
mod metrics;
mod privacy;
mod verification;

use std::collections::BTreeSet;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::classifier::{include_in_default_context, FileClassificationInput, FileClassifier};
use crate::digest::{generate_repo_digest, render_repository_packet, token_accounting_from_packet};
use crate::report::{AnalyzerCoverage, RepoScanReport};
use crate::token_counter::{default_token_counter, TokenCounter};

use ecosystems::{EcosystemAnalyzer, JavaScriptPackageAnalyzer, RepositoryIndex};
use files::walk_repo;
use graph::repo_graph;
use metrics::{cost_drivers, expensive_files, language_stats, score_report, scoring_facts, totals};
use privacy::{detect_privacy, detect_runtime_signals};

#[derive(Debug, Clone)]
pub(super) struct RawFile {
    pub(super) path: String,
    pub(super) language: String,
    pub(super) extension: String,
    pub(super) text: String,
    pub(super) line_count: usize,
    pub(super) size_bytes: u64,
    pub(super) estimated_tokens: usize,
}

#[derive(Default)]
pub(super) struct ScanState {
    pub(super) raw_files: Vec<RawFile>,
    pub(super) total_files: usize,
    pub(super) ignored_files: usize,
    pub(super) ignored_paths: Vec<String>,
    pub(super) has_ci_config: bool,
}

pub fn scan_repo(root: PathBuf) -> io::Result<RepoScanReport> {
    if !root.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "path is not a directory",
        ));
    }

    let root = fs::canonicalize(root)?;
    let token_counter = default_token_counter();
    let mut state = ScanState::default();
    walk_repo(&root, &root, &mut state, token_counter.as_ref())?;

    let classifier = FileClassifier::bundled();
    let context_classification =
        classifier.classify_files(state.raw_files.iter().map(|file| FileClassificationInput {
            path: &file.path,
            extension: &file.extension,
            language: &file.language,
            text: &file.text,
            estimated_tokens: file.estimated_tokens,
            line_count: file.line_count,
            size_bytes: file.size_bytes,
        }));
    let default_context_paths = context_classification
        .files
        .iter()
        .filter(|file| include_in_default_context(&file.classification))
        .map(|file| file.path.as_str())
        .collect::<BTreeSet<_>>();
    let default_context_files = state
        .raw_files
        .iter()
        .filter(|file| default_context_paths.contains(file.path.as_str()))
        .cloned()
        .collect::<Vec<_>>();

    let ecosystem = JavaScriptPackageAnalyzer.analyze(&RepositoryIndex {
        files: &state.raw_files,
        has_ci_config: state.has_ci_config,
    });
    let verification = ecosystem.verification;
    let privacy = detect_privacy(&state.raw_files, &context_classification);
    let runtime_signals = detect_runtime_signals(&default_context_files, &context_classification);
    let (repo_graph, portability) = repo_graph(&default_context_files, &state.raw_files);
    let languages = language_stats(&default_context_files);
    let expensive_files = expensive_files(&default_context_files);
    let totals = totals(&state, &default_context_files);
    let facts = scoring_facts(&default_context_files, &privacy, &repo_graph);
    let scores = score_report(&totals, &verification, &facts);
    let top_cost_drivers = cost_drivers(
        &totals,
        &verification,
        &privacy,
        &facts,
        &expensive_files,
        &repo_graph,
        &context_classification,
    );

    let mut analyzer_coverage = vec![AnalyzerCoverage {
        analyzer_id: "file-token-classification".to_string(),
        analyzer_version: context_classification.version.clone(),
        capability: "file and token classification".to_string(),
        status: "complete".to_string(),
        analyzed_file_count: context_classification.files.len(),
        analyzed_languages: languages
            .iter()
            .map(|language| language.language.clone())
            .collect(),
        excluded_languages: Vec::new(),
        limitations: vec!["readable text files only".to_string()],
    }];
    analyzer_coverage.extend(ecosystem.coverage);

    let mut report = RepoScanReport {
        repo_name: root
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "Selected repo".to_string()),
        repo_path: root.display().to_string(),
        scanned_at: now_epoch_string(),
        scores,
        totals,
        verification,
        package_scopes: ecosystem.package_scopes,
        entrypoints: ecosystem.entrypoints,
        technologies: ecosystem.technologies,
        analyzer_coverage,
        portability,
        privacy,
        runtime_signals,
        repo_graph,
        languages,
        expensive_files,
        top_cost_drivers,
        ignored_paths: state.ignored_paths,
        context_classification,
        tokenization: token_counter.metadata(),
        repo_digest: None,
        token_accounting: None,
    };

    report.repo_digest = Some(generate_repo_digest(&report, token_counter.as_ref()));
    finalize_packet_accounting(&mut report, token_counter.as_ref())?;

    Ok(report)
}

fn finalize_packet_accounting(
    report: &mut RepoScanReport,
    token_counter: &dyn TokenCounter,
) -> io::Result<()> {
    for _ in 0..64 {
        let packet_tokens = token_counter.count(&render_repository_packet(report));
        let previous_packet_tokens = report
            .repo_digest
            .as_ref()
            .map(|digest| digest.packet_tokens)
            .unwrap_or(0);
        if let Some(digest) = report.repo_digest.as_mut() {
            digest.packet_tokens = packet_tokens;
        }

        let next_accounting = report
            .repo_digest
            .as_ref()
            .map(|digest| token_accounting_from_packet(report, digest));
        let accounting_stable = report.token_accounting == next_accounting;
        report.token_accounting = next_accounting;

        if previous_packet_tokens == packet_tokens && accounting_stable {
            break;
        }
    }

    let rendered_packet_tokens = token_counter.count(&render_repository_packet(report));
    let recorded_packet_tokens = report
        .repo_digest
        .as_ref()
        .map(|digest| digest.packet_tokens)
        .unwrap_or(0);
    let accounting_packet_tokens = report
        .token_accounting
        .as_ref()
        .map(|accounting| accounting.repository_packet_tokens)
        .unwrap_or(0);
    if rendered_packet_tokens != recorded_packet_tokens
        || rendered_packet_tokens != accounting_packet_tokens
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "repository packet token accounting did not converge on the final Markdown artifact",
        ));
    }

    if let Some(accounting) = &report.token_accounting {
        report.scores.compression_opportunity_percent =
            accounting.potential_input_token_reduction_percent;
    }

    Ok(())
}

/// Recursively walks the selected repo, collecting readable source files and counting ignored noise.

fn now_epoch_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

#[cfg(test)]
mod tests;
