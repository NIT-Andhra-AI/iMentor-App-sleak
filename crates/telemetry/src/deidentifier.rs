use regex::Regex;

/// A compiled set of PII-scrubbing patterns.
pub struct Deidentifier {
    /// Each entry is (compiled regex, replacement placeholder).
    patterns: Vec<(Regex, &'static str)>,
}

impl Deidentifier {
    /// Build and compile all regex patterns once.
    pub fn new() -> Self {
        let raw: &[(&str, &'static str)] = &[
            // Email addresses
            (
                r"(?i)[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}",
                "[EMAIL]",
            ),
            // US & international phone numbers (loose)
            (
                r"(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}",
                "[PHONE]",
            ),
            // SSN-like patterns XXX-XX-XXXX
            (r"\b\d{3}-\d{2}-\d{4}\b", "[SSN]"),
            // URLs (http/https/ftp)
            (
                r#"(?i)https?://[^\s<>"{}|\\^`\[\]]+|ftp://[^\s<>"{}|\\^`\[\]]+"#,
                "[URL]",
            ),
            // Student / employee IDs: letter S or ID prefix followed by digits
            (r"(?i)\b(?:s|id)\d{5,10}\b", "[ID]"),
            // Names preceded by common titles
            (
                r"(?i)\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?",
                "[PERSON]",
            ),
        ];

        let patterns = raw
            .iter()
            .map(|(pat, placeholder)| {
                let re = Regex::new(pat)
                    .unwrap_or_else(|e| panic!("Invalid deidentifier regex '{}': {}", pat, e));
                (re, *placeholder)
            })
            .collect();

        Self { patterns }
    }

    /// Apply all patterns to `text`.
    ///
    /// Returns `(cleaned_text, entity_types_found)` where `entity_types_found`
    /// is a deduplicated list of placeholder tags that were substituted.
    pub fn clean(&self, text: &str) -> (String, Vec<String>) {
        let mut current = text.to_string();
        let mut found: std::collections::HashSet<String> = std::collections::HashSet::new();

        for (re, placeholder) in &self.patterns {
            let replaced = re.replace_all(&current, *placeholder);
            if replaced != current.as_str() {
                found.insert(placeholder.to_string());
                current = replaced.into_owned();
            }
        }

        let mut entity_list: Vec<String> = found.into_iter().collect();
        entity_list.sort();

        (current, entity_list)
    }
}

impl Default for Deidentifier {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_email_redaction() {
        let d = Deidentifier::new();
        let (out, entities) = d.clean("Contact me at alice@example.com please.");
        assert!(!out.contains("alice@example.com"));
        assert!(out.contains("[EMAIL]"));
        assert!(entities.contains(&"[EMAIL]".to_string()));
    }

    #[test]
    fn test_ssn_redaction() {
        let d = Deidentifier::new();
        let (out, _) = d.clean("My SSN is 123-45-6789.");
        assert!(out.contains("[SSN]"));
    }

    #[test]
    fn test_phone_redaction() {
        let d = Deidentifier::new();
        let (out, _) = d.clean("Call me at 555-867-5309.");
        assert!(out.contains("[PHONE]"));
    }

    #[test]
    fn test_url_redaction() {
        let d = Deidentifier::new();
        let (out, _) = d.clean("Visit https://example.com/private/path for more.");
        assert!(out.contains("[URL]"));
    }

    #[test]
    fn test_person_redaction() {
        let d = Deidentifier::new();
        let (out, _) = d.clean("Dr. Smith reviewed the document.");
        assert!(out.contains("[PERSON]"));
    }

    #[test]
    fn test_no_false_positives_on_clean_text() {
        let d = Deidentifier::new();
        let text = "The quick brown fox jumps over the lazy dog.";
        let (out, entities) = d.clean(text);
        assert_eq!(out, text);
        assert!(entities.is_empty());
    }
}
