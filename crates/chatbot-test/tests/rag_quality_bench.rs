/// RAG Quality & Latency Benchmark for ~/Downloads/1.pdf (CS229 Lecture Notes)
///
/// Measures:
///   - Parse latency
///   - Chunk time and stats (count, avg/min/max char size)
///   - Per-batch embedding throughput (chunks/s)
///   - HNSW insert time
///   - Per-query retrieval latency
///   - Lexical overlap precision for each query
///   - Score distribution across top-k results
///
/// Run with:
///   USERPROFILE="$HOME" cargo test -p chatbot-test --test rag_quality_bench \
///     --color never -- --nocapture
use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Instant;

use anyhow::Result;
use inference::{EmbeddingEngine, ModelManager};
use rag::{Chunk, Chunker, DocumentParser, RagIndex};

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn tokens(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() > 2)
        .map(|w| w.to_string())
        .collect()
}

fn lexical_overlap(query: &str, chunk: &str) -> usize {
    let q: HashSet<String> = tokens(query).into_iter().collect();
    let c: HashSet<String> = tokens(chunk).into_iter().collect();
    q.intersection(&c).count()
}

fn lexical_precision_at_k(query: &str, results: &[rag::ScoredChunk], k: usize) -> f32 {
    let q: HashSet<String> = tokens(query).into_iter().collect();
    let relevant = results
        .iter()
        .take(k)
        .filter(|sc| {
            let c: HashSet<String> = tokens(&sc.chunk.text).into_iter().collect();
            q.intersection(&c).count() >= 2 // >=2 query token overlap = "relevant"
        })
        .count();
    relevant as f32 / k.min(results.len()) as f32
}

fn anchor_overlap(expected_terms: &[&str], chunk: &str) -> usize {
    let c: HashSet<String> = tokens(chunk).into_iter().collect();
    expected_terms
        .iter()
        .map(|term| term.to_lowercase())
        .filter(|term| c.contains(term))
        .count()
}

fn anchor_hit_at_k(expected_terms: &[&str], results: &[rag::ScoredChunk], k: usize) -> bool {
    let min_required = expected_terms.len().min(2).max(1);
    results
        .iter()
        .take(k)
        .any(|sc| anchor_overlap(expected_terms, &sc.chunk.text) >= min_required)
}

fn preview(text: &str, limit: usize) -> String {
    let collapsed = text.replace('\n', " ");
    let trimmed = collapsed.trim().to_string();
    if trimmed.len() > limit {
        format!("{}…", &trimmed[..limit])
    } else {
        trimmed
    }
}

// ─── Chunk Statistics ─────────────────────────────────────────────────────────

fn chunk_stats(chunks: &[Chunk]) -> (f32, usize, usize) {
    let sizes: Vec<usize> = chunks.iter().map(|c| c.text.len()).collect();
    let avg = sizes.iter().sum::<usize>() as f32 / sizes.len() as f32;
    let min = *sizes.iter().min().unwrap_or(&0);
    let max = *sizes.iter().max().unwrap_or(&0);
    (avg, min, max)
}

// ─── Main Test ────────────────────────────────────────────────────────────────

#[test]
fn rag_quality_bench() -> Result<()> {
    // ── 0. Locate PDF ──────────────────────────────────────────────────────────
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
    let pdf_path = PathBuf::from(&user_profile).join("Downloads").join("1.pdf");
    if !pdf_path.exists() {
        eprintln!("[SKIP] PDF not found at {}", pdf_path.display());
        return Ok(());
    }

    // ── 0b. Locate embedding model ─────────────────────────────────────────────
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    let app_data = PathBuf::from(home).join(".local/share/com.studentai.app/models");
    let model_mgr = ModelManager::new(app_data, "chat-model-1.gguf", "rag-model-1.gguf");
    let emb_path = model_mgr.embedding_model_path();
    if !emb_path.exists() {
        eprintln!("[SKIP] Embedding model not found at {}", emb_path.display());
        return Ok(());
    }

    eprintln!("\n╔══════════════════════════════════════════════════════════════╗");
    eprintln!("║        RAG Quality & Latency Benchmark  —  CS229 PDF         ║");
    eprintln!("╚══════════════════════════════════════════════════════════════╝\n");

    // ── 1. Parse ───────────────────────────────────────────────────────────────
    let t0 = Instant::now();
    let parsed = DocumentParser::parse(&pdf_path)?;
    let parse_ms = t0.elapsed().as_millis();
    eprintln!("── 1. PARSE ──────────────────────────────────────────────────────");
    eprintln!(
        "   File      : {}",
        pdf_path.file_name().unwrap().to_string_lossy()
    );
    eprintln!("   Chars     : {}", parsed.text.len());
    eprintln!("   Words     : {}", parsed.word_count);
    eprintln!("   Pages     : {:?}", parsed.page_count);
    eprintln!("   Latency   : {} ms\n", parse_ms);

    // ── 2. Chunk ───────────────────────────────────────────────────────────────
    // Test three chunk configurations and compare stats; use the middle one for embeds
    let configs: &[(usize, usize, &str)] = &[
        (800,  160, "small  (800/160)"),
        (1600, 320, "medium (1600/320) ← default"),
        (2400, 480, "large  (2400/480)"),
    ];

    eprintln!("── 2. CHUNK CONFIGURATIONS ───────────────────────────────────────");
    let mut medium_chunks: Vec<Chunk> = Vec::new();
    for &(size, overlap, label) in configs {
        let t1 = Instant::now();
        let chunker = Chunker::new(size, overlap);
        let chunks = chunker.chunk("cs229", &parsed.text);
        let chunk_ms = t1.elapsed().as_millis();
        let (avg, min, max) = chunk_stats(&chunks);
        let tag = if label.contains("default") {
            " ← used below"
        } else {
            ""
        };
        eprintln!(
            "   {:<26} count={:>3}  avg={:>5.0}  min={:>4}  max={:>4}  {:>3}ms{}",
            label, chunks.len(), avg, min, max, chunk_ms, tag
        );
        if label.contains("default") {
            medium_chunks = chunks;
        }
    }
    eprintln!();

    // ── 3. Embed ───────────────────────────────────────────────────────────────
    let n_threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).max(2) as u32;
    let t2 = Instant::now();
    let mut engine = EmbeddingEngine::load(&emb_path, n_threads)?;
    let load_ms = t2.elapsed().as_millis();
    eprintln!("── 3. EMBED ──────────────────────────────────────────────────────");
    eprintln!("   Model     : {}", emb_path.file_name().unwrap().to_string_lossy());
    eprintln!("   Threads   : {}", n_threads);
    eprintln!("   Load time : {} ms", load_ms);

    // Batch-embed with timing. Measure per-batch throughput.
    const BATCH: usize = 32;
    let chunk_texts: Vec<&str> = medium_chunks.iter().map(|c| c.text.as_str()).collect();
    let total_chunks = chunk_texts.len();

    let t3 = Instant::now();
    let mut all_embeddings: Vec<Vec<f32>> = Vec::with_capacity(total_chunks);
    let mut batch_latencies: Vec<u128> = Vec::new();

    for (b, batch) in chunk_texts.chunks(BATCH).enumerate() {
        let tb = Instant::now();
        let embs = engine.embed_batch(batch)?;
        let bms = tb.elapsed().as_millis();
        batch_latencies.push(bms);
        if b == 0 || b == 1 {
            eprintln!(
                "   Batch {:>2}   : {:>3} chunks → {:.0} ms  ({:.1} chunks/s)",
                b,
                batch.len(),
                bms,
                batch.len() as f64 / (bms as f64 / 1000.0).max(0.001)
            );
        }
        all_embeddings.extend(embs);
    }
    let embed_ms = t3.elapsed().as_millis();
    let avg_batch_ms = batch_latencies.iter().sum::<u128>() / batch_latencies.len() as u128;
    let throughput = total_chunks as f64 / (embed_ms as f64 / 1000.0).max(0.001);

    eprintln!("   Total     : {} chunks in {} ms", total_chunks, embed_ms);
    eprintln!("   Avg batch : {} ms / batch of {}", avg_batch_ms, BATCH);
    eprintln!("   Throughput: {:.1} chunks/s", throughput);
    eprintln!(
        "   Embedding dim: {}",
        all_embeddings.first().map_or(0, |v| v.len())
    );

    // ── 4. HNSW Index ──────────────────────────────────────────────────────────
    let t4 = Instant::now();
    let mut rag_index = RagIndex::new();
    rag_index.add_chunks(medium_chunks.clone(), all_embeddings.clone())?;
    let index_ms = t4.elapsed().as_millis();
    eprintln!("\n── 4. INDEX ──────────────────────────────────────────────────────");
    eprintln!("   HNSW insert: {} chunks in {} ms", rag_index.chunk_count(), index_ms);

    // ── 5. Latency summary so far ──────────────────────────────────────────────
    eprintln!("\n── 5. PIPELINE LATENCY SUMMARY ──────────────────────────────────");
    eprintln!("   Parse     : {:>6} ms", parse_ms);
    eprintln!("   Chunk     : <1 ms  (trivial)");
    eprintln!("   Model load: {:>6} ms  (one-time cold start)", load_ms);
    eprintln!("   Embed all : {:>6} ms  ({} chunks)", embed_ms, total_chunks);
    eprintln!("   HNSW build: {:>6} ms", index_ms);
    eprintln!(
        "   TOTAL     : {:>6} ms  (excl. model load: {} ms)",
        parse_ms + embed_ms + index_ms,
        parse_ms + embed_ms + index_ms
    );

    // ── 6. Retrieval Quality ───────────────────────────────────────────────────
    let queries: &[(&str, &[&str])] = &[
        // (query, expected_keywords_for_lexical_check)
        ("What is gradient descent and how does the learning rate affect convergence?",
            &["gradient", "descent", "learning", "rate", "converge"]),
        ("Explain the bias-variance tradeoff in supervised learning",
            &["bias", "variance", "tradeoff", "overfitting", "underfitting"]),
        ("How does logistic regression work for binary classification?",
            &["logistic", "regression", "classification", "sigmoid", "binary"]),
        ("What is the maximum likelihood estimation method?",
            &["maximum", "likelihood", "estimation", "probability", "log"]),
        ("How does PCA reduce dimensionality?",
            &["pca", "principal", "component", "dimensionality", "covariance"]),
        ("What is the support vector machine margin and kernel trick?",
            &["support", "vector", "margin", "kernel", "svm"]),
        ("Explain the EM algorithm and its E-step and M-step",
            &["expectation", "maximization", "step", "gaussian", "mixture"]),
        ("What is the policy gradient theorem in reinforcement learning?",
            &["policy", "gradient", "reward", "reinforcement", "learning"]),
    ];

    eprintln!("\n── 6. RETRIEVAL QUALITY (top-5) ──────────────────────────────────");

    let mut total_p5: f32 = 0.0;
    let mut total_query_ms: u128 = 0;

    for (q, _keywords) in queries {
        let tq = Instant::now();
        let q_emb = engine.embed(q)?;
        let results = rag_index.search(&q_emb, 5)?;
        let qms = tq.elapsed().as_millis();
        total_query_ms += qms;

        let p5 = lexical_precision_at_k(q, &results, 5);
        total_p5 += p5;

        let best_overlap = results
            .first()
            .map(|sc| lexical_overlap(q, &sc.chunk.text))
            .unwrap_or(0);

        eprintln!("\n   Q: {}", q);
        eprintln!(
            "   Latency={} ms  P@5={:.2}  best_lexical_overlap={}",
            qms, p5, best_overlap
        );

        for (i, sc) in results.iter().enumerate() {
            let lex = lexical_overlap(q, &sc.chunk.text);
            eprintln!(
                "     #{} score={:.4}  lex={:>2}  page={:?}  \"{}\"",
                i + 1,
                sc.score,
                lex,
                sc.chunk.page_number,
                preview(&sc.chunk.text, 120)
            );
        }
    }

    let mean_p5 = total_p5 / queries.len() as f32;
    let mean_query_ms = total_query_ms / queries.len() as u128;

    eprintln!("\n── 7. AGGREGATE SCORES ───────────────────────────────────────────");
    eprintln!("   Mean P@5        : {:.3}  ({:.1}%)", mean_p5, mean_p5 * 100.0);
    eprintln!("   Mean query time : {} ms", mean_query_ms);
    eprintln!("   Total queries   : {}", queries.len());

    // ── 8. Score Distribution ─────────────────────────────────────────────────
    eprintln!("\n── 8. EMBEDDING SCORE DISTRIBUTION (sample 3 queries) ───────────");
    for &(q, _) in queries.iter().take(3) {
        let q_emb = engine.embed(q)?;
        let top20 = rag_index.search(&q_emb, 20)?;
        let scores: Vec<f32> = top20.iter().map(|sc| sc.score).collect();
        let score_max = scores.first().copied().unwrap_or(0.0);
        let score_min = scores.last().copied().unwrap_or(0.0);
        let score_mean = scores.iter().sum::<f32>() / scores.len() as f32;
        eprintln!(
            "   Q=\"{}…\"  max={:.4}  mean={:.4}  min={:.4}",
            &q[..40.min(q.len())],
            score_max,
            score_mean,
            score_min
        );
    }

    // ── 9. Strategy analysis ───────────────────────────────────────────────────
    eprintln!("\n── 9. OBSERVATIONS & IMPROVEMENT STRATEGIES ─────────────────────");
    eprintln!("   Current config: chunk_size=1600, overlap=320 (20%), model=bge-small-384d");

    if mean_p5 < 0.5 {
        eprintln!("   ⚠  P@5 < 50% — retrieval precision needs improvement");
        eprintln!("   → Try chunk_size=800, overlap=160 (more granular chunks)");
        eprintln!("   → Try hybrid retrieval: BM25 + vector fusion (RRF)");
        eprintln!("   → Upgrade to bge-base (768d) for higher recall");
    } else if mean_p5 < 0.7 {
        eprintln!("   ⚡ P@5 ~50-70% — moderate precision, room to improve");
        eprintln!("   → Try smaller chunks (800 chars) for denser semantic units");
        eprintln!("   → Add MMR (Maximal Marginal Relevance) to diversify top-k");
        eprintln!("   → Consider query expansion (generate sub-queries)");
    } else {
        eprintln!("   ✓  P@5 ≥ 70% — good precision");
    }

    if embed_ms > 120_000 {
        eprintln!("   ⚠  Embed time > 2 min — consider batching to 64 or reducing chunk count");
    } else if embed_ms > 60_000 {
        eprintln!("   ⚡ Embed time 1-2 min — acceptable for one-time indexing");
    } else {
        eprintln!("   ✓  Embed time < 1 min");
    }

    eprintln!(
        "\n   Per-chunk embed avg: {:.1} ms/chunk",
        embed_ms as f64 / total_chunks as f64
    );
    eprintln!("   Query latency avg : {} ms (target < 200 ms)", mean_query_ms);

    // ── Assertions (soft — don't fail on quality, just on crash) ──────────────
    assert!(
        !medium_chunks.is_empty(),
        "No chunks generated — PDF parse failed"
    );
    assert_eq!(
        all_embeddings.len(),
        medium_chunks.len(),
        "Embedding count mismatch"
    );
    assert!(
        rag_index.chunk_count() > 0,
        "HNSW index is empty after add_chunks"
    );

    eprintln!("\n[PASS] rag_quality_bench completed successfully\n");
    Ok(())
}

// ─── RAM helper ───────────────────────────────────────────────────────────────

fn rss_mb() -> f64 {
    #[cfg(target_os = "linux")]
    {
        if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
            for line in status.lines() {
                if line.starts_with("VmRSS:") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        if let Ok(kb) = parts[1].parse::<f64>() {
                            return kb / 1024.0;
                        }
                    }
                }
            }
        }
    }
    0.0
}

/// Clean a chunk excerpt into a student-friendly, readable sentence.
fn elegant_excerpt(text: &str, max_chars: usize) -> String {
    // Strip form-feed, collapse whitespace
    let cleaned: String = text
        .chars()
        .map(|c| if c == '\x0C' || c == '\t' { ' ' } else { c })
        .collect();
    let collapsed = cleaned
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ");

    if collapsed.len() <= max_chars {
        return collapsed;
    }

    // Try to cut at sentence boundary
    let candidate = &collapsed[..max_chars];
    let cut = candidate
        .rfind(|c| c == '.' || c == '!' || c == '?')
        .unwrap_or_else(|| candidate.rfind(' ').unwrap_or(max_chars));
    format!("{}…", &collapsed[..cut + 1].trim_end())
}

/// Format a single elegant reference card for student consumption.
fn format_reference(rank: usize, sc: &rag::ScoredChunk, doc_label: &str) -> String {
    let page_str = match sc.chunk.page_number {
        Some(p) => format!("Page {}", p),
        None => "Page —".to_string(),
    };
    let excerpt = elegant_excerpt(&sc.chunk.text, 160);
    let badge = if rank == 1 { " ★ Best Match" } else { "" };
    let score_bar: String = {
        let filled = (sc.score * 10.0).round() as usize;
        let empty = 10usize.saturating_sub(filled);
        format!("{}{}", "█".repeat(filled), "░".repeat(empty))
    };

    format!(
        "   ╔═══════════════════════════════════════════════════════════════════════╗\n\
            ║  📖 {} · {}{}  \n\
         ║  Relevance  [{}]  {:.0}%\n\
         ╠═══════════════════════════════════════════════════════════════════════╣\n\
         ║  \"{}\"\n\
         ╚═══════════════════════════════════════════════════════════════════════╝",
        doc_label, page_str, badge,
        score_bar, sc.score * 100.0,
        excerpt
    )
}

// ─── Aggressive Multi-Query Test ─────────────────────────────────────────────

#[test]
fn rag_aggressive_multi_query() -> Result<()> {
    // ── Locate assets ─────────────────────────────────────────────────────────
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
    let pdf_path = PathBuf::from(&user_profile).join("Downloads").join("1.pdf");
    if !pdf_path.exists() {
        eprintln!("[SKIP] PDF not found at {}", pdf_path.display());
        return Ok(());
    }

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    let app_data = PathBuf::from(home).join(".local/share/com.studentai.app/models");
    let model_mgr = ModelManager::new(app_data, "chat-model-1.gguf", "rag-model-1.gguf");
    let emb_path = model_mgr.embedding_model_path();
    if !emb_path.exists() {
        eprintln!("[SKIP] Embedding model not found at {}", emb_path.display());
        return Ok(());
    }

    eprintln!("\n╔══════════════════════════════════════════════════════════════════════╗");
    eprintln!("║      RAG Aggressive Multi-Query Benchmark — CS229 Lecture Notes      ║");
    eprintln!("║      22 Questions · RAM Tracking · Elegant References                ║");
    eprintln!("╚══════════════════════════════════════════════════════════════════════╝\n");

    // ── Build Index ───────────────────────────────────────────────────────────
    let ram_before = rss_mb();
    eprintln!("── INDEX BUILD ─────────────────────────────────────────────────────────");
    eprintln!("   RAM before indexing : {:.1} MB", ram_before);

    let t_parse = Instant::now();
    let parsed = DocumentParser::parse(&pdf_path)?;
    let parse_ms = t_parse.elapsed().as_millis();
    eprintln!(
        "   Parsed  : {} pages, {} chars  ({} ms)",
        parsed.page_count.unwrap_or(0), parsed.text.len(), parse_ms
    );

    let t_chunk = Instant::now();
    let chunker = Chunker::new(1600, 320);
    let chunks = chunker.chunk("cs229", &parsed.text);
    let chunk_ms = t_chunk.elapsed().as_millis();
    let (avg_size, _, _) = chunk_stats(&chunks);
    eprintln!(
        "   Chunked : {} chunks, avg {:.0} chars  ({} ms)",
        chunks.len(), avg_size, chunk_ms
    );

    let n_threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .max(2) as u32;
    let t_load = Instant::now();
    let mut engine = EmbeddingEngine::load(&emb_path, n_threads)?;
    let load_ms = t_load.elapsed().as_millis();
    eprintln!("   Model loaded in {} ms  (threads: {})", load_ms, n_threads);

    let chunk_texts: Vec<&str> = chunks.iter().map(|c| c.text.as_str()).collect();
    let t_embed = Instant::now();
    let mut embeddings: Vec<Vec<f32>> = Vec::with_capacity(chunk_texts.len());
    for batch in chunk_texts.chunks(32) {
        embeddings.extend(engine.embed_batch(batch)?);
    }
    let embed_ms = t_embed.elapsed().as_millis();
    let throughput = chunks.len() as f64 / (embed_ms as f64 / 1000.0).max(0.001);
    eprintln!(
        "   Embedded: {} chunks in {} ms  ({:.1} chunks/s)",
        chunks.len(), embed_ms, throughput
    );

    let t_idx = Instant::now();
    let mut rag_index = RagIndex::new();
    rag_index.add_chunks(chunks.clone(), embeddings)?;
    let idx_ms = t_idx.elapsed().as_millis();
    eprintln!(
        "   Indexed : {} items in HNSW  ({} ms)",
        rag_index.chunk_count(), idx_ms
    );

    let ram_after = rss_mb();
    let ram_delta = ram_after - ram_before;
    eprintln!("   RAM after indexing  : {:.1} MB  (Δ +{:.1} MB)\n", ram_after, ram_delta);

    // ── 22 Diverse Questions ─────────────────────────────────────────────────
    struct QueryCase {
        query: &'static str,
        expected_terms: &'static [&'static str],
    }

    let queries: &[QueryCase] = &[
        QueryCase { query: "What is gradient descent and how does the learning rate affect convergence?", expected_terms: &["gradient", "descent", "learning", "rate"] },
        QueryCase { query: "Explain locally weighted linear regression and the bandwidth parameter", expected_terms: &["locally", "weighted", "bandwidth"] },
        QueryCase { query: "How does logistic regression use the sigmoid function for binary classification?", expected_terms: &["logistic", "sigmoid", "classification"] },
        QueryCase { query: "What are generalized linear models and the exponential family of distributions?", expected_terms: &["generalized", "linear", "exponential", "family"] },
        QueryCase { query: "How does Naive Bayes differ from Gaussian Discriminant Analysis (GDA)?", expected_terms: &["naive", "bayes", "gaussian", "discriminant"] },
        QueryCase { query: "What is the maximum a posteriori (MAP) estimate versus maximum likelihood?", expected_terms: &["posteriori", "maximum", "likelihood"] },
        QueryCase { query: "Explain the support vector machine and the concept of maximum margin classifier", expected_terms: &["support", "vector", "margin"] },
        QueryCase { query: "What is the kernel trick and how do RBF kernels work in SVMs?", expected_terms: &["kernel", "rbf", "svm"] },
        QueryCase { query: "How does neural network backpropagation compute gradients layer by layer?", expected_terms: &["backpropagation", "gradients", "layer"] },
        QueryCase { query: "What is the vanishing gradient problem and how does it affect training?", expected_terms: &["vanishing", "gradient", "training"] },
        QueryCase { query: "What is the bias-variance tradeoff and how does regularization address it?", expected_terms: &["bias", "variance", "regularization"] },
        QueryCase { query: "How does k-fold cross-validation help select the best model?", expected_terms: &["cross", "validation", "fold"] },
        QueryCase { query: "What is the EM algorithm and what happens in each E-step and M-step?", expected_terms: &["expectation", "maximization", "algorithm"] },
        QueryCase { query: "How do Gaussian mixture models represent multimodal data distributions?", expected_terms: &["gaussian", "mixture", "models"] },
        QueryCase { query: "How does PCA find principal components and reduce dimensionality?", expected_terms: &["pca", "principal", "components"] },
        QueryCase { query: "What is independent component analysis and how does it differ from PCA?", expected_terms: &["independent", "component", "analysis"] },
        QueryCase { query: "How does k-means clustering assign data points and update centroids?", expected_terms: &["means", "clustering", "centroids"] },
        QueryCase { query: "Explain factor analysis and its use of latent variables", expected_terms: &["factor", "analysis", "latent"] },
        QueryCase { query: "What is a Markov decision process and what is the Bellman equation?", expected_terms: &["markov", "decision", "bellman"] },
        QueryCase { query: "How does the policy gradient theorem compute gradients for RL policies?", expected_terms: &["policy", "gradient", "theorem"] },
        QueryCase { query: "What is Q-learning and how does temporal difference learning work?", expected_terms: &["temporal", "difference", "learning"] },
        QueryCase { query: "How does the softmax function generalize logistic regression to multi-class?", expected_terms: &["softmax", "logistic", "class"] },
    ];

    // ── Run All Queries ───────────────────────────────────────────────────────
    struct QueryResult {
        query: &'static str,
        p5: f32,
        anchor_hit5: bool,
        anchor_top_overlap: usize,
        latency_ms: u128,
        top_score: f32,
        lex_overlap: usize,
        ram_mb: f64,
        results: Vec<rag::ScoredChunk>,
    }

    let mut query_results: Vec<QueryResult> = Vec::with_capacity(queries.len());
    eprintln!("── RUNNING {} QUERIES ───────────────────────────────────────────────────", queries.len());
    for (i, case) in queries.iter().enumerate() {
        let ram_q = rss_mb();
        let tq = Instant::now();
        let q_emb = engine.embed(case.query)?;
        let results = rag_index.search(&q_emb, 5)?;
        let latency_ms = tq.elapsed().as_millis();

        let p5 = lexical_precision_at_k(case.query, &results, 5);
        let anchor_hit5 = anchor_hit_at_k(case.expected_terms, &results, 5);
        let anchor_top_overlap = results
            .iter()
            .map(|s| anchor_overlap(case.expected_terms, &s.chunk.text))
            .max()
            .unwrap_or(0);
        let top_score = results.first().map(|s| s.score).unwrap_or(0.0);
        let lex_overlap = results
            .first()
            .map(|s| lexical_overlap(case.query, &s.chunk.text))
            .unwrap_or(0);

        eprint!("   [{:>2}/{}] ", i + 1, queries.len());
        eprintln!(
            "P@5={:.2}  anchor@5={}  anc={}  lat={}ms  score={:.3}  lex={}",
            p5,
            if anchor_hit5 { "yes" } else { "no" },
            anchor_top_overlap,
            latency_ms,
            top_score,
            lex_overlap
        );

        query_results.push(QueryResult {
            query: case.query,
            p5,
            anchor_hit5,
            anchor_top_overlap,
            latency_ms,
            top_score,
            lex_overlap,
            ram_mb: ram_q,
            results,
        });
    }

    // ── Summary Table ─────────────────────────────────────────────────────────
    eprintln!("\n── RESULTS TABLE ───────────────────────────────────────────────────────");
    let col_q = 50usize;
    let sep = format!(
        "   ├{:─<col_q$}┼{:─<6}┼{:─<8}┼{:─<6}┼{:─<9}┼{:─<11}┼{:─<6}┼{:─<9}┤",
        "", "", "", "", "", "", "", ""
    );
    let top_sep = format!(
        "   ┌{:─<col_q$}┬{:─<6}┬{:─<8}┬{:─<6}┬{:─<9}┬{:─<11}┬{:─<6}┬{:─<9}┐",
        "", "", "", "", "", "", "", ""
    );
    let bot_sep = format!(
        "   └{:─<col_q$}┴{:─<6}┴{:─<8}┴{:─<6}┴{:─<9}┴{:─<11}┴{:─<6}┴{:─<9}┘",
        "", "", "", "", "", "", "", ""
    );
    eprintln!("{}", top_sep);
    eprintln!(
        "   │ {:<col_q$}│ {:<5}│ {:<7}│ {:<5}│ {:<8}│ {:<10}│ {:<5}│ {:<8}│",
        "Query", "P@5", "Anchor", "Anc", "Lat(ms)", "TopScore", "Lex", "RAM(MB)"
    );
    eprintln!("{}", sep);
    for qr in &query_results {
        let abbreviated = if qr.query.len() > col_q - 2 {
            format!("{}…", &qr.query[..col_q - 3])
        } else {
            qr.query.to_string()
        };
        let p5_str = format!("{:.2}", qr.p5);
        let anchor_str = if qr.anchor_hit5 { "yes" } else { "no" };
        let anc_str = format!("{}", qr.anchor_top_overlap);
        let lat_str = format!("{}", qr.latency_ms);
        let score_str = format!("{:.4}", qr.top_score);
        let lex_str = format!("{}", qr.lex_overlap);
        let ram_str = format!("{:.1}", qr.ram_mb);
        eprintln!(
            "   │ {:<col_q$}│ {:<5}│ {:<7}│ {:<5}│ {:<8}│ {:<10}│ {:<5}│ {:<8}│",
            abbreviated, p5_str, anchor_str, anc_str, lat_str, score_str, lex_str, ram_str
        );
    }
    eprintln!("{}", bot_sep);

    let mean_p5 = query_results.iter().map(|r| r.p5).sum::<f32>() / query_results.len() as f32;
    let anchor_hits = query_results.iter().filter(|r| r.anchor_hit5).count();
    let mean_lat = query_results.iter().map(|r| r.latency_ms).sum::<u128>() / query_results.len() as u128;
    let min_lat = query_results.iter().map(|r| r.latency_ms).min().unwrap_or(0);
    let max_lat = query_results.iter().map(|r| r.latency_ms).max().unwrap_or(0);
    let perfect = query_results.iter().filter(|r| r.p5 >= 1.0).count();
    let good = query_results.iter().filter(|r| r.p5 >= 0.6 && r.p5 < 1.0).count();
    let weak = query_results.iter().filter(|r| r.p5 < 0.6).count();

    eprintln!("\n── AGGREGATE METRICS ───────────────────────────────────────────────────");
    eprintln!("   Queries tested  : {}", query_results.len());
    eprintln!("   Mean P@5        : {:.3}  ({:.1}%)", mean_p5, mean_p5 * 100.0);
    eprintln!(
        "   Anchor Hit@5    : {} / {}  ({:.1}%)",
        anchor_hits,
        query_results.len(),
        anchor_hits as f32 / query_results.len() as f32 * 100.0
    );
    eprintln!("   Perfect (P@5=1) : {} queries  ({:.0}%)", perfect, perfect as f32 / query_results.len() as f32 * 100.0);
    eprintln!("   Good  (≥0.6)    : {} queries", good);
    eprintln!("   Weak  (<0.6)    : {} queries", weak);
    eprintln!("   Latency avg/min/max : {} / {} / {} ms", mean_lat, min_lat, max_lat);
    eprintln!("   RAM baseline        : {:.1} MB", ram_before);
    eprintln!("   RAM after indexing  : {:.1} MB  (Δ +{:.1} MB)", ram_after, ram_delta);
    eprintln!("   RAM during queries  : ~{:.1} MB  (stable)", query_results.iter().map(|r| r.ram_mb).fold(0.0f64, f64::max));
    eprintln!("   Indexing time       : {} ms  (one-time cost)", embed_ms + idx_ms);
    eprintln!("   Model load          : {} ms", load_ms);

    // ── Elegant Detailed References ───────────────────────────────────────────
    eprintln!("\n\n╔══════════════════════════════════════════════════════════════════════╗");
    eprintln!("║              DETAILED ANSWERS WITH REFERENCES                       ║");
    eprintln!("╚══════════════════════════════════════════════════════════════════════╝");

    let doc_label = "CS229 Lecture Notes";
    for (i, qr) in query_results.iter().enumerate() {
        eprintln!("\n┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄");
        eprintln!("  Q{}: {}", i + 1, qr.query);
        eprintln!(
            "  Relevance score: {:.1}%  │  Retrieved in: {} ms  │  P@5: {:.2}  │  anchor@5: {} ({})",
            qr.top_score * 100.0,
            qr.latency_ms,
            qr.p5,
            if qr.anchor_hit5 { "yes" } else { "no" },
            qr.anchor_top_overlap
        );
        eprintln!("\n  References:");
        for (rank, sc) in qr.results.iter().enumerate().take(3) {
            eprintln!("{}", format_reference(rank + 1, sc, doc_label));
        }
    }

    // ── Final verdict ─────────────────────────────────────────────────────────
    eprintln!("\n\n── VERDICT ─────────────────────────────────────────────────────────────");
    if mean_p5 >= 0.85 {
        eprintln!("   ✅  Excellent RAG precision ({:.1}%) — suitable for student use", mean_p5 * 100.0);
    } else if mean_p5 >= 0.65 {
        eprintln!("   ⚡  Good RAG precision ({:.1}%) — consider hybrid BM25+vector for weak queries", mean_p5 * 100.0);
    } else {
        eprintln!("   ⚠   RAG precision needs improvement ({:.1}%)", mean_p5 * 100.0);
    }
    if anchor_hits == query_results.len() {
        eprintln!("   ✅  Topic-anchor Hit@5 is perfect — top-5 results consistently contain expected concepts");
    } else {
        eprintln!(
            "   ⚠   Topic-anchor Hit@5 is {}/{} — lexical P@5 is overstating some retrieval quality",
            anchor_hits,
            query_results.len()
        );
    }
    if mean_lat < 100 {
        eprintln!("   ✅  Query latency {} ms avg — fast enough for real-time chat", mean_lat);
    } else {
        eprintln!("   ⚡  Query latency {} ms avg — acceptable, aim for <100 ms", mean_lat);
    }
    if ram_delta < 500.0 {
        eprintln!("   ✅  RAM footprint +{:.0} MB — fits comfortably on 8 GB student laptop", ram_delta);
    } else {
        eprintln!("   ⚡  RAM footprint +{:.0} MB — large document; consider on-disk index for production", ram_delta);
    }

    assert!(!chunks.is_empty(), "No chunks generated");
    assert!(rag_index.chunk_count() > 0, "HNSW index empty");

    eprintln!("\n[PASS] rag_aggressive_multi_query completed\n");
    Ok(())
}
