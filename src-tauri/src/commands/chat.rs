use std::sync::atomic::Ordering;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{ipc::Channel, State};

use inference::{ChatMessage, GenerationParams};
use telemetry::{Deidentifier, DeviceProfile, TelemetryMessage, TelemetrySession};
use crate::state::{AppState, TokenEvent};

// ── Public request / event types ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub session_id: String,
    pub message: String,
    pub mode: ChatMode,
    /// `Some(true)` = force 2-stage planning; `Some(false)` = skip it; `None` = RAM-adaptive default.
    #[serde(default)]
    pub use_plan: Option<bool>,
    /// Replaces the default system prompt. Empty string / absent = use default.
    #[serde(default)]
    pub custom_system_prompt: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub mode: String,
}

#[derive(Debug, Deserialize)]
pub struct RenameSessionRequest {
    pub session_id: String,
    pub title: String,
}

#[derive(Debug, Deserialize)]
pub struct DeleteSessionRequest {
    pub session_id: String,
}

#[derive(Debug, Serialize)]
pub struct ChatSessionSummary {
    pub id: String,
    pub title: String,
    pub mode: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChatMode {
    General,
    Course { course_id: String },
    UserDocs,
    StudyTopic {
        course_id: String,
        page_slug: String,
        page_content: String,
    },
}

#[derive(Debug, Clone, Default)]
pub(crate) struct BuiltContext {
    pub context: String,
    pub source_refs: Vec<String>,
    /// Parallel to `source_refs` — raw chunk UUID for each cited excerpt.
    /// Stored in the DB for traceability; never shown in the UI.
    pub ref_chunk_ids: Vec<String>,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Create a new chat session and return its id.
#[tauri::command]
pub async fn create_chat_session(
    request: CreateSessionRequest,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let store = state.session_store.lock().await;
    store
        .create_session(&request.mode)
        .map_err(|e| e.to_string())
}

/// List recent chat sessions, newest first.
#[tauri::command]
pub async fn list_chat_sessions(
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<ChatSessionSummary>, String> {
    let store = state.session_store.lock().await;
    let sessions = store
        .list_sessions(limit.unwrap_or(100))
        .map_err(|e| e.to_string())?;

    Ok(sessions
        .into_iter()
        .map(|s| ChatSessionSummary {
            id: s.id,
            title: s.title.unwrap_or_else(|| "New chat".to_string()),
            mode: s.mode,
            updated_at: s.updated_at,
        })
        .collect())
}

/// Rename an existing chat session.
#[tauri::command]
pub async fn rename_chat_session(
    request: RenameSessionRequest,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let store = state.session_store.lock().await;
    store
        .update_session_title(&request.session_id, &request.title)
        .map_err(|e| e.to_string())
}

/// Delete a chat session and all associated messages.
#[tauri::command]
pub async fn delete_chat_session(
    request: DeleteSessionRequest,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let store = state.session_store.lock().await;
    store
        .delete_session(&request.session_id)
        .map_err(|e| e.to_string())
}

/// Stream a chat response token-by-token to the frontend via `Channel<TokenEvent>`.
///
/// Flow:
///  1. Reset the cancel flag; mark app as inferring.
///  2. Load conversation history from SQLite.
///  3. Build retrieval context based on `mode`.
///  4. Construct the message list (system + history + new user turn).
///  5. Save the user message to SQLite.
///  6. Run LLM inference inside `block_in_place` so the Tokio runtime stays
///     alive while the blocking llama.cpp call proceeds.
///  7. Forward every token to the frontend channel; honour cancel requests.
///  8. Save the completed assistant message to SQLite.
///  9. De-identify and enqueue the session for background telemetry upload.
/// 10. Clear the inferring flag so the background flush task may send.
#[tauri::command]
pub async fn chat_stream(
    request: ChatRequest,
    channel: Channel<TokenEvent>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // ── Perf timing ────────────────────────────────────────────────────────────
    let t0 = std::time::Instant::now();

    // 1. Reset cancel flag and mark as actively inferring.
    state.cancel_flag.store(false, Ordering::SeqCst);
    state.is_inferring.store(true, Ordering::SeqCst);

    let cancel_flag = state.cancel_flag.clone();
    let session_id = request.session_id.clone();
    let message = request.message.clone();
    let mode = request.mode.clone();
    let use_plan = request.use_plan;
    let custom_system_prompt = request.custom_system_prompt.clone();
    let (available_ram_mb, total_ram_mb) = inference::ModelManager::ram_snapshot_mb();
    let ram = crate::runtime_tuning::RamSnapshot {
        available_mb: available_ram_mb,
        total_mb: total_ram_mb,
    };
    let history_pairs_budget = crate::runtime_tuning::history_pairs_budget_from_ram(ram);
    let history_pairs_budget = if matches!(&mode, ChatMode::UserDocs) {
        history_pairs_budget.min(1)
    } else {
        history_pairs_budget
    };

    // 2. Load conversation history using iMentor-style context strategy:
    //    a) Extract all complete user/assistant pairs.
    //    b) Always keep the RECENCY_KEEP most recent pairs verbatim.
    //    c) From older pairs, score by keyword relevance to current query and
    //       keep the top (budget - RECENCY_KEEP) most relevant ones.
    //    d) If there are pairs beyond the budget, inject the stored session
    //       summary as a [CONVERSATION HISTORY SUMMARY] / Understood exchange
    //       so the model retains long-range context without verbatim bloat.
    //    e) Update the rolling summary asynchronously after the response.
    const RECENCY_KEEP: usize = 2; // always keep these recent pairs verbatim
    let (history, existing_summary): (Vec<ChatMessage>, Option<String>) = {
        let store = state.session_store.lock().await;
        let all_msgs = store.get_session_messages(&session_id).unwrap_or_default();
        let existing_summary = store.get_session_summary(&session_id).unwrap_or(None);

        // Collect all complete user/assistant pairs (oldest first).
        let mut all_pairs: Vec<(usize, usize)> = Vec::new();
        let mut i = all_msgs.len();
        while i >= 2 {
            let asst = &all_msgs[i - 1];
            let user = &all_msgs[i - 2];
            if asst.role == "assistant" && user.role == "user" {
                all_pairs.push((i - 2, i - 1));
                i -= 2;
            } else {
                i -= 1;
            }
        }
        all_pairs.reverse(); // oldest pair first

        let total_pairs = all_pairs.len();

        // Score keyword relevance of each pair against the current query.
        // Significant words: length > 3, not pure numbers.
        let query_words: Vec<&str> = message
            .split_whitespace()
            .filter(|w| w.len() > 3 && !w.chars().all(|c| c.is_ascii_digit()))
            .collect();

        let score_pair = |u_idx: usize, a_idx: usize| -> usize {
            if query_words.is_empty() {
                return 0;
            }
            let text = format!(
                "{} {}",
                all_msgs[u_idx].content.to_lowercase(),
                all_msgs[a_idx].content.to_lowercase()
            );
            query_words.iter().filter(|w| text.contains(w.to_lowercase().as_str())).count()
        };

        // Select pairs to include verbatim.
        let recency_keep = RECENCY_KEEP.min(history_pairs_budget);
        let relevance_slots = history_pairs_budget.saturating_sub(recency_keep);

        // Recent pairs (protect from pruning).
        let recent_start = total_pairs.saturating_sub(recency_keep);
        let recent_pairs = &all_pairs[recent_start..];

        // Older pairs eligible for relevance pruning.
        let older_pairs = &all_pairs[..recent_start];

        let mut selected_older: Vec<(usize, usize, usize)> = older_pairs // (score, u, a)
            .iter()
            .map(|&(u, a)| (score_pair(u, a), u, a))
            .collect();
        // Highest score first, then keep oldest by index on tie.
        selected_older.sort_by(|x, y| y.0.cmp(&x.0).then(x.1.cmp(&y.1)));
        let mut kept_older: Vec<(usize, usize)> = selected_older
            .into_iter()
            .take(relevance_slots)
            .map(|(_, u, a)| (u, a))
            .collect();
        kept_older.sort_by_key(|&(u, _)| u); // restore chronological order

        // Determine if we have older pairs that didn't fit (need summary injection).
        let pairs_dropped = total_pairs > recency_keep + kept_older.len();

        // Build message list.
        let mut history_msgs: Vec<ChatMessage> = Vec::new();

        // Inject summary exchange when older turns were dropped.
        // Mirrors iMentor's buildSummaryInjection: a fake user/model turn that
        // primes the LLM with prior-session context without verbose history.
        if pairs_dropped {
            if let Some(ref summary) = existing_summary {
                if !summary.is_empty() {
                    history_msgs.push(ChatMessage {
                        role: "user".to_string(),
                        content: format!(
                            "[CONVERSATION HISTORY SUMMARY]\n{summary}\n[END SUMMARY]"
                        ),
                    });
                    history_msgs.push(ChatMessage {
                        role: "assistant".to_string(),
                        content: "Understood. I have reviewed the conversation history and will maintain continuity.".to_string(),
                    });
                }
            }
        }

        // Append selected older pairs + recent pairs.
        for &(u, a) in kept_older.iter().chain(recent_pairs.iter()) {
            history_msgs.push(ChatMessage {
                role: all_msgs[u].role.clone(),
                content: all_msgs[u].content.clone(),
            });
            history_msgs.push(ChatMessage {
                role: all_msgs[a].role.clone(),
                content: all_msgs[a].content.clone(),
            });
        }

        (history_msgs, existing_summary)
    };
    let t1_history = t0.elapsed().as_millis();

    // 3. Build retrieval context.
    let built_context = build_context(&mode, &message, &state)
        .await
        .map_err(|e| e.to_string())?;
    let llm_ctx = {
        let llm_guard = state.llm.lock().await;
        llm_guard
            .as_ref()
            .map(|llm| llm.context_size())
            .unwrap_or(crate::build_config::n_ctx())
    };
    let context_budget = crate::runtime_tuning::context_char_budget_from_ram(ram, llm_ctx);
    let context = crate::runtime_tuning::truncate_context(built_context.context.clone(), context_budget);
    let source_refs = built_context.source_refs;
    let ref_chunk_ids = built_context.ref_chunk_ids;
    let t2_context = t0.elapsed().as_millis();

    let citations_footer = if matches!(&mode, ChatMode::UserDocs) {
        if source_refs.is_empty() {
            "\n\nReferences:\n- Self-generated (response from model knowledge; no document excerpts matched this query)".to_string()
        } else {
            let refs = source_refs
                .iter()
                .map(|r| format!("- {}", r))
                .collect::<Vec<_>>()
                .join("\n");
            format!("\n\nReferences:\n{}", refs)
        }
    } else {
        String::new()
    };

    // 4. Build full message list.
    // If the student supplied a custom system prompt in settings, use it as the
    // base (replacing the default guardrail).  Mode-specific context (course /
    // document assistant framing) is still appended, and any retrieved RAG
    // context is appended as before.
    // Build system message. When no_think=true (Qwen3 thinking models), append
    // \n/no_think HERE in the system message content — NOT in individual user turns.
    //
    // KV-cache stability rule:
    //   The system message is identical on every turn → its tokens are ALWAYS
    //   the first N tokens of every prompt → guaranteed KV prefix hit on turn 2+.
    //   Putting /no_think on the last user message instead means different user
    //   messages get the suffix on different turns, breaking the cached prefix.
    let system_prompt = {
        let custom = custom_system_prompt.as_deref().unwrap_or("").trim();
        let base = if custom.is_empty() {
            build_system_prompt(&mode, "")
        } else {
            custom.to_string()
        };
        // Suppress thinking unless the user has turned on Refine (use_plan=true).
        // LLM_NO_THINK = compile-time default; Refine toggle overrides per-request.
        if crate::build_config::LLM_NO_THINK && !use_plan.unwrap_or(false) {
            format!("{base}\n/no_think")
        } else {
            base
        }
    };
    let mut messages = Vec::with_capacity(history.len() + 2);
    messages.push(ChatMessage {
        role: "system".to_string(),
        content: system_prompt,
    });
    messages.extend(history);

    // Dynamic RAG context is placed in the latest user message to be KV-cache friendly.
    let user_message_content = if context.is_empty() {
        message.clone()
    } else {
        format!(
            "Use the following reference excerpts to answer the student's question:\n\n{}\n\nStudent Question: {}",
            context, message
        )
    };

    messages.push(ChatMessage {
        role: "user".to_string(),
        content: user_message_content,
    });

    let max_tokens = crate::runtime_tuning::adaptive_max_tokens_from_ram(llm_ctx, ram);
    tracing::info!(
        available_ram_mb,
        total_ram_mb,
        history_pairs_budget,
        context_budget,
        llm_ctx,
        max_tokens,
        "Applying RAM-adaptive chat budgets"
    );

    let params = GenerationParams {
        max_tokens,
        temperature: 0.7,
        top_p: 0.9,
        repeat_penalty: 1.1,
        system_prompt: None,
        no_think: !use_plan.unwrap_or(false),
    };

    // 5. Persist user message immediately (before inference starts).
    {
        let store = state.session_store.lock().await;
        let msg = storage::Message {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.clone(),
            role: "user".to_string(),
            content: message.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            token_count: None,
            ttft_ms: None,
            source_refs: None,
        };
        store.save_message(&msg).ok();
    }
    let t3_saved = t0.elapsed().as_millis();

    // 6. Spin up a channel between the blocking inference thread and this
    //    async task.
    let (token_tx, mut token_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let llm_arc = state.llm.clone();

    tracing::info!(
        "[PERF] pre-inference setup: history={t1_history}ms  context={t2_context}ms  save={t3_saved}ms"
    );

    let cancel_flag_for_inference = cancel_flag.clone();
    tokio::task::spawn(async move {
        let t_spawn = std::time::Instant::now();
        let mut llm_guard = llm_arc.lock().await;
        let lock_wait_ms = t_spawn.elapsed().as_millis();
        tracing::info!("[PERF] LLM lock wait: {lock_wait_ms}ms");
        if let Some(llm) = llm_guard.as_mut() {
            tokio::task::block_in_place(|| {
                if let Err(e) = llm.generate_stream(&messages, &params, token_tx.clone(), Some(cancel_flag_for_inference.clone())) {
                    tracing::error!("generate_stream error: {e:#}");
                    let _ = token_tx.send(format!("⚠️ Inference error: {e}"));
                }
                let _ = token_tx.send("\x00".to_string());
            });
        } else {
            let _ = token_tx.send("⚠️ No model loaded. Please download the LLM model first.".to_string());
            let _ = token_tx.send("\x00".to_string());
        }
    });

    // 7. Forward tokens to the frontend; honour cancellation.
    //    start_time = t0 so TTFT reflects total wall-clock delay since request arrived.
    let start_time = t0;
    let mut first_token_ms: Option<u64> = None;
    let mut full_response = String::new();
    let mut token_count = 0u64;

    while let Some(token) = token_rx.recv().await {
        // Cancellation requested by the user.
        if cancel_flag.load(Ordering::SeqCst) {
            // Signal done so the frontend knows the stream ended.
            channel
                .send(TokenEvent {
                    token: String::new(),
                    done: true,
                })
                .ok();
            break;
        }

        // Done sentinel ('\x00') emitted by `generate_stream` when finished,
        // or by the no-model branch above.
        if token == "\x00" {
            if !citations_footer.is_empty() {
                // Append verbose citations (with snippet text) to full_response for DB
                // storage and debugging, but do NOT stream them to the frontend — the
                // LLM already emits [Ref N] inline labels which are shown to the user.
                full_response.push_str(&citations_footer);
            }
            channel
                .send(TokenEvent {
                    token: String::new(),
                    done: true,
                })
                .ok();
            break;
        }

        // Record time-to-first-token.
        if first_token_ms.is_none() {
            first_token_ms = Some(start_time.elapsed().as_millis() as u64);
        }

        token_count += 1;
        full_response.push_str(&token);
        channel
            .send(TokenEvent {
                token,
                done: false,
            })
            .ok();
    }

    // Ensure frontend is always notified when the loop ends (e.g. channel dropped).
    channel
        .send(TokenEvent {
            token: String::new(),
            done: true,
        })
        .ok();

    // Log end-to-end perf summary for this request.
    {
        let total_ms = start_time.elapsed().as_millis();
        let ttft = first_token_ms.unwrap_or(0) as u128;
        let gen_ms = if total_ms > ttft { total_ms - ttft } else { 0 };
        let toks_per_sec = if gen_ms > 0 {
            (token_count as f64 / gen_ms as f64) * 1000.0
        } else { 0.0 };
        tracing::info!(
            "[PERF] RESULT  TTFT={ttft}ms  tokens={token_count}  gen={gen_ms}ms  \
             throughput={toks_per_sec:.1}tok/s  total={total_ms}ms  \
             (setup={t3_saved}ms)"
        );
    }

    // 8. Persist the completed assistant turn.
    if !full_response.is_empty() {
        let store = state.session_store.lock().await;
        let msg = storage::Message {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.clone(),
            role: "assistant".to_string(),
            content: full_response.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            token_count: Some(full_response.split_whitespace().count() as i64),
            ttft_ms: first_token_ms.map(|t| t as i64),
            source_refs: if matches!(&mode, ChatMode::UserDocs) {
                // Store [{label, chunk_id}] so chunk IDs are traceable in the
                // DB without being shown in the UI.
                if source_refs.is_empty() {
                    Some(r#"[{"self_generated":true}]"#.to_string())
                } else {
                    let entries: Vec<_> = source_refs
                        .iter()
                        .zip(ref_chunk_ids.iter())
                        .map(|(label, chunk_id)| serde_json::json!({
                            "label": label,
                            "chunk_id": chunk_id,
                        }))
                        .collect();
                    Some(serde_json::to_string(&entries).unwrap_or_else(|_| "[]".to_string()))
                }
            } else if source_refs.is_empty() {
                None
            } else {
                Some(serde_json::to_string(&source_refs).unwrap_or_else(|_| "[]".to_string()))
            },
        };
        store.save_message(&msg).ok();
    }

    // 9. Update the rolling session summary (iMentor-style context management).
    //    Generates a lightweight extractive summary from the new turn and appends
    //    it to any existing summary.  No LLM needed — pure text extraction.
    //    This runs before telemetry so the updated summary is available next turn.
    if !full_response.is_empty() {
        let store = state.session_store.lock().await;
        let new_topic = build_turn_summary(&message, &full_response);
        if !new_topic.is_empty() {
            let updated_summary = match existing_summary.as_deref() {
                None | Some("") => new_topic,
                Some(prev) => {
                    // Keep summary compact: max 10 entries, drop oldest on overflow.
                    let entries: Vec<&str> = prev.split(" | ").collect();
                    const MAX_SUMMARY_ENTRIES: usize = 10;
                    if entries.len() >= MAX_SUMMARY_ENTRIES {
                        let trimmed = &entries[entries.len() - (MAX_SUMMARY_ENTRIES - 1)..];
                        format!("{} | {}", trimmed.join(" | "), new_topic)
                    } else {
                        format!("{} | {}", prev, new_topic)
                    }
                }
            };
            store.update_session_summary(&session_id, &updated_summary).ok();
        }
    }

    // 10. Build and enqueue a de-identified telemetry session.
    //    This never blocks the UI — it writes to a local JSON file only.
    //    The background flush task will send it later when idle + online.
    {
        let deident = Deidentifier::new();
        let store = state.session_store.lock().await;
        let all_msgs = store.get_session_messages(&session_id).unwrap_or_default();

        // Hash the session_id so the raw UUID is never transmitted.
        let id_hash = {
            let mut h = Sha256::new();
            h.update(session_id.as_bytes());
            format!("{:x}", h.finalize())
        };

        let tel_msgs: Vec<TelemetryMessage> = all_msgs
            .iter()
            .map(|m| {
                if m.role == "user" {
                    let (clean, entities) = deident.clean(&m.content);
                    TelemetryMessage {
                        role: "user".to_string(),
                        content: Some(clean),
                        content_hash: None,
                        token_count: m.token_count,
                        ttft_ms: None,
                        redacted_entities: entities,
                    }
                } else {
                    // Never transmit assistant text — only a hash.
                    let hash = {
                        let mut h = Sha256::new();
                        h.update(m.content.as_bytes());
                        format!("{:x}", h.finalize())
                    };
                    TelemetryMessage {
                        role: "assistant".to_string(),
                        content: None,
                        content_hash: Some(hash),
                        token_count: m.token_count,
                        ttft_ms: m.ttft_ms,
                        redacted_entities: vec![],
                    }
                }
            })
            .collect();

        let mode_str = match &mode {
            ChatMode::General => "general",
            ChatMode::Course { .. } => "course",
            ChatMode::UserDocs => "user_docs",
            ChatMode::StudyTopic { .. } => "study_topic",
        };

        let dp = DeviceProfile::detect();
        // NOTE: Do NOT call inference::CpuProfile::detect() here — it runs a full
        // sysinfo query on every chat request. The device profile for telemetry
        // only needs static hardware facts (RAM, cores) which are stable.
        // enhance_with_inference_profile is skipped to avoid the per-request overhead.

        let session = TelemetrySession {
            session_id: id_hash,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            timestamp_utc: chrono::Utc::now().to_rfc3339(),
            mode: mode_str.to_string(),
            message_count: tel_msgs.len(),
            messages: tel_msgs,
            device_profile: dp,
        };

        drop(store); // release lock before async enqueue
        state.telemetry_queue.enqueue(session).await;
    }

    // 11. Clear inferring flag — background flush may now send queued sessions.
    state.is_inferring.store(false, Ordering::SeqCst);

    Ok(())
}

/// Set the cancel flag so that the currently-streaming `chat_stream` call
/// exits on its next token check.
#[tauri::command]
pub async fn cancel_generation(state: State<'_, AppState>) -> Result<(), String> {
    state.cancel_flag.store(true, Ordering::SeqCst);
    Ok(())
}

// ── Multi-stage generation helpers ───────────────────────────────────────────

/// Stage 1: generate a numbered structural outline (~100 tokens, not streamed).
///
/// Uses a stripped-down system prompt so the LLM outputs *only* the section
/// headings.  Called synchronously inside `block_in_place` before the main
/// streaming call.  Returns `None` on any failure so Stage 2 can fall back to
/// the unguided path.
///


// ── Context builders ──────────────────────────────────────────────────────────

/// Build a retrieval context string that will be injected into the system prompt.
pub(crate) async fn build_context(
    mode: &ChatMode,
    query: &str,
    state: &AppState,
) -> anyhow::Result<BuiltContext> {
    match mode {
        // General chat — no retrieval context needed.
        ChatMode::General => Ok(BuiltContext {
            context: String::new(),
            source_refs: Vec::new(),
            ref_chunk_ids: Vec::new(),
        }),

        // Course mode: BM25 search over the bundled wiki for this course.
        ChatMode::Course { course_id } => {
            let (available_ram_mb, total_ram_mb) = inference::ModelManager::ram_snapshot_mb();
            let ram = crate::runtime_tuning::RamSnapshot {
                available_mb: available_ram_mb,
                total_mb: total_ram_mb,
            };
            let top_k = crate::runtime_tuning::adaptive_rag_top_k_from_ram(
                crate::build_config::rag_top_k(),
                ram,
            );
            // Load the WikiEngine for this course (cached; concurrent reads share
            // the RwLock without blocking — only the first access per course needs
            // a brief write lock to insert the engine).
            let wiki_dir = state
                .assets_dir
                .join("courses")
                .join(course_id)
                .join("wiki");
            if !state.wiki_engines.read().await.contains_key(course_id) {
                // Engine not yet cached — acquire write lock to insert.
                if wiki_dir.exists() {
                    let engine = wiki::WikiEngine::new(&wiki_dir)?;
                    state.wiki_engines.write().await.insert(course_id.clone(), engine);
                } else {
                    // Course wiki not yet bundled — return empty context.
                    return Ok(BuiltContext {
                        context: String::new(),
                        source_refs: Vec::new(),
                        ref_chunk_ids: Vec::new(),
                    });
                }
            }

            let results = {
                let engines = state.wiki_engines.read().await;
                let engine = engines.get(course_id).unwrap();
                engine.search(query, top_k)?
            };

            if results.is_empty() {
                return Ok(BuiltContext {
                    context: String::new(),
                    source_refs: Vec::new(),
                    ref_chunk_ids: Vec::new(),
                });
            }

            let mut ctx = String::from("Relevant course knowledge:\n\n");
            for result in &results {
                ctx.push_str(&format!(
                    "**{}**\n{}\n\n",
                    result.page.title, result.page.excerpt
                ));
            }
            Ok(BuiltContext {
                context: ctx,
                source_refs: Vec::new(),
                ref_chunk_ids: Vec::new(),
            })
        }

        // User-docs mode: dense retrieval via HNSW over the user's uploaded docs.
        ChatMode::UserDocs => {
            let (available_ram_mb, total_ram_mb) = inference::ModelManager::ram_snapshot_mb();
            let ram = crate::runtime_tuning::RamSnapshot {
                available_mb: available_ram_mb,
                total_mb: total_ram_mb,
            };
            let top_k = crate::runtime_tuning::adaptive_rag_top_k_from_ram(
                crate::build_config::rag_top_k(),
                ram,
            );
            // Embed the query (load the embedding model lazily if needed).
            let query_embedding = {
                let mut embedder_guard = state.embedder.lock().await;
                if embedder_guard.is_none() {
                    let emb_path = state.model_manager.embedding_model_path();
                    if emb_path.exists() {
                        let n_threads = inference::CpuProfile::detect().recommended_threads;
                        match inference::EmbeddingEngine::load(&emb_path, n_threads) {
                            Ok(e) => *embedder_guard = Some(e),
                            Err(e) => {
                                tracing::warn!("Failed to load embedding model: {e}");
                                return Ok(BuiltContext {
                                    context: String::new(),
                                    source_refs: Vec::new(),
                                    ref_chunk_ids: Vec::new(),
                                });
                            }
                        }
                    } else {
                        tracing::warn!("Embedding model not found at {:?}", emb_path);
                        return Ok(BuiltContext {
                            context: String::new(),
                            source_refs: Vec::new(),
                            ref_chunk_ids: Vec::new(),
                        });
                    }
                }
                embedder_guard.as_mut().unwrap().embed(query)?
            };

            let rag = state.rag_index.read().await;
            let all_results = rag.search(&query_embedding, top_k * 3)?;
            drop(rag);

            // Get selected doc IDs from settings.
            let selected_ids: std::collections::HashSet<String> = {
                let store = state.session_store.lock().await;
                let rows = store.list_settings_by_prefix("doc_selected:").unwrap_or_default();
                rows.into_iter()
                    .filter(|(_, v)| v == "true")
                    .map(|(k, _)| k.trim_start_matches("doc_selected:").to_string())
                    .collect()
            };

            // Resolve UUID doc_ids → human-readable file names from metadata.
            let doc_names: std::collections::HashMap<String, String> = {
                let store = state.session_store.lock().await;
                let rows = store.list_settings_by_prefix("doc:").unwrap_or_default();
                rows.into_iter()
                    .filter_map(|(_, v)| serde_json::from_str::<serde_json::Value>(&v).ok())
                    .filter_map(|v| {
                        let id = v["id"].as_str()?.to_string();
                        let name = v["file_name"].as_str()?.to_string();
                        Some((id, name))
                    })
                    .collect()
            };

            // Filter by minimum cosine similarity (0.25) to drop irrelevant chunks.
            const MIN_SIMILARITY: f32 = 0.25;
            let results: Vec<_> = if selected_ids.is_empty() {
                all_results.into_iter()
                    .filter(|r| r.score >= MIN_SIMILARITY)
                    .take(top_k)
                    .collect()
            } else {
                all_results.into_iter()
                    .filter(|r| selected_ids.contains(&r.chunk.doc_id))
                    .filter(|r| r.score >= MIN_SIMILARITY)
                    .take(top_k)
                    .collect()
            };

            if results.is_empty() {
                return Ok(BuiltContext {
                    context: String::new(),
                    source_refs: Vec::new(),
                    ref_chunk_ids: Vec::new(),
                });
            }

            let mut ctx = String::from("Relevant document excerpts:\n\n");
            let mut refs = Vec::new();
            let mut chunk_ids = Vec::new();
            for (idx, scored) in results.iter().enumerate() {
                let snippet = chunk_leading_words(&scored.chunk.text, 10);
                let page = scored
                    .chunk
                    .page_number
                    .map(|p| p.to_string())
                    .unwrap_or_else(|| "?".to_string());
                let display_name = doc_names
                    .get(&scored.chunk.doc_id)
                    .cloned()
                    .unwrap_or_else(|| scored.doc_name.clone());
                let ref_label = format!(
                    "{} | p.{} | \"{}\"",
                    display_name,
                    page,
                    snippet
                );
                refs.push(ref_label.clone());
                chunk_ids.push(scored.chunk.id.clone());
                ctx.push_str(&format!(
                    "[Ref {}] {} (score: {:.2})\n{}\n\n",
                    idx + 1,
                    ref_label,
                    scored.score,
                    scored.chunk.text
                ));
            }
            Ok(BuiltContext {
                context: ctx,
                source_refs: refs,
                ref_chunk_ids: chunk_ids,
            })
        }

        // Study-topic mode: inject the current wiki page as context.
        ChatMode::StudyTopic { page_content, .. } => {
            if page_content.is_empty() {
                return Ok(BuiltContext {
                    context: String::new(),
                    source_refs: Vec::new(),
                    ref_chunk_ids: Vec::new(),
                });
            }
            let (available_ram_mb, total_ram_mb) = inference::ModelManager::ram_snapshot_mb();
            let ram = crate::runtime_tuning::RamSnapshot {
                available_mb: available_ram_mb,
                total_mb: total_ram_mb,
            };
            let snippet_budget = crate::runtime_tuning::context_char_budget_from_ram(
                ram,
                crate::build_config::n_ctx(),
            );
            let snippet = crate::runtime_tuning::truncate_context(page_content.clone(), snippet_budget);
            Ok(BuiltContext {
                context: format!(
                    "Study page content (use this to answer the student's question):\n\n{}",
                    snippet
                ),
                source_refs: Vec::new(),
                ref_chunk_ids: Vec::new(),
            })
        }
    }
}

fn chunk_leading_words(text: &str, n: usize) -> String {
    let cleaned = text
        .replace('\x0C', " ")
        .split_whitespace()
        .take(n)
        .collect::<Vec<_>>()
        .join(" ");
    if cleaned.is_empty() {
        "(empty chunk)".to_string()
    } else {
        cleaned
    }
}

/// Compose a system prompt, optionally prepending the retrieval context block.
/// Build a compact extractive summary entry for one conversation turn.
/// Extracts the question topic (first 60 chars of user query, cleaned) and
/// a keyword from the response for the rolling session summary.
///
/// Format: "Q: <topic> → <key_concept>"
/// Mirrors iMentor's per-turn topic condensation without requiring an LLM API.
pub(crate) fn build_turn_summary(user_query: &str, assistant_response: &str) -> String {
    // Trim the user query to a readable topic snippet.
    let topic: String = user_query
        .trim()
        .chars()
        .take(60)
        .collect::<String>()
        .trim_end_matches(|c: char| !c.is_alphanumeric())
        .to_string();
    if topic.is_empty() {
        return String::new();
    }

    // Extract a key concept word from the assistant response:
    // take the first word > 5 chars that isn't a stop word.
    const STOP: &[&str] = &[
        "which", "their", "these", "those", "about", "would", "could", "should",
        "there", "where", "while", "since", "given", "using", "first", "second",
        "third", "every", "other", "after", "before", "often",
    ];
    let key_concept = assistant_response
        .split_whitespace()
        .find(|w| {
            let lc = w.to_lowercase();
            let clean: String = lc.chars().filter(|c| c.is_alphabetic()).collect();
            clean.len() > 5 && !STOP.contains(&clean.as_str())
        })
        .map(|w| {
            let clean: String = w.chars().filter(|c| c.is_alphabetic()).collect();
            clean.to_lowercase()
        })
        .unwrap_or_default();

    if key_concept.is_empty() {
        format!("Q: {topic}")
    } else {
        format!("Q: {topic} → {key_concept}")
    }
}

pub(crate) fn build_system_prompt(mode: &ChatMode, context: &str) -> String {
    const GUARDRAIL: &str = "\
You are Student AI, an offline educational and career placement assistant for BTech/BE engineering students.

Answer ONLY questions about: engineering (all branches), mathematics, data structures and algorithms (DSA), placement interviews, coding rounds, core computer science (OS, DBMS, CN), and personal development.

Politely refuse anything off-topic: politics, current news, religion, adult content, illegal activities, financial speculation. Say: \"I'm here to help with your engineering studies and placement preparation. I can't assist with that, but feel free to ask me a DSA problem or core CS concept!\"

RESPONSE FORMAT (always follow):
1. **Concept / Approach** — define the core idea or algorithm approach concisely.
2. **How it works** — step-by-step logic, time/space complexity, or system architecture.
3. **Implementation / Example** — a code snippet (preferably C++, Java, or Python), diagram, or numerical example.
4. **Interview Pitfalls** — common mistakes, edge cases, and what interviewers look for.

STYLE:
- LaTeX math: $...$ inline, $$...$$ display. Never plain ASCII math ($x^2$ not x^2).
- Fenced code blocks with language tag. Code must be production-ready and optimized.
- Always write COMPLETE responses — never stop mid-explanation.
- Focus heavily on getting the student ready for top-tier tech and engineering placements.
- End every response with a **Practice check:** question (e.g., an edge case or follow-up question an interviewer might ask).
";

    let mode_context = match mode {
        ChatMode::General => String::new(),

        ChatMode::Course { .. } => {
            "\n\nYou are acting as a course tutor. \
             Use the provided course knowledge to answer student questions accurately. \
             Cite the specific topic or section when relevant."
                .to_string()
        }

        ChatMode::UserDocs => {
            "\n\nYou are acting as a document assistant. \
             Use ONLY the provided document excerpts to answer the question. \
             Cite your evidence using the provided [Ref N] labels. \
             If the provided excerpts are NOT relevant to the question, \
             state clearly that the uploaded documents do not cover this topic \
             and answer from your general knowledge instead."
                .to_string()
        }

        ChatMode::StudyTopic { page_slug, .. } => {
            format!(
                "\n\nYou are a study assistant helping a student understand the topic '{page_slug}'. \
                 Use the provided page content as your primary reference, and supplement with \
                 your own knowledge. Give clear explanations with examples."
            )
        }
    };

    let base = format!("{}{}", GUARDRAIL, mode_context);

    if context.is_empty() {
        base
    } else {
        format!("{}\n\n{}", base, context)
    }
}

/// Return all messages for a session, in chronological order (oldest first).
/// Used by the frontend to restore chat history after a session switch or app restart.
#[tauri::command]
pub async fn get_session_messages(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<storage::Message>, String> {
    let store = state.session_store.lock().await;
    store
        .get_session_messages(&session_id)
        .map_err(|e| e.to_string())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── System prompt content tests ──────────────────────────────────────────

    #[test]
    fn test_general_mode_prompt_no_context() {
        let mode = ChatMode::General;
        let prompt = build_system_prompt(&mode, "");
        assert!(prompt.contains("Student AI"));
        assert!(prompt.contains("students"));
        // No context block injected
        assert!(!prompt.contains("Relevant"));
    }

    #[test]
    fn test_course_mode_prompt_no_context() {
        let mode = ChatMode::Course { course_id: "machine-learning".into() };
        let prompt = build_system_prompt(&mode, "");
        assert!(prompt.contains("course tutor"));
        assert!(prompt.contains("course knowledge"));
        assert!(!prompt.contains("Relevant"));
    }

    #[test]
    fn test_user_docs_mode_prompt_no_context() {
        let mode = ChatMode::UserDocs;
        let prompt = build_system_prompt(&mode, "");
        assert!(prompt.contains("document assistant"));
        assert!(prompt.contains("document excerpts"));
        assert!(!prompt.contains("Relevant"));
    }

    #[test]
    fn test_general_mode_prompt_with_context() {
        let mode = ChatMode::General;
        let ctx = "Relevant course knowledge:\n\n**Gradient Descent**\nAn optimisation algorithm.";
        let prompt = build_system_prompt(&mode, ctx);
        assert!(prompt.contains("Student AI"));
        assert!(prompt.contains("Gradient Descent"));
        // Context is appended after a blank line
        let parts: Vec<&str> = prompt.splitn(2, "\n\n").collect();
        assert_eq!(parts.len(), 2);
        assert!(parts[1].contains("Gradient Descent"));
    }

    #[test]
    fn test_course_mode_prompt_with_wiki_context() {
        let mode = ChatMode::Course { course_id: "machine-learning".into() };
        let ctx = "Relevant course knowledge:\n\n**Bias-Variance Tradeoff**\nHigh bias = underfitting; high variance = overfitting.";
        let prompt = build_system_prompt(&mode, ctx);
        assert!(prompt.contains("course tutor"));
        assert!(prompt.contains("Bias-Variance"));
        assert!(prompt.contains("underfitting"));
    }

    #[test]
    fn test_user_docs_mode_prompt_with_rag_context() {
        let mode = ChatMode::UserDocs;
        let ctx = "Relevant document excerpts:\n\n[lecture-notes.pdf]\nThe softmax function normalises logits into a probability distribution.";
        let prompt = build_system_prompt(&mode, ctx);
        assert!(prompt.contains("document assistant"));
        assert!(prompt.contains("lecture-notes.pdf"));
        assert!(prompt.contains("softmax"));
    }

    // ── Prompt structure: system → history → user ────────────────────────────

    #[test]
    fn test_prompt_structure_covers_all_roles() {
        // Simulate how chat_stream builds the full message list
        let mode = ChatMode::General;
        let context = "";
        let system_prompt = build_system_prompt(&mode, context);
        let history = vec![
            inference::ChatMessage { role: "user".into(), content: "What is ML?".into() },
            inference::ChatMessage { role: "assistant".into(), content: "ML is...".into() },
        ];
        let new_question = "What is supervised learning?";

        let mut messages = Vec::new();
        messages.push(inference::ChatMessage { role: "system".into(), content: system_prompt.clone() });
        messages.extend(history.iter().cloned());
        messages.push(inference::ChatMessage { role: "user".into(), content: new_question.into() });

        assert_eq!(messages.len(), 4);
        assert_eq!(messages[0].role, "system");
        assert_eq!(messages[1].role, "user");
        assert_eq!(messages[1].content, "What is ML?");
        assert_eq!(messages[2].role, "assistant");
        assert_eq!(messages[3].role, "user");
        assert_eq!(messages[3].content, "What is supervised learning?");
        // System prompt carries the correct persona
        assert!(messages[0].content.contains("Student AI"));
        assert!(messages[0].content.contains("engineering and science students"));
    }

    // ── Multi-turn conversation history ──────────────────────────────────────

    #[test]
    fn test_multi_turn_conversation_accumulation() {
        // Verifies that successive turns are accumulated correctly in storage
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("chat.db");
        let store = storage::SessionStore::new(&db).unwrap();
        let session_id = store.create_session("general").unwrap();

        let questions = [
            ("user", "What is gradient descent?"),
            ("assistant", "Gradient descent is an optimisation algorithm that minimises a loss function by iteratively moving in the direction of steepest descent."),
            ("user", "How does learning rate affect it?"),
            ("assistant", "A high learning rate may overshoot the minimum; a low one converges slowly."),
            ("user", "What is the difference between SGD and full-batch gradient descent?"),
        ];

        for (role, content) in &questions {
            store.save_message(&storage::Message {
                id: uuid::Uuid::new_v4().to_string(),
                session_id: session_id.clone(),
                role: role.to_string(),
                content: content.to_string(),
                created_at: chrono::Utc::now().to_rfc3339(),
                token_count: Some(content.split_whitespace().count() as i64),
                ttft_ms: None,
                source_refs: None,
            }).unwrap();
        }

        let history = store.get_session_messages(&session_id).unwrap();
        assert_eq!(history.len(), 5);
        assert_eq!(history[0].role, "user");
        assert_eq!(history[0].content, "What is gradient descent?");
        assert_eq!(history[4].role, "user");
        assert_eq!(history[4].content, "What is the difference between SGD and full-batch gradient descent?");
    }

    // ── Chat modes: question routing ─────────────────────────────────────────

    #[test]
    fn test_general_questions_get_general_prompt() {
        let questions = [
            "What is machine learning?",
            "Explain the difference between supervised and unsupervised learning",
            "What is a neural network?",
            "Define precision and recall",
            "What is the curse of dimensionality?",
        ];
        for q in &questions {
            let prompt = build_system_prompt(&ChatMode::General, "");
            assert!(prompt.contains("Student AI"), "Failed for: {q}");
            assert!(prompt.contains("educational assistant"), "Failed for: {q}");
            assert!(!prompt.contains("tutor"), "Should not use tutor persona for: {q}");
        }
    }

    #[test]
    fn test_course_mode_system_prompt_cite_instruction() {
        // Course mode should instruct the model to cite topics
        let prompt = build_system_prompt(
            &ChatMode::Course { course_id: "machine-learning".into() },
            "",
        );
        assert!(prompt.contains("Cite") || prompt.contains("cite"));
    }

    #[test]
    fn test_user_docs_mode_system_prompt_cite_instruction() {
        // UserDocs mode should instruct the model to cite document sections
        let prompt = build_system_prompt(&ChatMode::UserDocs, "");
        assert!(prompt.contains("cite") || prompt.contains("Cite"));
        assert!(prompt.contains("document"));
    }

    // ── Context injection format ─────────────────────────────────────────────

    #[test]
    fn test_course_context_format() {
        // Simulate what build_context returns for course mode
        let ctx = format!(
            "Relevant course knowledge:\n\n**{}**\n{}\n\n**{}**\n{}\n\n",
            "Logistic Regression",
            "A supervised classification algorithm using the sigmoid function.",
            "Decision Boundary",
            "The hyperplane that separates classes in feature space.",
        );
        let prompt = build_system_prompt(&ChatMode::Course { course_id: "ml".into() }, &ctx);
        assert!(prompt.contains("Logistic Regression"));
        assert!(prompt.contains("sigmoid"));
        assert!(prompt.contains("Decision Boundary"));
    }

    #[test]
    fn test_user_docs_context_format() {
        // Simulate what build_context returns for UserDocs mode
        let ctx = format!(
            "Relevant document excerpts:\n\n[{}]\n{}\n\n[{}]\n{}\n\n",
            "week3-notes.pdf",
            "Backpropagation computes gradients by the chain rule of calculus.",
            "textbook.pdf",
            "The vanishing gradient problem makes training deep networks difficult.",
        );
        let prompt = build_system_prompt(&ChatMode::UserDocs, &ctx);
        assert!(prompt.contains("week3-notes.pdf"));
        assert!(prompt.contains("Backpropagation"));
        assert!(prompt.contains("textbook.pdf"));
        assert!(prompt.contains("vanishing gradient"));
    }

    // ── No-model behaviour ───────────────────────────────────────────────────

    #[test]
    fn test_cancel_flag_is_atomic_bool() {
        // Verify the cancel flag can be set and read (used in chat_stream)
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;
        let flag = Arc::new(AtomicBool::new(false));
        assert!(!flag.load(Ordering::SeqCst));
        flag.store(true, Ordering::SeqCst);
        assert!(flag.load(Ordering::SeqCst));
        flag.store(false, Ordering::SeqCst);
        assert!(!flag.load(Ordering::SeqCst));
    }
}
