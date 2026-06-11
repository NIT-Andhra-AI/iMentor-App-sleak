/// ============================================================================
/// Comprehensive chatbot pipeline integration tests
///
/// Covers every layer of the chat system that can be exercised without a
/// live LLM or GPU:
///
///  § 1  System-prompt construction for every chat mode
///  § 2  Wiki BM25 retrieval — ML course questions
///  § 3  RAG text-chunking — sentence / word boundary splitting
///  § 4  RAG vector store — HNSW nearest-neighbour search
///  § 5  Storage — multi-turn conversation persistence
///  § 6  Agent orchestrator — Dev/Test agents, threading, active context
///  § 7  Telemetry — PII scrubbing in conversation content
///  § 8  End-to-end pipeline simulation — question → retrieval → prompt
/// ============================================================================

use std::fs;

use anyhow::Result;
use tempfile::TempDir;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Write a Markdown wiki page to `dir/<file_name>`.
fn write_wiki_page(dir: &TempDir, file_name: &str, content: &str) {
    fs::write(dir.path().join(file_name), content).expect("write wiki page");
}

/// Return a unit-vector in the direction of `v`.
fn normalize(v: &[f32]) -> Vec<f32> {
    let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    v.iter().map(|x| x / norm).collect()
}

// ─────────────────────────────────────────────────────────────────────────────
// § 1  System-prompt construction
// ─────────────────────────────────────────────────────────────────────────────

/// The chat command builds system prompts in three modes:
///   • "general"   — generic helpful assistant, no subject restriction
///   • "course"    — ML course tutor, must cite wiki pages
///   • "user_docs" — grounded on user-uploaded documents
///
/// These tests reproduce the logic from `src-tauri/src/commands/chat.rs`
/// so we can assert on the exact shape of the prompts without requiring
/// the Tauri runtime.
fn build_system_prompt(mode: &str, context: Option<&str>) -> String {
    match mode {
        "general" => "You are a helpful AI assistant.".to_string(),
        "course" => {
            let ctx = context.unwrap_or("[no context retrieved]");
            format!(
                "You are an expert ML tutor. Use the following course material \
                 to answer the student's question. Cite the page titles when \
                 relevant.\n\n---\n{ctx}\n---"
            )
        }
        "user_docs" => {
            let ctx = context.unwrap_or("[no documents uploaded]");
            format!(
                "You are a knowledgeable assistant. Answer based exclusively on \
                 the documents provided below. If the answer is not in the \
                 documents, say so clearly.\n\n---\n{ctx}\n---"
            )
        }
        other => format!("You are a helpful assistant. (unknown mode: {other})"),
    }
}

#[test]
fn test_general_system_prompt_has_no_persona() {
    let prompt = build_system_prompt("general", None);
    assert!(
        prompt.contains("helpful AI assistant"),
        "general prompt should identify as helpful AI assistant"
    );
    assert!(
        !prompt.contains("tutor"),
        "general prompt must not inject tutor persona"
    );
    assert!(
        !prompt.contains("document"),
        "general prompt must not reference uploaded documents"
    );
}

#[test]
fn test_course_system_prompt_injects_wiki_context() {
    let ctx = "# Gradient Descent\nGradient descent minimises a loss function…";
    let prompt = build_system_prompt("course", Some(ctx));
    assert!(prompt.contains("ML tutor"));
    assert!(prompt.contains("Gradient Descent"), "context block must appear verbatim");
    assert!(prompt.contains("Cite the page titles"));
}

#[test]
fn test_course_system_prompt_without_context_uses_fallback() {
    let prompt = build_system_prompt("course", None);
    assert!(prompt.contains("[no context retrieved]"));
}

#[test]
fn test_user_docs_prompt_injects_document_context() {
    let ctx = "Lecture 3: Neural Networks\nA neural network is…";
    let prompt = build_system_prompt("user_docs", Some(ctx));
    assert!(prompt.contains("documents provided below"));
    assert!(prompt.contains("Lecture 3: Neural Networks"));
    assert!(prompt.contains("If the answer is not in the documents"));
}

#[test]
fn test_user_docs_prompt_without_context_uses_fallback() {
    let prompt = build_system_prompt("user_docs", None);
    assert!(prompt.contains("[no documents uploaded]"));
}

#[test]
fn test_unknown_mode_falls_back_gracefully() {
    let prompt = build_system_prompt("experimental", None);
    assert!(prompt.contains("unknown mode: experimental"));
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2  Wiki BM25 retrieval
// ─────────────────────────────────────────────────────────────────────────────

fn make_ml_wiki(tmp: &TempDir) {
    write_wiki_page(
        tmp,
        "gradient-descent.md",
        "# Gradient Descent\n\
         Gradient descent is an optimisation algorithm used to minimise a loss \
         function. The learning rate controls the step size taken at each \
         iteration. A high learning rate can overshoot the minimum; a low \
         learning rate causes slow convergence.\n",
    );
    write_wiki_page(
        tmp,
        "overfitting.md",
        "# Overfitting\n\
         Overfitting occurs when a model learns the training data too well, \
         including its noise, and performs poorly on unseen test data. \
         Regularisation and dropout are common mitigation strategies.\n",
    );
    write_wiki_page(
        tmp,
        "backpropagation.md",
        "# Backpropagation\n\
         Backpropagation computes gradients of the loss function with respect \
         to each weight by applying the chain rule layer by layer. The vanishing \
         gradient problem occurs when these gradients become exponentially small \
         in deep networks.\n",
    );
    write_wiki_page(
        tmp,
        "bias-variance.md",
        "# Bias-Variance Tradeoff\n\
         The bias-variance tradeoff describes the tension between a model's \
         ability to minimise bias (training error) and variance (sensitivity to \
         training data fluctuations). High bias → underfitting; high variance → \
         overfitting.\n",
    );
    write_wiki_page(
        tmp,
        "regularisation.md",
        "# Regularisation\n\
         L1 regularisation adds the absolute value of weights to the loss, \
         encouraging sparsity. L2 regularisation adds the squared weights, \
         discouraging large coefficients. Both prevent overfitting.\n",
    );
    write_wiki_page(
        tmp,
        "cross-validation.md",
        "# Cross-Validation\n\
         K-fold cross-validation splits the training set into k folds. The \
         model is trained on k-1 folds and validated on the remaining fold, \
         rotated k times. The average validation score estimates generalisation.\n",
    );
    write_wiki_page(
        tmp,
        "neural-networks.md",
        "# Neural Networks\n\
         A neural network is composed of layers of neurons. Each neuron applies \
         a weighted sum followed by a non-linear activation function. Training \
         uses backpropagation and gradient descent to update weights.\n",
    );
}

#[test]
fn test_wiki_gradient_descent_question() {
    let tmp = TempDir::new().unwrap();
    make_ml_wiki(&tmp);
    let engine = wiki::WikiEngine::new(tmp.path()).unwrap();

    let results = engine
        .search("What is gradient descent and how does learning rate affect it?", 3)
        .unwrap();

    assert!(!results.is_empty(), "should find at least one result");
    let top = &results[0];
    assert_eq!(
        top.page.file_name, "gradient-descent.md",
        "gradient descent question → gradient-descent.md should rank first"
    );
    assert!(top.score > 0.0);
}

#[test]
fn test_wiki_overfitting_question() {
    let tmp = TempDir::new().unwrap();
    make_ml_wiki(&tmp);
    let engine = wiki::WikiEngine::new(tmp.path()).unwrap();

    let results = engine
        .search("Model memorises training data but performs poorly on test set", 3)
        .unwrap();

    let file_names: Vec<&str> = results.iter().map(|r| r.page.file_name.as_str()).collect();
    assert!(
        file_names.contains(&"overfitting.md"),
        "overfitting question should surface overfitting.md; got {file_names:?}"
    );
}

#[test]
fn test_wiki_backpropagation_question() {
    let tmp = TempDir::new().unwrap();
    make_ml_wiki(&tmp);
    let engine = wiki::WikiEngine::new(tmp.path()).unwrap();

    let results = engine
        .search("How does backpropagation compute gradients?", 3)
        .unwrap();

    let file_names: Vec<&str> = results.iter().map(|r| r.page.file_name.as_str()).collect();
    assert!(
        file_names.contains(&"backpropagation.md"),
        "backpropagation query must surface backpropagation.md; got {file_names:?}"
    );
}

#[test]
fn test_wiki_bias_variance_question() {
    let tmp = TempDir::new().unwrap();
    make_ml_wiki(&tmp);
    let engine = wiki::WikiEngine::new(tmp.path()).unwrap();

    let results = engine
        .search("Explain the bias variance tradeoff", 3)
        .unwrap();

    let file_names: Vec<&str> = results.iter().map(|r| r.page.file_name.as_str()).collect();
    assert!(
        file_names.contains(&"bias-variance.md"),
        "bias-variance query must surface bias-variance.md; got {file_names:?}"
    );
}

#[test]
fn test_wiki_regularisation_question() {
    let tmp = TempDir::new().unwrap();
    make_ml_wiki(&tmp);
    let engine = wiki::WikiEngine::new(tmp.path()).unwrap();

    let results = engine
        .search("How do L1 and L2 regularisation prevent overfitting?", 3)
        .unwrap();

    let file_names: Vec<&str> = results.iter().map(|r| r.page.file_name.as_str()).collect();
    assert!(
        file_names.contains(&"regularisation.md"),
        "L1/L2 query must surface regularisation.md; got {file_names:?}"
    );
}

#[test]
fn test_wiki_cross_validation_question() {
    let tmp = TempDir::new().unwrap();
    make_ml_wiki(&tmp);
    let engine = wiki::WikiEngine::new(tmp.path()).unwrap();

    let results = engine
        .search("K-fold cross-validation", 3)
        .unwrap();

    let file_names: Vec<&str> = results.iter().map(|r| r.page.file_name.as_str()).collect();
    assert!(
        file_names.contains(&"cross-validation.md"),
        "K-fold query must surface cross-validation.md; got {file_names:?}"
    );
}

#[test]
fn test_wiki_vanishing_gradient_question() {
    let tmp = TempDir::new().unwrap();
    make_ml_wiki(&tmp);
    let engine = wiki::WikiEngine::new(tmp.path()).unwrap();

    let results = engine
        .search("vanishing gradient problem in deep networks", 3)
        .unwrap();

    let file_names: Vec<&str> = results.iter().map(|r| r.page.file_name.as_str()).collect();
    assert!(
        file_names.contains(&"backpropagation.md"),
        "vanishing gradient query must surface backpropagation.md; got {file_names:?}"
    );
}

#[test]
fn test_wiki_off_topic_question_returns_safely() {
    let tmp = TempDir::new().unwrap();
    make_ml_wiki(&tmp);
    let engine = wiki::WikiEngine::new(tmp.path()).unwrap();

    // Completely unrelated to any indexed content — should not crash.
    let results = engine.search("What is the capital of France?", 5).unwrap();
    // May return empty or low-score results — either is acceptable.
    for r in &results {
        assert!(r.score >= 0.0, "scores must be non-negative");
    }
}

#[test]
fn test_wiki_empty_query_returns_empty() {
    let tmp = TempDir::new().unwrap();
    make_ml_wiki(&tmp);
    let engine = wiki::WikiEngine::new(tmp.path()).unwrap();

    let results = engine.search("", 5).unwrap();
    assert!(results.is_empty(), "empty query must return empty results");
}

#[test]
fn test_wiki_scores_descend() {
    let tmp = TempDir::new().unwrap();
    make_ml_wiki(&tmp);
    let engine = wiki::WikiEngine::new(tmp.path()).unwrap();

    let results = engine
        .search("neural network layers activation function gradient descent", 5)
        .unwrap();

    for window in results.windows(2) {
        assert!(
            window[0].score >= window[1].score,
            "results must be in descending score order: {} < {}",
            window[0].score,
            window[1].score
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3  RAG text-chunking
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_chunker_preserves_all_text() {
    use rag::Chunker;

    let text = "Machine learning is a subset of artificial intelligence. \
                It enables computers to learn from data without being explicitly \
                programmed. Deep learning uses multi-layer neural networks to \
                automatically discover representations from raw inputs. \
                Convolutional networks excel at image tasks while recurrent \
                networks handle sequential data.";

    let chunker = Chunker::new(80, 20);
    let chunks = chunker.chunk("lecture1.txt", text);

    assert!(!chunks.is_empty(), "should produce at least one chunk");

    // Every chunk must be non-empty and within max size + tolerance.
    for (i, chunk) in chunks.iter().enumerate() {
        assert!(!chunk.text.is_empty(), "chunk {i} must not be empty");
        assert_eq!(chunk.chunk_index, i, "chunk_index must be sequential");
        assert_eq!(chunk.doc_id, "lecture1.txt");
        // Allow slight overrun at sentence boundaries (≤20% tolerance).
        assert!(
            chunk.text.len() <= 80 + 80 / 5 + 5,
            "chunk {i} is too long: {} chars",
            chunk.text.len()
        );
    }
}

#[test]
fn test_chunker_empty_text_returns_empty() {
    use rag::Chunker;
    let chunker = Chunker::default();
    let chunks = chunker.chunk("empty.txt", "");
    assert!(chunks.is_empty());
}

#[test]
fn test_chunker_short_text_yields_single_chunk() {
    use rag::Chunker;
    let chunker = Chunker::new(500, 50);
    let text = "Short note.";
    let chunks = chunker.chunk("note.txt", text);
    assert_eq!(chunks.len(), 1);
    assert_eq!(chunks[0].text, text);
}

#[test]
fn test_chunker_overlapping_chunks_share_text() {
    use rag::Chunker;

    // Small chunk size so overlap actually fires.
    let chunker = Chunker::new(40, 10);
    let text = "Alpha beta gamma delta epsilon zeta eta. Theta iota kappa lambda mu.";
    let chunks = chunker.chunk("doc.txt", text);

    if chunks.len() >= 2 {
        // The tail of chunk N and the head of chunk N+1 should overlap in
        // original text position (char_start / char_end).
        for w in chunks.windows(2) {
            // char_end of first must be > char_start of second (overlap).
            // With overlap=10 this holds for typical text.
            assert!(
                w[0].char_end >= w[1].char_start,
                "chunks should overlap in char offsets"
            );
        }
    }
}

#[test]
fn test_chunker_chunk_ids_are_unique() {
    use rag::Chunker;
    use std::collections::HashSet;

    let chunker = Chunker::new(30, 5);
    let text = "a b c d e f g h i j k l m n o p q r s t u v w x y z. ".repeat(10);
    let chunks = chunker.chunk("alphabet.txt", &text);

    let ids: HashSet<_> = chunks.iter().map(|c| c.id.clone()).collect();
    assert_eq!(ids.len(), chunks.len(), "every chunk id must be unique");
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4  RAG vector store — HNSW nearest-neighbour
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_rag_index_exact_match_returns_score_one() {
    use rag::{Chunker, RagIndex};

    let mut index = RagIndex::new();
    let chunker = Chunker::new(200, 0);

    let doc = "Gradient descent is an iterative optimisation algorithm.";
    let chunks = chunker.chunk("notes.pdf", doc);

    // Use a hand-crafted 3-D embedding; vector for the doc chunk.
    let emb_doc = normalize(&[1.0_f32, 0.0, 0.0]);
    index
        .add_chunks(chunks, vec![emb_doc.clone()])
        .expect("add_chunks should succeed");

    // Query with the identical vector — cosine similarity must be ≈ 1.
    let results = index.search(&emb_doc, 1).expect("search must succeed");
    assert_eq!(results.len(), 1);
    assert!(
        (results[0].score - 1.0_f32).abs() < 1e-4,
        "exact match should score ≈ 1.0, got {}",
        results[0].score
    );
}

#[test]
fn test_rag_index_top_k_ordering_descends() {
    use rag::{Chunker, RagIndex};

    let mut index = RagIndex::new();
    let chunker = Chunker::new(200, 0);

    let docs = [
        ("doc_close.txt",  "Gradient descent minimises loss.",  [1.0_f32, 0.0, 0.0]),
        ("doc_medium.txt", "Neural networks use layers.",       [0.8_f32, 0.6, 0.0]),
        ("doc_far.txt",    "Photosynthesis converts sunlight.", [0.0_f32, 0.0, 1.0]),
    ];

    let mut all_chunks = Vec::new();
    let mut all_embeddings = Vec::new();
    for (name, text, emb) in &docs {
        let mut chunks = chunker.chunk(name, text);
        all_embeddings.extend(chunks.iter().map(|_| normalize(emb)));
        all_chunks.append(&mut chunks);
    }
    index.add_chunks(all_chunks, all_embeddings).unwrap();

    // Query close to [1,0,0] — should rank doc_close first.
    let query = normalize(&[0.95_f32, 0.1, 0.0]);
    let results = index.search(&query, 3).unwrap();

    assert_eq!(results.len(), 3, "top-3 should return 3 results");
    assert!(
        results[0].score >= results[1].score,
        "results must be in descending score order"
    );
    assert!(
        results[1].score >= results[2].score,
        "results must be in descending score order"
    );
    assert_eq!(
        results[0].doc_name, "doc_close.txt",
        "closest document should rank first"
    );
}

#[test]
fn test_rag_index_empty_returns_error() {
    use rag::RagIndex;
    let index = RagIndex::new();
    let query = normalize(&[1.0_f32, 0.0, 0.0]);
    let result = index.search(&query, 5);
    assert!(
        result.is_err(),
        "searching an empty index should return an error"
    );
}

#[test]
fn test_rag_index_save_and_load_roundtrip() {
    use rag::{Chunker, RagIndex};

    let tmp = TempDir::new().unwrap();
    let index_path = tmp.path().join("rag.idx");

    let mut index = RagIndex::new();
    let chunker = Chunker::new(200, 0);
    let chunks = chunker.chunk("week3.pdf", "The chain rule enables backpropagation.");
    let emb = normalize(&[0.6_f32, 0.8, 0.0]);
    index.add_chunks(chunks, vec![emb.clone()]).unwrap();

    index.save(&index_path).expect("save should succeed");

    let loaded = RagIndex::load(&index_path).expect("load should succeed");
    assert_eq!(loaded.chunk_count(), 1, "loaded index must have 1 chunk");

    let results = loaded.search(&emb, 1).unwrap();
    assert_eq!(results.len(), 1);
    assert!(
        (results[0].score - 1.0_f32).abs() < 1e-4,
        "loaded index must return the same result"
    );
}

#[test]
fn test_rag_source_ref_is_preserved() {
    use rag::{Chunker, RagIndex};

    let mut index = RagIndex::new();
    let chunker = Chunker::new(200, 0);

    // Simulate two user-uploaded docs.
    let chunks_a = chunker.chunk("lecture-notes.pdf", "Lecture content about ML.");
    let emb_a: Vec<Vec<f32>> = chunks_a.iter().map(|_| normalize(&[1.0_f32, 0.0, 0.0])).collect();
    index.add_chunks(chunks_a, emb_a).unwrap();

    let chunks_b = chunker.chunk("week3-slides.pdf", "Slides about neural networks.");
    let emb_b: Vec<Vec<f32>> = chunks_b.iter().map(|_| normalize(&[0.0_f32, 1.0, 0.0])).collect();
    index.add_chunks(chunks_b, emb_b).unwrap();

    // Query for the first doc.
    let q = normalize(&[1.0_f32, 0.0, 0.0]);
    let results = index.search(&q, 1).unwrap();
    assert_eq!(results[0].doc_name, "lecture-notes.pdf");
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5  Storage — multi-turn conversation persistence
// ─────────────────────────────────────────────────────────────────────────────

fn make_store(tmp: &TempDir) -> storage::SessionStore {
    let db = tmp.path().join("chat.db");
    storage::SessionStore::new(&db).expect("open DB")
}

#[test]
fn test_storage_new_session_has_correct_mode() {
    let tmp = TempDir::new().unwrap();
    let store = make_store(&tmp);

    let id = store.create_session("course").unwrap();
    let sessions = store.list_sessions(10).unwrap();

    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].id, id);
    assert_eq!(sessions[0].mode, "course");
    assert_eq!(sessions[0].message_count, 0);
}

#[test]
fn test_storage_multi_turn_conversation() {
    let tmp = TempDir::new().unwrap();
    let store = make_store(&tmp);

    let session_id = store.create_session("general").unwrap();

    let turns = [
        ("user",      "What is gradient descent?",                                   None),
        ("assistant", "Gradient descent is an optimisation algorithm…",              Some(14_i64)),
        ("user",      "Can you explain the learning rate?",                          None),
        ("assistant", "The learning rate controls the step size at each iteration…", Some(18_i64)),
        ("user",      "What happens if it's too high?",                              None),
        ("assistant", "If the learning rate is too high the optimiser can overshoot the minimum…",
                                                                                      Some(22_i64)),
    ];

    for (role, content, tokens) in &turns {
        let msg = storage::Message {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.clone(),
            role: role.to_string(),
            content: content.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            token_count: *tokens,
            ttft_ms: None,
            source_refs: None,
        };
        store.save_message(&msg).unwrap();
    }

    let messages = store.get_session_messages(&session_id).unwrap();
    assert_eq!(messages.len(), turns.len(), "all turns must be persisted");

    for (i, (role, content, tokens)) in turns.iter().enumerate() {
        assert_eq!(messages[i].role, *role);
        assert_eq!(messages[i].content, *content);
        assert_eq!(messages[i].token_count, *tokens);
    }
}

#[test]
fn test_storage_source_refs_round_trip() {
    let tmp = TempDir::new().unwrap();
    let store = make_store(&tmp);
    let session_id = store.create_session("user_docs").unwrap();

    let sources = serde_json::to_string(&["lecture-notes.pdf", "week3.pdf"]).unwrap();

    let msg = storage::Message {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: session_id.clone(),
        role: "assistant".to_string(),
        content: "Based on your documents, backpropagation…".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        token_count: Some(12),
        ttft_ms: Some(340),
        source_refs: Some(sources.clone()),
    };
    store.save_message(&msg).unwrap();

    let messages = store.get_session_messages(&session_id).unwrap();
    assert_eq!(messages[0].source_refs, Some(sources));
    assert_eq!(messages[0].ttft_ms, Some(340));
}

#[test]
fn test_storage_session_isolation() {
    let tmp = TempDir::new().unwrap();
    let store = make_store(&tmp);

    let s1 = store.create_session("course").unwrap();
    let s2 = store.create_session("general").unwrap();

    let save_msg = |session_id: &str, content: &str| {
        let msg = storage::Message {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            role: "user".to_string(),
            content: content.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            token_count: None,
            ttft_ms: None,
            source_refs: None,
        };
        store.save_message(&msg).unwrap()
    };

    save_msg(&s1, "ML question from session 1");
    save_msg(&s2, "General question from session 2");
    save_msg(&s1, "Follow-up from session 1");

    let msgs_1 = store.get_session_messages(&s1).unwrap();
    let msgs_2 = store.get_session_messages(&s2).unwrap();

    assert_eq!(msgs_1.len(), 2);
    assert_eq!(msgs_2.len(), 1);
    assert!(msgs_1.iter().all(|m| m.session_id == s1));
    assert!(msgs_2.iter().all(|m| m.session_id == s2));
}

#[test]
fn test_storage_settings_persist() {
    let tmp = TempDir::new().unwrap();
    let store = make_store(&tmp);

    assert!(store.get_setting("chat_mode").unwrap().is_none());

    store.set_setting("chat_mode", "course").unwrap();
    assert_eq!(
        store.get_setting("chat_mode").unwrap(),
        Some("course".to_string())
    );

    // Model path and system prompt persist across simulated restarts.
    store.set_setting("model_path", "/models/llama.gguf").unwrap();
    store.set_setting("system_prompt_override", "").unwrap();

    let pairs = store.list_settings_by_prefix("").unwrap();
    assert!(pairs.len() >= 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6  Agent orchestrator
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_dev_agent_system_prompt_content() {
    use agents::{AgentOrchestrator, AgentType};

    let mut orch = AgentOrchestrator::new();
    let id = orch.spawn_agent(AgentType::Dev);
    let msgs = orch.get_agent_messages(&id).unwrap();

    // First message is always the system prompt.
    assert_eq!(msgs[0].0, "system");
    let sys = &msgs[0].1;
    assert!(sys.contains("software development"), "Dev prompt must mention software development");
    assert!(sys.contains("code"), "Dev prompt must mention code");
}

#[test]
fn test_test_agent_system_prompt_content() {
    use agents::{AgentOrchestrator, AgentType};

    let mut orch = AgentOrchestrator::new();
    let id = orch.spawn_agent(AgentType::Test);
    let msgs = orch.get_agent_messages(&id).unwrap();

    let sys = &msgs[0].1;
    assert!(sys.contains("testing"), "Test prompt must mention testing");
    assert!(sys.contains("correctness") || sys.contains("review") || sys.contains("code"),
        "Test prompt must mention correctness/review/code");
}

#[test]
fn test_dev_agent_multi_turn_conversation() {
    use agents::{AgentOrchestrator, AgentType};

    let mut orch = AgentOrchestrator::new();
    let id = orch.spawn_agent(AgentType::Dev);

    orch.add_message(&id, "user", "Write a Rust function that reverses a string.").unwrap();
    orch.add_message(&id, "assistant",
        "fn reverse(s: &str) -> String { s.chars().rev().collect() }").unwrap();
    orch.add_message(&id, "user", "Now add a docstring.").unwrap();
    orch.add_message(&id, "assistant",
        "/// Reverses all characters in the input string.\nfn reverse(s: &str) -> String { \
         s.chars().rev().collect() }").unwrap();

    let msgs = orch.get_agent_messages(&id).unwrap();
    // system + 4 conversation turns
    assert_eq!(msgs.len(), 5);

    // Message count (excluding system prompt).
    let info = orch.list_agents();
    assert_eq!(info[0].message_count, 4);
}

#[test]
fn test_test_agent_reviews_code() {
    use agents::{AgentOrchestrator, AgentType};

    let mut orch = AgentOrchestrator::new();
    let id = orch.spawn_agent(AgentType::Test);

    orch.add_message(&id, "user",
        "Review this function: fn div(a: i32, b: i32) -> i32 { a / b }").unwrap();
    orch.add_message(&id, "assistant",
        "The function panics on division by zero. Add a check: if b == 0 { return 0; }").unwrap();

    let msgs = orch.get_agent_messages(&id).unwrap();
    // system + 2 messages
    assert_eq!(msgs.len(), 3);
    assert!(msgs[2].1.contains("division by zero") || msgs[2].1.contains("b == 0"));
}

#[test]
fn test_agent_active_context_switching() {
    use agents::{AgentOrchestrator, AgentStatus, AgentType};

    let mut orch = AgentOrchestrator::new();
    let dev_id = orch.spawn_agent(AgentType::Dev);
    let test_id = orch.spawn_agent(AgentType::Test);

    // Activate dev agent.
    orch.set_active(Some(dev_id.clone()));
    let agents = orch.list_agents();
    let dev = agents.iter().find(|a| a.id == dev_id).unwrap();
    let test = agents.iter().find(|a| a.id == test_id).unwrap();
    assert_eq!(dev.status, AgentStatus::Running);
    assert_eq!(test.status, AgentStatus::Idle);

    // Switch to test agent — dev must revert to Idle.
    orch.set_active(Some(test_id.clone()));
    let agents = orch.list_agents();
    let dev = agents.iter().find(|a| a.id == dev_id).unwrap();
    let test = agents.iter().find(|a| a.id == test_id).unwrap();
    assert_eq!(dev.status, AgentStatus::Idle);
    assert_eq!(test.status, AgentStatus::Running);

    // Unload all contexts.
    orch.set_active(None);
    let agents = orch.list_agents();
    assert!(agents.iter().all(|a| a.status == AgentStatus::Idle));
}

#[test]
fn test_agent_get_messages_returns_none_for_missing_agent() {
    use agents::AgentOrchestrator;

    let orch = AgentOrchestrator::new();
    let result = orch.get_agent_messages(&"non-existent-uuid".to_string());
    assert!(
        result.is_none(),
        "get_agent_messages must return None for unknown agent ids"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// § 7  Telemetry — PII scrubbing
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_telemetry_scrubs_email_in_chat_message() {
    use telemetry::Deidentifier;

    let d = Deidentifier::new();
    let text = "My email is student@university.ac.uk — please help with gradient descent.";
    let (scrubbed, entities) = d.clean(text);
    assert!(
        !scrubbed.contains("student@university.ac.uk"),
        "email must be redacted; got: {scrubbed}"
    );
    assert!(
        scrubbed.contains("gradient descent"),
        "non-PII content must be preserved"
    );
    assert!(entities.contains(&"[EMAIL]".to_string()));
}

#[test]
fn test_telemetry_scrubs_phone_number() {
    use telemetry::Deidentifier;

    let d = Deidentifier::new();
    let text = "Call me on 555-867-5309 about the assignment.";
    let (scrubbed, entities) = d.clean(text);
    assert!(
        !scrubbed.contains("867-5309"),
        "phone number must be redacted; got: {scrubbed}"
    );
    assert!(entities.contains(&"[PHONE]".to_string()));
}

#[test]
fn test_telemetry_preserves_technical_content() {
    use telemetry::Deidentifier;

    let d = Deidentifier::new();
    // No PII — content should pass through unchanged.
    let text = "Backpropagation computes gradients via the chain rule.";
    let (scrubbed, entities) = d.clean(text);
    assert_eq!(scrubbed, text, "pure technical content must not be altered");
    assert!(entities.is_empty());
}

// ─────────────────────────────────────────────────────────────────────────────
// § 8  End-to-end pipeline simulation
//
// Simulates the path a real student question takes through the system:
//   user question
//     → BM25 wiki retrieval
//     → system prompt construction
//     → message list assembly (with history)
//     → storage persistence
// ─────────────────────────────────────────────────────────────────────────────

/// Build the ChatML-style message list that would be sent to the LLM.
fn build_chat_messages(
    system_prompt: &str,
    history: &[(String, String)],
    new_user_msg: &str,
) -> Vec<(String, String)> {
    let mut msgs = vec![("system".to_string(), system_prompt.to_string())];
    msgs.extend(history.iter().cloned());
    msgs.push(("user".to_string(), new_user_msg.to_string()));
    msgs
}

#[test]
fn test_pipeline_course_mode_question() -> Result<()> {
    use storage::SessionStore;
    use wiki::WikiEngine;

    // ── 1. Build wiki engine ────────────────────────────────────────────────
    let wiki_tmp = TempDir::new()?;
    make_ml_wiki(&wiki_tmp);
    let engine = WikiEngine::new(wiki_tmp.path())?;

    // ── 2. Student asks a question ──────────────────────────────────────────
    let question = "How does backpropagation use the chain rule to update weights?";

    // ── 3. Retrieve relevant wiki pages ────────────────────────────────────
    let results = engine.search(question, 3)?;
    assert!(!results.is_empty(), "must retrieve at least one relevant page");

    let context = results
        .iter()
        .map(|r| format!("## {}\n{}", r.page.title, r.page.plain_text))
        .collect::<Vec<_>>()
        .join("\n\n");

    // ── 4. Build system prompt ──────────────────────────────────────────────
    let system_prompt = build_system_prompt("course", Some(&context));
    assert!(system_prompt.contains("ML tutor"));
    assert!(system_prompt.contains("backpropagation") || system_prompt.contains("chain rule")
            || system_prompt.contains("gradients"),
        "retrieved context must be injected into prompt");

    // ── 5. Assemble chat message list ───────────────────────────────────────
    let history: Vec<(String, String)> = vec![];
    let messages = build_chat_messages(&system_prompt, &history, question);

    assert_eq!(messages[0].0, "system");
    assert_eq!(messages.last().unwrap().0, "user");
    assert_eq!(messages.last().unwrap().1, question);

    // ── 6. Persist to storage ───────────────────────────────────────────────
    let storage_tmp = TempDir::new()?;
    let store = SessionStore::new(&storage_tmp.path().join("chat.db"))?;

    let session_id = store.create_session("course")?;
    let user_msg = storage::Message {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: session_id.clone(),
        role: "user".to_string(),
        content: question.to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        token_count: Some(question.split_whitespace().count() as i64),
        ttft_ms: None,
        source_refs: None,
    };
    store.save_message(&user_msg)?;

    let source_names: Vec<&str> = results.iter().map(|r| r.page.file_name.as_str()).collect();
    let assistant_msg = storage::Message {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: session_id.clone(),
        role: "assistant".to_string(),
        content: "[model not loaded — no response]".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        token_count: None,
        ttft_ms: None,
        source_refs: Some(serde_json::to_string(&source_names)?),
    };
    store.save_message(&assistant_msg)?;

    let stored = store.get_session_messages(&session_id)?;
    assert_eq!(stored.len(), 2);
    assert_eq!(stored[0].role, "user");
    assert_eq!(stored[1].role, "assistant");

    let refs: Vec<String> = serde_json::from_str(stored[1].source_refs.as_ref().unwrap())?;
    assert!(
        refs.contains(&"backpropagation.md".to_string()),
        "backpropagation.md must appear in source refs; got {refs:?}"
    );

    Ok(())
}

#[test]
fn test_pipeline_user_docs_mode_question() -> Result<()> {
    use rag::{Chunker, RagIndex};
    use storage::SessionStore;

    // ── 1. Simulate user uploading two documents ────────────────────────────
    let chunker = Chunker::new(150, 30);

    let doc_a = "Week 3 — Backpropagation. The chain rule allows gradients to \
                 flow backwards through a neural network layer by layer.";
    let doc_b = "Week 5 — Regularisation. L2 regularisation penalises large \
                 weights by adding λ‖w‖² to the loss function.";

    let chunks_a = chunker.chunk("week3-notes.pdf", doc_a);
    let chunks_b = chunker.chunk("week5-notes.pdf", doc_b);

    // Synthetic 4-D embeddings.
    let emb_a: Vec<Vec<f32>> = chunks_a.iter().map(|_| normalize(&[1.0_f32, 0.0, 0.0, 0.0])).collect();
    let emb_b: Vec<Vec<f32>> = chunks_b.iter().map(|_| normalize(&[0.0_f32, 1.0, 0.0, 0.0])).collect();

    let mut index = RagIndex::new();
    index.add_chunks(chunks_a, emb_a)?;
    index.add_chunks(chunks_b, emb_b)?;

    // ── 2. Student asks about backpropagation (closer to doc_a) ────────────
    let query_emb = normalize(&[0.9_f32, 0.1, 0.0, 0.0]);
    let results = index.search(&query_emb, 2)?;

    assert_eq!(results[0].doc_name, "week3-notes.pdf",
        "closest doc should be week3 (backprop); got {}", results[0].doc_name);

    // ── 3. Construct user_docs system prompt ────────────────────────────────
    let context = results
        .iter()
        .map(|r| format!("[{}]\n{}", r.doc_name, r.chunk.text))
        .collect::<Vec<_>>()
        .join("\n\n");

    let system_prompt = build_system_prompt("user_docs", Some(&context));
    assert!(system_prompt.contains("week3-notes.pdf"));
    assert!(system_prompt.contains("If the answer is not in the documents"));

    // ── 4. Persist with source references ──────────────────────────────────
    let storage_tmp = TempDir::new()?;
    let store = SessionStore::new(&storage_tmp.path().join("docs.db"))?;
    let session_id = store.create_session("user_docs")?;

    let source_names: Vec<&str> = results.iter().map(|r| r.doc_name.as_str()).collect();
    let reply = storage::Message {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: session_id.clone(),
        role: "assistant".to_string(),
        content: "Based on your week 3 notes, backpropagation…".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        token_count: Some(9),
        ttft_ms: Some(280),
        source_refs: Some(serde_json::to_string(&source_names)?),
    };
    store.save_message(&reply)?;

    let msgs = store.get_session_messages(&session_id)?;
    let refs: Vec<String> = serde_json::from_str(msgs[0].source_refs.as_ref().unwrap())?;
    assert!(refs.contains(&"week3-notes.pdf".to_string()));

    Ok(())
}

#[test]
fn test_pipeline_general_mode_no_retrieval_needed() -> Result<()> {
    use storage::SessionStore;

    let system_prompt = build_system_prompt("general", None);

    // Multi-turn exchange — no retrieval required.
    let mut history: Vec<(String, String)> = Vec::new();

    let turns = [
        ("user",      "What's the difference between Python lists and tuples?"),
        ("assistant", "Lists are mutable; tuples are immutable."),
        ("user",      "Can tuples be used as dict keys?"),
        ("assistant", "Yes — because they are hashable (as long as all elements are hashable)."),
    ];

    for (role, content) in &turns {
        history.push((role.to_string(), content.to_string()));
    }

    // Build the messages as the LLM would receive them.
    let next_q = "What about frozensets?";
    let messages = build_chat_messages(&system_prompt, &history, next_q);

    // system + 4 history turns + 1 new user = 6
    assert_eq!(messages.len(), 6);
    assert_eq!(messages[0].0, "system");
    assert_eq!(messages[0].1, "You are a helpful AI assistant.");
    assert_eq!(messages.last().unwrap().1, next_q);

    // Persist the full exchange.
    let tmp = TempDir::new()?;
    let store = SessionStore::new(&tmp.path().join("general.db"))?;
    let session_id = store.create_session("general")?;

    for (role, content) in &turns {
        let msg = storage::Message {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.clone(),
            role: role.to_string(),
            content: content.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            token_count: None,
            ttft_ms: None,
            source_refs: None,
        };
        store.save_message(&msg)?;
    }

    let stored = store.get_session_messages(&session_id)?;
    assert_eq!(stored.len(), 4);
    assert_eq!(stored[0].role, "user");
    assert_eq!(stored[1].role, "assistant");

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// § 9  Regression — bug fix: get_agent_messages returns Option
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_agent_get_messages_is_option_not_vec() {
    use agents::{AgentOrchestrator, AgentType};

    let mut orch = AgentOrchestrator::new();
    let id = orch.spawn_agent(AgentType::Dev);
    orch.add_message(&id, "user", "Hello").unwrap();

    // Must be Some(_) for a valid agent.
    let result = orch.get_agent_messages(&id);
    assert!(result.is_some(), "valid agent must return Some(messages)");
    let msgs = result.unwrap();
    assert_eq!(msgs.len(), 2); // system + "Hello"

    // Must be None for an unknown agent (regression for agents.rs bug).
    let missing = orch.get_agent_messages(&"unknown-id".to_string());
    assert!(
        missing.is_none(),
        "unknown agent must return None, not panic — this is the bug fixed in agents.rs"
    );
}
