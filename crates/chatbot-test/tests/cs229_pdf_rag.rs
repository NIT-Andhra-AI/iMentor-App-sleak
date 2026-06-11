use std::collections::HashSet;
use std::path::PathBuf;

use anyhow::Result;
use rag::{Chunker, DocumentParser};

fn normalize_tokens(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() > 2)
        .map(|w| w.to_string())
        .collect()
}

fn overlap_score(query: &str, chunk: &str) -> usize {
    let q: HashSet<String> = normalize_tokens(query).into_iter().collect();
    let c: HashSet<String> = normalize_tokens(chunk).into_iter().collect();
    q.intersection(&c).count()
}

fn preview(text: &str, limit: usize) -> String {
    let mut out = text.replace('\n', " ");
    if out.len() > limit {
        out.truncate(limit);
        out.push_str("...");
    }
    out
}

#[test]
fn cs229_pdf_rag_smoke_test() -> Result<()> {
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
    let pdf_path = PathBuf::from(user_profile).join("Downloads").join("main_notes.pdf");

    if !pdf_path.exists() {
        eprintln!("[SKIP] PDF not found at {}", pdf_path.display());
        return Ok(());
    }

    eprintln!("[TEST] Parsing PDF: {}", pdf_path.display());
    let parsed = DocumentParser::parse(&pdf_path)?;
    eprintln!(
        "[TEST] Parsed chars={}, words={}, pages={:?}",
        parsed.text.len(),
        parsed.word_count,
        parsed.page_count
    );

    // Basic sanity: CS229 lecture notes should produce substantial extractable text.
    assert!(
        parsed.word_count > 300,
        "Extracted text looks too small ({} words) — possible PDF extraction issue",
        parsed.word_count
    );

    let chunker = Chunker::new(1600, 320);
    let chunks = chunker.chunk("cs229", &parsed.text);
    eprintln!("[TEST] Generated {} chunks", chunks.len());
    assert!(!chunks.is_empty(), "No chunks generated from parsed PDF text");

    let questions = vec![
        "What is machine learning?",
        "What is gradient descent and how does learning rate affect it?",
        "What is overfitting and how does regularization help?",
    ];

    for q in questions {
        let mut scored: Vec<(usize, &str)> = chunks
            .iter()
            .map(|ch| (overlap_score(q, &ch.text), ch.text.as_str()))
            .collect();
        scored.sort_by(|a, b| b.0.cmp(&a.0));

        let best = scored.first().copied().unwrap_or((0, ""));
        let second = scored.get(1).copied().unwrap_or((0, ""));

        eprintln!("\n[Q] {}", q);
        eprintln!("[TOP1 score={}] {}", best.0, preview(best.1, 240));
        eprintln!("[TOP2 score={}] {}", second.0, preview(second.1, 240));

        assert!(
            best.0 > 0,
            "No lexical overlap found for question: {}",
            q
        );
    }

    Ok(())
}
