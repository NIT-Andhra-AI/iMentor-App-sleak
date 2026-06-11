use std::path::Path;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ParsedDocument {
    pub file_name: String,
    pub text: String,
    pub page_count: Option<usize>,
    pub word_count: usize,
}

pub struct DocumentParser;

impl DocumentParser {
    pub fn parse(file_path: &Path) -> anyhow::Result<ParsedDocument> {
        let ext = file_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());

        let file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let (text, page_count) = match ext.as_deref() {
            Some("pdf") => {
                let text = Self::parse_pdf(file_path)?;
                // Count form-feed characters as rough page delimiters; lopdf gives us page count separately
                let pages = text.chars().filter(|&c| c == '\x0C').count() + 1;
                (text, Some(pages))
            }
            Some("docx") => {
                let text = Self::parse_docx(file_path)?;
                (text, None)
            }
            Some("txt") | Some("md") | None => {
                let text = Self::parse_txt(file_path)?;
                (text, None)
            }
            Some(other) => {
                anyhow::bail!("Unsupported file extension: {}", other);
            }
        };

        let word_count = text.split_whitespace().count();

        Ok(ParsedDocument {
            file_name,
            text,
            page_count,
            word_count,
        })
    }

    fn parse_pdf(path: &Path) -> anyhow::Result<String> {
        use lopdf::Document;

        let doc = Document::load(path)?;
        let mut all_text = String::new();

        // get_pages() returns a HashMap — must sort so pages are in document order.
        // Without sorting, form-feed positions are random, breaking all page-number citations.
        let mut pages: Vec<u32> = doc.get_pages().keys().copied().collect();
        pages.sort_unstable();
        eprintln!("[PDF] Parsing document with {} pages", pages.len());

        for (idx, page_num) in pages.iter().enumerate() {
            match doc.extract_text(&[*page_num]) {
                Ok(page_text) => {
                    let text_len = page_text.len();
                    eprintln!("[PDF] Page {}: extracted {} bytes", page_num, text_len);
                    if text_len > 0 && text_len < 500 {
                        eprintln!("[PDF] Page {} preview: {}", page_num, &page_text[..text_len.min(200)]);
                    }
                    all_text.push_str(&page_text);
                    all_text.push('\n');
                    // Keep explicit page delimiters so downstream chunks can
                    // map back to PDF page numbers for citations.
                    if idx + 1 < pages.len() {
                        all_text.push('\x0C');
                        all_text.push('\n');
                    }
                }
                Err(e) => {
                    eprintln!("[PDF] Warning: could not extract text from page {}: {}", page_num, e);
                }
            }
        }

        let total_text_len = all_text.len();
        let word_count = all_text.split_whitespace().count();
        eprintln!("[PDF] Parsing complete: {} chars, {} words", total_text_len, word_count);
        
        Ok(all_text)
    }

    fn parse_docx(path: &Path) -> anyhow::Result<String> {
        use docx_rs::read_docx;
        use std::io::Read;

        let mut file = std::fs::File::open(path)?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf)?;
        eprintln!("[DOCX] Parsing document: {} bytes", buf.len());

        let docx = read_docx(&buf).map_err(|e| anyhow::anyhow!("Failed to parse DOCX: {:?}", e))?;

        let mut text = String::new();
        for child in &docx.document.children {
            extract_docx_text(child, &mut text);
        }

        let word_count = text.split_whitespace().count();
        eprintln!("[DOCX] Parsing complete: {} chars, {} words", text.len(), word_count);
        
        Ok(text)
    }

    fn parse_txt(path: &Path) -> anyhow::Result<String> {
        let bytes = std::fs::read(path)?;
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    }
}

fn extract_docx_text(child: &docx_rs::DocumentChild, text: &mut String) {
    use docx_rs::DocumentChild;
    match child {
        DocumentChild::Paragraph(para) => {
            for run_child in &para.children {
                use docx_rs::ParagraphChild;
                if let ParagraphChild::Run(run) = run_child {
                    for run_child in &run.children {
                        use docx_rs::RunChild;
                        if let RunChild::Text(t) = run_child {
                            text.push_str(&t.text);
                        }
                    }
                }
            }
            text.push('\n');
        }
        DocumentChild::Table(table) => {
            for row in &table.rows {
                use docx_rs::TableChild;
                let TableChild::TableRow(tr) = row;
                for cell in &tr.cells {
                    use docx_rs::TableRowChild;
                    let TableRowChild::TableCell(tc) = cell;
                    for cell_child in &tc.children {
                        use docx_rs::TableCellContent;
                        if let TableCellContent::Paragraph(para) = cell_child {
                            for run_child in &para.children {
                                use docx_rs::ParagraphChild;
                                if let ParagraphChild::Run(run) = run_child {
                                    for rc in &run.children {
                                        use docx_rs::RunChild;
                                        if let RunChild::Text(t) = rc {
                                            text.push_str(&t.text);
                                        }
                                    }
                                }
                            }
                            text.push('\t');
                        }
                    }
                }
                text.push('\n');
            }
        }
        _ => {}
    }
}
