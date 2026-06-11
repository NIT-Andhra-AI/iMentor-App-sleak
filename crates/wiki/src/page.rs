use anyhow::{Context, Result};
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use std::path::Path;

/// A single wiki article derived from a Markdown file.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WikiPage {
    /// Human-readable title: the text of the first H1 heading, or the
    /// filename stem if no H1 is present.
    pub title: String,

    /// Path relative to the wiki root directory, using forward slashes,
    /// e.g. `"entities/gradient-descent.md"`.
    pub file_name: String,

    /// Raw Markdown source as loaded from disk.
    pub content: String,

    /// Plain-text representation (Markdown syntax stripped) used for
    /// full-text indexing and display snippets.
    pub plain_text: String,

    /// First 300 characters of `plain_text`, suitable for search-result
    /// previews.
    pub excerpt: String,

    /// Number of whitespace-separated words in `plain_text`.
    pub word_count: usize,
}

impl WikiPage {
    /// Load and parse a wiki page from `file_path`.
    ///
    /// `wiki_root` is the root directory of the wiki; it is used only to
    /// compute the relative `file_name` field.
    pub fn from_file(wiki_root: &Path, file_path: &Path) -> Result<Self> {
        let content = std::fs::read_to_string(file_path).with_context(|| {
            format!("Failed to read wiki file: {}", file_path.display())
        })?;

        // Relative path from wiki root, normalised to forward slashes.
        let rel_path = file_path
            .strip_prefix(wiki_root)
            .unwrap_or(file_path)
            .to_string_lossy()
            .replace('\\', "/");

        let plain_text = strip_markdown(&content);

        // Try to pull the first H1 heading text as the title.
        let title = extract_h1_title(&content).unwrap_or_else(|| {
            // Fall back to the filename stem (without extension).
            file_path
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| rel_path.clone())
        });

        // First 300 Unicode scalar values of plain text.
        let excerpt: String = plain_text.chars().take(300).collect();

        let word_count = plain_text.split_whitespace().count();

        Ok(Self {
            title,
            file_name: rel_path,
            content,
            plain_text,
            excerpt,
            word_count,
        })
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Walk the pulldown-cmark event stream and return the text content of the
/// first level-1 heading, if one exists.
fn extract_h1_title(markdown: &str) -> Option<String> {
    let parser = Parser::new_ext(markdown, Options::all());
    let mut in_h1 = false;
    let mut title_buf = String::new();

    for event in parser {
        match event {
            Event::Start(Tag::Heading { level: HeadingLevel::H1, .. }) => {
                in_h1 = true;
            }
            Event::End(TagEnd::Heading(HeadingLevel::H1)) => {
                if in_h1 && !title_buf.is_empty() {
                    return Some(title_buf.trim().to_owned());
                }
                in_h1 = false;
            }
            Event::Text(text) | Event::Code(text) if in_h1 => {
                title_buf.push_str(&text);
            }
            _ => {}
        }
    }
    None
}

/// Convert Markdown to plain text by collecting only the text-bearing events
/// from the pulldown-cmark event stream.
///
/// Block-level elements are separated by newlines so that word boundaries are
/// preserved when the result is used for full-text indexing.
pub(crate) fn strip_markdown(markdown: &str) -> String {
    let parser = Parser::new_ext(markdown, Options::all());
    let mut output = String::with_capacity(markdown.len());

    // Track whether the last character written was whitespace so we can avoid
    // emitting redundant blank lines.
    let mut last_was_newline = false;

    for event in parser {
        match event {
            // Inline text content — always include.
            Event::Text(text) => {
                output.push_str(&text);
                last_was_newline = text.ends_with('\n');
            }

            // Inline code spans — include the raw code text.
            Event::Code(code) => {
                output.push_str(&code);
                last_was_newline = false;
            }

            // Hard line breaks inside paragraphs.
            Event::HardBreak => {
                output.push('\n');
                last_was_newline = true;
            }

            // Soft line breaks (single newline in source) — collapse to a space
            // so consecutive words are not merged.
            Event::SoftBreak => {
                output.push(' ');
                last_was_newline = false;
            }

            // Block-level end tags: separate blocks with a blank line.
            Event::End(
                TagEnd::Paragraph
                | TagEnd::Heading(_)
                | TagEnd::BlockQuote
                | TagEnd::CodeBlock
                | TagEnd::Item
                | TagEnd::TableRow,
            ) => {
                if !last_was_newline {
                    output.push('\n');
                }
                output.push('\n');
                last_was_newline = true;
            }

            // HTML nodes — skip entirely (don't expose raw HTML in plain text).
            Event::Html(_) | Event::InlineHtml(_) => {}

            // Rule / thematic break — blank line.
            Event::Rule => {
                if !last_was_newline {
                    output.push('\n');
                }
                output.push('\n');
                last_was_newline = true;
            }

            // Table cell separator — separate with a tab.
            Event::End(TagEnd::TableCell | TagEnd::TableHead) => {
                output.push('\t');
                last_was_newline = false;
            }

            // Everything else (start tags, footnotes, task-list markers, …)
            // produces no text output; we just let them pass.
            _ => {}
        }
    }

    // Trim leading/trailing whitespace and collapse runs of 3+ newlines.
    collapse_blank_lines(output.trim())
}

/// Replace three or more consecutive newlines with exactly two newlines.
fn collapse_blank_lines(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut newline_count = 0usize;

    for ch in s.chars() {
        if ch == '\n' {
            newline_count += 1;
            if newline_count <= 2 {
                result.push('\n');
            }
        } else {
            newline_count = 0;
            result.push(ch);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_markdown_basic() {
        let md = "# Hello\n\nThis is **bold** and _italic_ text.\n";
        let plain = strip_markdown(md);
        assert!(plain.contains("Hello"));
        assert!(plain.contains("bold"));
        assert!(plain.contains("italic"));
        assert!(!plain.contains("**"));
        assert!(!plain.contains('_'));
    }

    #[test]
    fn test_extract_h1() {
        let md = "# My Title\n\nSome content.";
        assert_eq!(extract_h1_title(md), Some("My Title".to_string()));
    }

    #[test]
    fn test_extract_h1_missing() {
        let md = "## Not H1\n\nSome content.";
        assert_eq!(extract_h1_title(md), None);
    }

    #[test]
    fn test_excerpt_length() {
        let long_md: String = "word ".repeat(200);
        let plain = strip_markdown(&long_md);
        let excerpt: String = plain.chars().take(300).collect();
        assert!(excerpt.chars().count() <= 300);
    }
}
