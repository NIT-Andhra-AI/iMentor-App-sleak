/// RAG benchmark: uploads a PDF, asks 50 ML questions, measures TTFT /
/// total response time / RAM usage and prints a summary table.
use std::path::PathBuf;
use std::time::Instant;

use anyhow::{Context, Result};
use sysinfo::System;

// ── 50 CS229-derived test questions ──────────────────────────────────────────

const QUESTIONS: &[&str] = &[
    // Linear Regression
    "What is the LMS (least mean squares) algorithm?",
    "How do the normal equations solve linear regression?",
    "What is the probabilistic interpretation of least squares?",
    "What is locally weighted linear regression and when is it used?",
    "How does gradient descent update weights in linear regression?",
    // Logistic Regression
    "What is the sigmoid function and why is it used in logistic regression?",
    "How is the cross-entropy loss derived for logistic regression?",
    "What is the perceptron learning algorithm?",
    "How does multi-class classification extend logistic regression?",
    "What is the difference between logistic regression and linear regression?",
    // GLMs
    "What is the exponential family of distributions?",
    "How are generalized linear models constructed?",
    "How does ordinary least squares fit into the GLM framework?",
    "What is the canonical response function in GLMs?",
    "Give an example of a GLM other than linear or logistic regression.",
    // Generative Models
    "What is Gaussian discriminant analysis (GDA)?",
    "How does GDA relate to logistic regression?",
    "What is the multivariate normal distribution?",
    "What is Naive Bayes and what independence assumption does it make?",
    "How does Laplace smoothing prevent zero probabilities in Naive Bayes?",
    // Kernel Methods
    "What is a feature map and why are kernels useful?",
    "Explain the kernel trick in the context of LMS.",
    "What properties must a kernel function satisfy?",
    "What is a Mercer kernel?",
    "How does the Gaussian (RBF) kernel work?",
    // SVMs
    "What is a support vector machine and what is the margin?",
    "What is the primal optimization problem for SVMs?",
    "How does the kernel trick apply to SVMs?",
    "What are support vectors?",
    "What is the soft-margin SVM and why is it needed?",
    // Neural Networks
    "What is backpropagation?",
    "What is the vanishing gradient problem?",
    "What activation functions are commonly used in neural networks?",
    "What is a convolutional neural network?",
    "What is the difference between batch and stochastic gradient descent?",
    // Unsupervised Learning
    "How does the K-means clustering algorithm work?",
    "What is the EM algorithm?",
    "What is a Gaussian mixture model?",
    "What is PCA and how does it reduce dimensionality?",
    "What is the difference between PCA and ICA?",
    // Reinforcement Learning
    "What is the Markov decision process (MDP)?",
    "What is the Bellman equation?",
    "How does Q-learning work?",
    "What is the policy gradient method?",
    "What is the difference between model-based and model-free RL?",
    // Regularization & Evaluation
    "What is L1 vs L2 regularization and how do they differ?",
    "What is the bias-variance tradeoff?",
    "What is cross-validation and why is it used?",
    "What is the VC dimension?",
    "How do you detect and fix overfitting in a machine learning model?",
];

// ── Benchmark result for one question ────────────────────────────────────────

#[derive(Debug)]
struct QuestionResult {
    question: String,
    retrieved_chunks: usize,
    ttft_ms: u64,
    total_ms: u64,
    tokens_generated: usize,
    tok_per_sec: f64,
    ram_mb_before: u64,
    ram_mb_peak: u64,
    answer_preview: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn ram_mb() -> u64 {
    let mut sys = System::new_all();
    sys.refresh_memory();
    sys.used_memory() / 1024 / 1024
}

// ── Main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::WARN)
        .init();

    // ── 1. Resolve paths ──────────────────────────────────────────────────────
    let args: Vec<String> = std::env::args().collect();
    let pdf_path = PathBuf::from(
        args.get(1)
            .map(|s| s.as_str())
            .unwrap_or("229.pdf"),
    );
    if !pdf_path.exists() {
        anyhow::bail!("PDF not found: {}", pdf_path.display());
    }

    let models_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.studentai.app/models");

    // Always use stable on-disk names (set by the app / models.toml)
    let llm_path = models_dir.join("chat-model.gguf");
    if !llm_path.exists() {
        anyhow::bail!("LLM model not found at {} — run download-models.sh first", llm_path.display());
    }

    let emb_path = models_dir.join("rag-model.gguf");
    if !emb_path.exists() {
        anyhow::bail!("Embedding model not found at {} — run download-models.sh first", emb_path.display());
    }

    println!("\n╔══════════════════════════════════════════════════════╗");
    println!("║          Student AI — RAG Benchmark (229.pdf)        ║");
    println!("╚══════════════════════════════════════════════════════╝\n");
    println!("  PDF       : {}", pdf_path.display());
    println!("  LLM       : {}", llm_path.display());
    println!("  Embedder  : {}", emb_path.display());
    println!("  Questions : {}\n", QUESTIONS.len());

    // ── 2. Parse & chunk the PDF ──────────────────────────────────────────────
    print!("[1/4] Parsing PDF ...  ");
    let t0 = Instant::now();
    let parsed = rag::DocumentParser::parse(&pdf_path).context("PDF parse failed")?;
    let chunker = rag::Chunker::new(1600, 320);
    let doc_id = "bench-229".to_string();
    let chunks = chunker.chunk(&doc_id, &parsed.text);
    println!(
        "{} chunks, {} words  ({:.1}s)",
        chunks.len(),
        parsed.word_count,
        t0.elapsed().as_secs_f32()
    );

    // ── 3. Embed all chunks ───────────────────────────────────────────────────
    let n_threads = inference::CpuProfile::detect().recommended_threads;
    print!("[2/4] Loading embedding model & embedding {} chunks ...  ", chunks.len());
    let t0 = Instant::now();
    let mut embedder = inference::EmbeddingEngine::load(&emb_path, n_threads)
        .context("Failed to load embedding model")?;
    let texts: Vec<&str> = chunks.iter().map(|c| c.text.as_str()).collect();
    let embeddings = embedder
        .embed_batch(&texts)
        .context("Embedding failed")?;
    println!("{:.1}s", t0.elapsed().as_secs_f32());

    // ── 4. Build RAG index ────────────────────────────────────────────────────
    print!("[3/4] Building HNSW index ...  ");
    let t0 = Instant::now();
    let mut rag = rag::RagIndex::new();
    rag.add_chunks(chunks, embeddings).context("RAG insert failed")?;
    println!("{:.1}s", t0.elapsed().as_secs_f32());

    // ── 5. Load LLM ───────────────────────────────────────────────────────────
    print!("[4/4] Loading LLM ...  ");
    let t0 = Instant::now();
    let llm = inference::LlmEngine::load(&llm_path, n_threads, 0)
        .context("Failed to load LLM")?;
    let llm = std::sync::Arc::new(std::sync::Mutex::new(llm));
    println!("{:.1}s\n", t0.elapsed().as_secs_f32());

    let ram_after_load = ram_mb();
    println!("  RAM after load : {} MB\n", ram_after_load);
    println!("{:-<72}", "");
    println!(
        "{:<4} {:<42} {:>6} {:>7} {:>7} {:>8}",
        "#", "Question (truncated)", "TTFT", "Total", "Tok/s", "RAM(MB)"
    );
    println!("{:-<72}", "");

    // ── 6. Run all 50 questions ───────────────────────────────────────────────
    let mut results: Vec<QuestionResult> = Vec::with_capacity(QUESTIONS.len());

    for (i, question) in QUESTIONS.iter().enumerate() {
        let ram_before = ram_mb();

        // 6a. Embed the question for retrieval.
        let q_embedding = embedder
            .embed_batch(&[question])
            .context("Query embed")?
            .remove(0);

        // 6b. Retrieve top-2 chunks (keeps prompt short for faster LLM prefill).
        let hits = rag.search(&q_embedding, 2).unwrap_or_default();
        let retrieved_chunks = hits.len();
        let context = hits
            .iter()
            .map(|h| h.chunk.text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n---\n\n");

        // 6c. Build messages.
        let system = format!(
            "You are a helpful ML tutor. Answer based on the provided context.\n\
             Be concise and accurate. Context:\n\n{}",
            context
        );
        let messages = vec![
            inference::ChatMessage {
                role: "system".to_string(),
                content: system,
            },
            inference::ChatMessage {
                role: "user".to_string(),
                content: question.to_string(),
            },
        ];
        let params = inference::GenerationParams {
            max_tokens: 300,
            temperature: 0.3,
            top_p: 0.9,
            repeat_penalty: 1.1,
            system_prompt: None,
            no_think: false,
        };

        // 6d. Stream generation, measuring TTFT and total time.
        // generate_stream is a synchronous blocking function — run it on a
        // dedicated OS thread so we can read tokens concurrently and measure
        // real TTFT (time-to-first-token).
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let q_start = Instant::now();
        let mut ttft_ms: u64 = 0;
        let mut full_text = String::new();

        let llm_arc: std::sync::Arc<std::sync::Mutex<inference::LlmEngine>> = std::sync::Arc::clone(&llm);
        let messages_owned = messages.clone();
        let params_owned = params.clone();
        let thread_handle = std::thread::spawn(move || {
            let mut engine = llm_arc.lock().unwrap();
            engine.generate_stream(&messages_owned, &params_owned, tx, None)
        });

        while let Some(tok) = rx.recv().await {
            if tok == "\x00" {
                break;
            }
            if ttft_ms == 0 {
                ttft_ms = q_start.elapsed().as_millis() as u64;
            }
            full_text.push_str(&tok);
        }
        let _ = thread_handle.join();

        let total_ms = q_start.elapsed().as_millis() as u64;
        let tokens_generated = full_text.split_whitespace().count();
        let tok_per_sec = if total_ms > 0 {
            tokens_generated as f64 / (total_ms as f64 / 1000.0)
        } else {
            0.0
        };
        let ram_peak = ram_mb();
        let answer_preview: String = full_text.chars().take(60).collect();

        println!(
            "{:<4} {:<42} {:>5}ms {:>6}ms {:>7.1} {:>8}",
            i + 1,
            &question[..question.len().min(42)],
            ttft_ms,
            total_ms,
            tok_per_sec,
            ram_peak,
        );

        results.push(QuestionResult {
            question: question.to_string(),
            retrieved_chunks,
            ttft_ms,
            total_ms,
            tokens_generated,
            tok_per_sec,
            ram_mb_before: ram_before,
            ram_mb_peak: ram_peak,
            answer_preview,
        });
    }

    // ── 7. Summary stats ──────────────────────────────────────────────────────
    println!("{:-<72}", "");

    let avg_ttft = results.iter().map(|r| r.ttft_ms).sum::<u64>() / results.len() as u64;
    let avg_total = results.iter().map(|r| r.total_ms).sum::<u64>() / results.len() as u64;
    let avg_tps: f64 = results.iter().map(|r| r.tok_per_sec).sum::<f64>() / results.len() as f64;
    let max_ram = results.iter().map(|r| r.ram_mb_peak).max().unwrap_or(0);
    let min_ttft = results.iter().map(|r| r.ttft_ms).min().unwrap_or(0);
    let max_ttft = results.iter().map(|r| r.ttft_ms).max().unwrap_or(0);

    println!("\n╔══════════════════════ SUMMARY ══════════════════════╗");
    println!("║  Questions answered : {:>5}                          ║", results.len());
    println!("║  Avg TTFT           : {:>5} ms  (min {}, max {})  ║", avg_ttft, min_ttft, max_ttft);
    println!("║  Avg response time  : {:>5} ms                        ║", avg_total);
    println!("║  Avg tokens/sec     : {:>5.1}                          ║", avg_tps);
    println!("║  Peak RAM usage     : {:>5} MB                        ║", max_ram);
    println!("║  RAM after load     : {:>5} MB                        ║", ram_after_load);
    println!("╚═══════════════════════════════════════════════════════╝\n");

    // ── 8. Save JSON report ───────────────────────────────────────────────────
    let report: Vec<serde_json::Value> = results
        .iter()
        .enumerate()
        .map(|(i, r)| {
            serde_json::json!({
                "q_num": i + 1,
                "question": r.question,
                "retrieved_chunks": r.retrieved_chunks,
                "ttft_ms": r.ttft_ms,
                "total_ms": r.total_ms,
                "tokens": r.tokens_generated,
                "tok_per_sec": r.tok_per_sec,
                "ram_before_mb": r.ram_mb_before,
                "ram_peak_mb": r.ram_mb_peak,
                "answer_preview": r.answer_preview,
            })
        })
        .collect();

    let report_path = std::env::current_dir()?.join("rag_bench_report.json");
    std::fs::write(&report_path, serde_json::to_string_pretty(&report)?)?;
    println!("  Full report saved → {}", report_path.display());

    Ok(())
}
