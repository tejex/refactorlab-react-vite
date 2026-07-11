use serde::{Deserialize, Serialize};
use tiktoken_rs::{o200k_base, CoreBPE};

/// Metadata exported with every report so both sides of token accounting are auditable.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TokenizationMetadata {
    pub tokenizer: String,
    pub method: String,
    pub encoding: Option<String>,
    pub fallback_used: bool,
    pub notes: Vec<String>,
}

/// Counts tokens for every eligible repository file and the final rendered packet.
pub trait TokenCounter {
    fn count(&self, text: &str) -> usize;
    fn metadata(&self) -> TokenizationMetadata;
}

/// Primary deterministic counter for current GPT-5/Codex-family context accounting.
pub struct O200kTokenCounter {
    bpe: CoreBPE,
}

impl O200kTokenCounter {
    pub fn new() -> Result<Self, String> {
        o200k_base()
            .map(|bpe| Self { bpe })
            .map_err(|error| error.to_string())
    }
}

impl TokenCounter for O200kTokenCounter {
    fn count(&self, text: &str) -> usize {
        self.bpe.count_ordinary(text)
    }

    fn metadata(&self) -> TokenizationMetadata {
        TokenizationMetadata {
            tokenizer: "tiktoken-rs".to_string(),
            method: "byte_pair_encoding".to_string(),
            encoding: Some("o200k_base".to_string()),
            fallback_used: false,
            notes: vec![
                "Every AI-eligible repository file and the final rendered Markdown packet use this same tokenizer and encoding.".to_string(),
                "o200k_base is the explicit Fixer baseline; external agents may use different tokenizers.".to_string(),
            ],
        }
    }
}

/// Explicit fallback used only when the primary tokenizer cannot initialize.
#[derive(Debug, Clone)]
pub struct HeuristicTokenCounter {
    metadata: TokenizationMetadata,
}

impl HeuristicTokenCounter {
    pub fn new() -> Self {
        Self {
            metadata: default_tokenization_metadata(),
        }
    }
}

impl Default for HeuristicTokenCounter {
    fn default() -> Self {
        Self::new()
    }
}

impl TokenCounter for HeuristicTokenCounter {
    fn count(&self, text: &str) -> usize {
        text.chars().count() / 4
    }

    fn metadata(&self) -> TokenizationMetadata {
        self.metadata.clone()
    }
}

/// Builds the one counter shared by repository-file and final-packet accounting.
pub fn default_token_counter() -> Box<dyn TokenCounter> {
    match O200kTokenCounter::new() {
        Ok(counter) => Box::new(counter),
        Err(_) => Box::new(HeuristicTokenCounter::new()),
    }
}

/// Default metadata also lets older serialized reports deserialize safely.
pub fn default_tokenization_metadata() -> TokenizationMetadata {
    TokenizationMetadata {
        tokenizer: "fallback".to_string(),
        method: "characters_divided_by_four".to_string(),
        encoding: None,
        fallback_used: true,
        notes: vec![
            "Primary tokenizer initialization failed; every AI-eligible file and the final packet use the same characters-divided-by-four fallback.".to_string(),
            "Fallback counts are estimates and vary from model tokenizers.".to_string(),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::{
        default_token_counter, HeuristicTokenCounter, O200kTokenCounter, TokenCounter,
        TokenizationMetadata,
    };

    #[test]
    fn o200k_counts_ascii_unicode_source_and_empty_content_deterministically() {
        let counter = O200kTokenCounter::new().expect("o200k tokenizer should initialize");
        let samples = [
            "",
            "The quick brown fox jumps over the lazy dog.",
            "こんにちは世界 👋🏽",
            "fn main() {\n    println!(\"hello\");\n}\n",
        ];

        for sample in samples {
            assert_eq!(counter.count(sample), counter.count(sample));
        }

        assert_eq!(counter.count(""), 0);
        assert!(counter.count(samples[1]) > 0);
        assert!(counter.count(samples[2]) > 0);
        assert!(counter.count(samples[3]) > 0);
    }

    #[test]
    fn heuristic_counter_uses_characters_divided_by_four() {
        let counter = HeuristicTokenCounter::new();

        assert_eq!(counter.count("abcd"), 1);
        assert_eq!(counter.count("abcdefghijkl"), 3);
    }

    #[test]
    fn fallback_counter_reports_fallback_metadata() {
        let counter = HeuristicTokenCounter::new();
        let metadata = counter.metadata();

        assert_eq!(metadata.tokenizer, "fallback");
        assert_eq!(metadata.method, "characters_divided_by_four");
        assert!(metadata.fallback_used);
        assert_eq!(metadata.encoding, None);
    }

    #[test]
    fn default_counter_reports_the_explicit_primary_tokenizer() {
        let metadata = default_token_counter().metadata();

        assert_eq!(metadata.tokenizer, "tiktoken-rs");
        assert_eq!(metadata.method, "byte_pair_encoding");
        assert_eq!(metadata.encoding.as_deref(), Some("o200k_base"));
        assert!(!metadata.fallback_used);
    }

    #[test]
    fn tokenization_metadata_serializes_with_camel_case() {
        let metadata = TokenizationMetadata {
            tokenizer: "tiktoken-rs".to_string(),
            method: "byte_pair_encoding".to_string(),
            encoding: Some("o200k_base".to_string()),
            fallback_used: false,
            notes: vec!["Unified deterministic accounting.".to_string()],
        };

        let value = serde_json::to_value(metadata).expect("metadata should serialize");
        assert_eq!(value["tokenizer"], "tiktoken-rs");
        assert_eq!(value["encoding"], "o200k_base");
        assert_eq!(value["fallbackUsed"], false);
        assert_eq!(value["method"], "byte_pair_encoding");
    }
}
