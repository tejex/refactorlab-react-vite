use crate::report::{RepoDigest, RepoScanReport, TokenAccounting};

pub fn token_accounting_from_packet(
    report: &RepoScanReport,
    digest: &RepoDigest,
) -> TokenAccounting {
    let ai_eligible_repository_tokens = report.totals.estimated_source_tokens;
    let repository_packet_tokens = digest.packet_tokens;
    let potentially_avoidable_context_tokens =
        ai_eligible_repository_tokens.saturating_sub(repository_packet_tokens);
    let potential_input_token_reduction_percent = potential_reduction_percent(
        ai_eligible_repository_tokens,
        potentially_avoidable_context_tokens,
    );
    let mut notes = vec![
        "AI-eligible repository files and the final rendered Markdown packet use the same tokenizer and encoding.".to_string(),
        "This is potential input-context reduction, not observed external-agent token savings.".to_string(),
        "Percent is rounded to the nearest whole percentage point and clamped to 0-100%.".to_string(),
    ];

    if repository_packet_tokens > ai_eligible_repository_tokens {
        notes.push(
            "The repository packet is larger than the AI-eligible repository context; potentially avoidable context is clamped to 0 tokens."
                .to_string(),
        );
    }

    TokenAccounting {
        ai_eligible_repository_tokens,
        repository_packet_tokens,
        potentially_avoidable_context_tokens,
        potential_input_token_reduction_percent,
        basis: "same_tokenizer_exact_packet".to_string(),
        notes,
    }
}

fn potential_reduction_percent(
    ai_eligible_repository_tokens: usize,
    potentially_avoidable_tokens: usize,
) -> u8 {
    if ai_eligible_repository_tokens == 0 || potentially_avoidable_tokens == 0 {
        return 0;
    }

    let eligible = ai_eligible_repository_tokens as u128;
    let avoidable = potentially_avoidable_tokens.min(ai_eligible_repository_tokens) as u128;
    let rounded = (avoidable * 100 + eligible / 2) / eligible;
    rounded.min(100) as u8
}
