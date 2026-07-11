use serde::{Deserialize, Serialize};

/// Metadata exported with every report so token estimates are auditable.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TokenizationMetadata {
    pub method: String,
    pub encoding: Option<String>,
    pub fallback_used: bool,
    pub notes: Vec<String>,
}

/// Counts tokens for all source and digest calculations.
pub trait TokenCounter {
    fn count(&self, text: &str) -> usize;
    fn method(&self) -> TokenizationMetadata;
}

/// Fallback counter used when no compatible model tokenizer is configured.
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

    fn method(&self) -> TokenizationMetadata {
        self.metadata.clone()
    }
}

/// Builds the counter used by the scanner. V2 keeps dependency setup unchanged, so this falls back.
pub fn default_token_counter() -> Box<dyn TokenCounter> {
    Box::new(HeuristicTokenCounter::new())
}

/// Default metadata also lets older serialized reports deserialize safely.
pub fn default_tokenization_metadata() -> TokenizationMetadata {
    TokenizationMetadata {
        method: "heuristic".to_string(),
        encoding: None,
        fallback_used: true,
        notes: vec![
            "Token counts are estimates and vary by model/tokenizer.".to_string(),
            "No compatible tokenizer crate is configured in this build; using characters divided by four.".to_string(),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::{default_token_counter, HeuristicTokenCounter, TokenCounter, TokenizationMetadata};

    #[test]
    fn heuristic_counter_uses_characters_divided_by_four() {
        let counter = HeuristicTokenCounter::new();

        assert_eq!(counter.count("abcd"), 1);
        assert_eq!(counter.count("abcdefghijkl"), 3);
    }

    #[test]
    fn fallback_counter_reports_fallback_metadata() {
        let counter = default_token_counter();
        let metadata = counter.method();

        assert_eq!(metadata.method, "heuristic");
        assert!(metadata.fallback_used);
        assert_eq!(metadata.encoding, None);
    }

    #[test]
    fn tokenization_metadata_serializes_with_camel_case() {
        let metadata = TokenizationMetadata {
            method: "heuristic".to_string(),
            encoding: None,
            fallback_used: true,
            notes: vec!["Token counts are estimates.".to_string()],
        };

        let value = serde_json::to_value(metadata).expect("metadata should serialize");
        assert_eq!(value["fallbackUsed"], true);
        assert_eq!(value["method"], "heuristic");
    }
}
