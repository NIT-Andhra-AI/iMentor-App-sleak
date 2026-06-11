use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Chunk {
    pub id: String,
    pub doc_id: String,
    pub text: String,
    pub char_start: usize,
    pub char_end: usize,
    pub chunk_index: usize,
    /// 1-based page number inferred from form-feed delimiters in source text.
    /// Present for PDFs parsed by `DocumentParser`; may be `None` for other docs.
    pub page_number: Option<usize>,
}

pub struct Chunker {
    pub chunk_size: usize,
    pub overlap: usize,
}

impl Chunker {
    pub fn new(chunk_size: usize, overlap: usize) -> Self {
        Self { chunk_size, overlap }
    }

    pub fn chunk(&self, doc_id: &str, text: &str) -> Vec<Chunk> {
        if text.is_empty() {
            return Vec::new();
        }

        let mut chunks = Vec::new();
        let mut chunk_index = 0usize;
        let mut start = 0usize;
        let chars: Vec<char> = text.chars().collect();
        let total = chars.len();

        while start < total {
            let end = (start + self.chunk_size).min(total);

            // Try to find a sentence boundary within a tolerance window near `end`
            let split_at = if end < total {
                find_sentence_boundary(&chars, start, end)
                    .or_else(|| find_word_boundary(&chars, start, end))
                    .unwrap_or(end)
            } else {
                end
            };

            // Convert char indices back to byte offsets for char_start/char_end
            let byte_start = chars[..start].iter().collect::<String>().len();
            let byte_end = chars[..split_at].iter().collect::<String>().len();
            let chunk_text: String = chars[start..split_at].iter().collect();
            let page_number = Some(chars[..start].iter().filter(|&&c| c == '\x0C').count() + 1);

            chunks.push(Chunk {
                id: Uuid::new_v4().to_string(),
                doc_id: doc_id.to_string(),
                text: chunk_text,
                char_start: byte_start,
                char_end: byte_end,
                chunk_index,
                page_number,
            });

            chunk_index += 1;

            // Advance start, stepping back by overlap
            if split_at <= start {
                // Safety: avoid infinite loop if split didn't advance
                start += 1;
            } else if split_at >= total {
                break;
            } else {
                let step = split_at - start;
                if step > self.overlap {
                    start = split_at - self.overlap;
                } else {
                    start = split_at;
                }
            }
        }

        chunks
    }
}

/// Look for a sentence boundary (.!? followed by whitespace then a capital letter or end of text)
/// within a tolerance of ±20% of chunk_size from `preferred_end`.
fn find_sentence_boundary(chars: &[char], start: usize, preferred_end: usize) -> Option<usize> {
    let total = chars.len();
    let tolerance = (preferred_end - start) / 5; // 20% tolerance
    let search_start = preferred_end.saturating_sub(tolerance).max(start + 1);
    let search_end = (preferred_end + tolerance).min(total);

    // Search backwards from preferred_end towards search_start
    let mut i = preferred_end.min(search_end).saturating_sub(1);
    loop {
        if i < search_start {
            break;
        }
        let c = chars[i];
        if matches!(c, '.' | '!' | '?') {
            // Check next non-whitespace char is uppercase or we're near the end
            let mut j = i + 1;
            while j < total && chars[j] == ' ' {
                j += 1;
            }
            if j >= total || chars[j].is_uppercase() {
                return Some(j.min(total));
            }
        }
        if i == 0 {
            break;
        }
        i -= 1;
    }
    None
}

/// Find the last word boundary (space) at or before `preferred_end`.
fn find_word_boundary(chars: &[char], start: usize, preferred_end: usize) -> Option<usize> {
    let mut i = preferred_end.min(chars.len()).saturating_sub(1);
    loop {
        if i <= start {
            break;
        }
        if chars[i] == ' ' {
            return Some(i + 1);
        }
        i -= 1;
    }
    None
}

impl Default for Chunker {
    fn default() -> Self {
        Self::new(1600, 320)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_chunking() {
        let chunker = Chunker::new(50, 10);
        let text = "Hello world. This is a test. Another sentence here. And one more.";
        let chunks = chunker.chunk("doc1", text);
        assert!(!chunks.is_empty());
        for (i, chunk) in chunks.iter().enumerate() {
            assert_eq!(chunk.chunk_index, i);
            assert_eq!(chunk.doc_id, "doc1");
        }
    }

    #[test]
    fn test_empty_text() {
        let chunker = Chunker::default();
        let chunks = chunker.chunk("doc1", "");
        assert!(chunks.is_empty());
    }
}
