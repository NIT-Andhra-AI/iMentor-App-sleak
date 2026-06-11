use anyhow::{Context, Result};
#[allow(deprecated)]
use llama_cpp_2::{
    context::{params::LlamaContextParams, LlamaContext},
    llama_batch::LlamaBatch,
    model::{params::LlamaModelParams, AddBos, LlamaModel, Special, LlamaChatMessage},
    sampling::LlamaSampler,
    token::{LlamaToken, logit_bias::LlamaLogitBias},
};
use llama_cpp_sys_2::LLAMA_FLASH_ATTN_TYPE_AUTO;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;
use tracing::{debug, info, warn};


/// A single message in a chat conversation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatMessage {
    /// One of: "system", "user", "assistant"
    pub role: String,
    pub content: String,
}

/// Parameters controlling text generation behaviour.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GenerationParams {
    /// Maximum number of new tokens to generate.
    pub max_tokens: u32,
    /// Sampling temperature (higher = more random).
    pub temperature: f32,
    /// Nucleus (top-p) sampling threshold.
    pub top_p: f32,
    /// Penalty applied to recently seen tokens.
    pub repeat_penalty: f32,
    /// Optional system prompt that overrides the one embedded in messages.
    pub system_prompt: Option<String>,
    /// When `true`, append `/no_think` to the system prompt so that thinking
    /// models (e.g. Qwen3) skip their chain-of-thought reasoning step.
    /// Has no effect on non-thinking models.
    pub no_think: bool,
}

impl Default for GenerationParams {
    fn default() -> Self {
        Self {
            max_tokens: 2048,
            temperature: 0.7,
            top_p: 0.9,
            repeat_penalty: 1.1,
            system_prompt: None,
            no_think: false,
        }
    }
}

/// A LlamaContext cached between inference calls to avoid re-allocating and
/// re-page-faulting the ~2 GB KV-cache + compute buffers on every request.
///
/// # Safety
/// `ctx` holds a `LlamaContext<'static>` transmuted from `LlamaContext<'model>`.
/// - `LlmEngine` owns both `ctx_cache` (first field) and `model` (second field).
/// - Struct fields are dropped in declaration order, so `ctx_cache` is always
///   dropped before `model`, maintaining the borrow invariant.
struct CachedCtx {
    ctx: LlamaContext<'static>,
    n_ctx: u32,
    /// All token IDs currently resident in the KV cache, in positional order:
    /// [prefill tokens] ++ [generated tokens from the last inference call].
    /// Used for incremental prefill: if the next prompt is a prefix-extension
    /// of this sequence, we skip re-decoding the common prefix entirely.
    filled_tokens: Vec<LlamaToken>,
}

// SAFETY: `LlamaContext` wraps `*mut llama_context`.  llama.cpp requires each
// context to be accessed from only one thread at a time, but it is safe to
// *move* a context between threads.  `LlmEngine` lives behind `Arc<Mutex<>>`,
// guaranteeing exclusive access before any method is called.
unsafe impl Send for CachedCtx {}

/// Wraps a loaded llama.cpp model and context for chat-completion inference.
pub struct LlmEngine {
    // NOTE: `ctx_cache` MUST be the first field so it is dropped before `model`.
    // Rust drops struct fields in declaration order.  The `LlamaContext` inside
    // `CachedCtx` borrows from `model`; dropping `model` first would be UB.
    ctx_cache: Option<CachedCtx>,
    /// The loaded model. We keep it alive as long as the engine lives.
    model: LlamaModel,
    /// Threads for autoregressive token *generation* (memory-bandwidth bound — 4–8 optimal).
    n_threads: u32,
    /// Threads for prompt *prefill* (compute bound — use all physical P-cores).
    n_threads_batch: u32,
    /// Context size (in tokens) for the model.
    n_ctx: u32,
    /// Total system RAM in GiB — captured once at load() and reused per-inference
    /// to avoid repeated sysinfo queries inside generate_stream().
    total_ram_gib: f32,
}

impl LlmEngine {
    /// Load a GGUF model from `model_path`.
    ///
    /// * `n_threads` — pass `0` to auto-detect via `CpuProfile` (recommended).
    /// * `n_ctx`     — context window in tokens; pass `0` to use the default (4096).
    ///
    /// This call blocks while the model weights are memory-mapped / loaded.
    pub fn load(model_path: &Path, n_threads: u32, n_ctx: u32) -> Result<Self> {
        // Detect CPU topology once and derive all thread counts from it.
        let profile = crate::cpu_profile::CpuProfile::detect();

        // Baseline from the caller (0 = auto-detect).
        let recommended = if n_threads == 0 {
            profile.recommended_threads
        } else {
            n_threads
        };

        // n_threads_batch (prefill / prompt-eval) — compute-bound for batch sizes > 64 tokens.
        // Unlike decode (DRAM-bound), prompt prefill is a batched matrix-multiply that scales
        // with physical P-cores. Use all P-cores up to 8 for maximum prefill throughput.
        // This is the main lever for reducing TTFT on cold starts and session resets.
        // Clamped to recommended as minimum so tiny 2-core machines don't get 1 thread.
        let n_threads_batch = profile.physical_p_cores.clamp(recommended, 8);


        info!(
            recommended,
            n_threads_batch,
            physical_p_cores = profile.physical_p_cores,
            physical_e_cores = profile.physical_e_cores,
            is_laptop = profile.is_laptop,
            reason = %profile.recommendation_reason,
            "Auto-detected thread counts"
        );

        let n_ctx = if n_ctx == 0 { 4096 } else { n_ctx };

        // n_threads (single-token autoregressive decode) — memory-bandwidth-bound.
        //
        // IMPORTANT: Do NOT use physical_p_cores here. The mem-bandwidth cap in
        // recommend_threads() (4 for laptops, 6 for desktops) is the empirically
        // correct ceiling for DRAM-bound token generation. Using more threads than
        // the bandwidth supports causes memory bus saturation and 6–10× TTFT
        // regression vs the raw llama.cpp CLI (which defaults to 4–6 threads).
        //
        // We use `recommended` directly — it already embeds the laptop/desktop
        // bandwidth cap and any LLAMA_THREADS env override.
        let n_threads = recommended;

        info!(
            path = %model_path.display(),
            n_threads,
            n_threads_batch,
            n_ctx,
            "Loading LLM model"
        );

        let backend = crate::llama_backend()?;

        let model_params = LlamaModelParams::default().with_n_gpu_layers(crate::GPU_LAYERS);

        let model = LlamaModel::load_from_file(&backend, model_path, &model_params)
            .with_context(|| format!("Failed to load model from {}", model_path.display()))?;

        info!("Model loaded successfully");
        Ok(Self {
            ctx_cache: None,
            model,
            n_threads,
            n_threads_batch,
            n_ctx,
            total_ram_gib: profile.total_ram_gib,
        })
    }

    /// Effective context window configured for this loaded engine.
    pub fn context_size(&self) -> u32 {
        self.n_ctx
    }

    /// Discard the cached LlamaContext (KV cache + compute buffers).
    ///
    /// Call this after warm-up inference.  The warm-up runs before WebView2 has
    /// fully allocated its ~900 MB, so `available_mb` is inflated and the warm-up
    /// context ends up with a much larger `n_ctx` than real inference calls need.
    /// Reusing that oversized context makes GGML's attention O(n_ctx^2) per token
    /// instead of O(correct_n_ctx^2) — 4–8× slower prefill.
    ///
    /// After this call the next `generate_stream` call creates a fresh context
    /// sized to the actual post-startup available RAM.
    pub fn discard_ctx_cache(&mut self) {
        self.ctx_cache = None;
    }

    /// Build a prompt using the chat template baked into the GGUF where possible,
    /// falling back to a known-good hardcoded template when the Jinja renderer
    /// cannot handle complex macros (e.g. Gemma-4's tool-calling template).
    ///
    /// `/no_think` is handled by the CALLER (chat.rs) — it appends the string
    /// directly to the system message content so that the system-message token
    /// sequence is bit-identical on every turn, enabling KV-cache prefix reuse.
    fn build_prompt(&self, messages: &[ChatMessage], params: &GenerationParams) -> Result<String> {
        // Assemble message list, optionally prepending a system override.
        let mut chat_messages: Vec<LlamaChatMessage> = Vec::new();

        if let Some(sys) = &params.system_prompt {
            // Legacy path: params.system_prompt is used when the caller sets
            // an explicit override (e.g. plan-stage calls). no_think not needed
            // here since the system content already contains /no_think via chat.rs.
            chat_messages.push(LlamaChatMessage::new("system".into(), sys.clone())?);
        }

        for msg in messages {
            if msg.role == "system" && params.system_prompt.is_some() {
                continue;
            }
            chat_messages.push(LlamaChatMessage::new(msg.role.clone(), msg.content.clone())?);
        }

        // Try the GGUF-embedded template first.
        if let Ok(tmpl) = self.model.chat_template(None) {
            if let Ok(prompt) = self.model.apply_chat_template(&tmpl, &chat_messages, true) {
                debug!("Used model's embedded Jinja chat template");
                return Ok(prompt);
            }
        }

        // Fallback: detect model family from vocab and apply the correct template.
        debug!("Embedded template failed; using hardcoded family fallback");
        Ok(self.build_fallback_prompt(messages, params))
    }

    /// Hardcoded fallback templates for known model families (kept for
    /// internal use by Gemma-4 path in build_prompt).
    #[allow(dead_code)]
    fn build_fallback_prompt(&self, messages: &[ChatMessage], params: &GenerationParams) -> String {
        // Determine family by checking for Gemma-specific token '<|turn>'.
        let gemma4_probe = self.model.str_to_token("<|turn>user", AddBos::Never);
        if gemma4_probe.map(|t| t.len() <= 3).unwrap_or(false) {
            return self.apply_gemma4_template(messages, params);
        }
        // Default: ChatML (Phi, Qwen, Mistral, LLaMA-3, etc.)
        self.apply_chatml_template(messages, params)
    }

    /// Gemma-4 template extracted from GGUF tokenizer.chat_template metadata:
    ///   Turn start: `<|turn>role\n`
    ///   Turn end:   `<turn|>\n`
    ///   Gen prompt: `<|turn>model\n`
    fn apply_gemma4_template(&self, messages: &[ChatMessage], params: &GenerationParams) -> String {
        let mut prompt = String::new();
        if let Some(sys) = &params.system_prompt {
            prompt.push_str("<|turn>system\n");
            prompt.push_str(sys.trim());
            prompt.push_str("<turn|>\n");
        }
        for msg in messages {
            if msg.role == "system" && params.system_prompt.is_some() { continue; }
            let role = if msg.role == "assistant" { "model" } else { &msg.role };
            prompt.push_str("<|turn>"); prompt.push_str(role); prompt.push('\n');
            prompt.push_str(msg.content.trim()); prompt.push_str("<turn|>\n");
        }
        prompt.push_str("<|turn>model\n");
        prompt
    }

    /// ChatML template (Phi, Qwen, Mistral, LLaMA etc.):
    ///   `<|im_start|>role\ncontent<|im_end|>\n`
    ///
    /// `/no_think` is NOT added to user messages here. It is the caller's
    /// responsibility to embed it in the system message content before calling
    /// build_prompt (see chat.rs). This keeps every user message token-stable
    /// across conversation turns for maximum KV-cache reuse.
    fn apply_chatml_template(&self, messages: &[ChatMessage], params: &GenerationParams) -> String {
        let mut prompt = String::new();
        if let Some(sys) = &params.system_prompt {
            // Only used by plan-stage calls that pass an explicit system override.
            let content = if params.no_think { format!("{sys}\n/no_think") } else { sys.clone() };
            prompt.push_str("<|im_start|>system\n");
            prompt.push_str(&content);
            prompt.push_str("<|im_end|>\n");
        }
        for msg in messages {
            if msg.role == "system" && params.system_prompt.is_some() { continue; }
            prompt.push_str("<|im_start|>");
            prompt.push_str(&msg.role);
            prompt.push('\n');
            prompt.push_str(&msg.content);
            prompt.push_str("<|im_end|>\n");
        }
        prompt.push_str("<|im_start|>assistant\n");
        prompt
    }

    /// Blocking (non-streaming) generation — collects all output tokens into a `String`.
    ///
    /// Internally calls [`generate_stream`], which is fully synchronous: all tokens
    /// are buffered in the unbounded channel before `generate_stream` returns.
    /// We then drain the buffer with `try_recv()` — no `.await` needed.
    ///
    /// Call this from a `block_in_place` context (same requirement as `generate_stream`).
    pub fn generate_text(
        &mut self,
        messages: &[ChatMessage],
        params: &GenerationParams,
    ) -> Result<String> {
        let (token_tx, mut token_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        // generate_stream is synchronous; every token is buffered before it returns.
        self.generate_stream(messages, params, token_tx, None)?;
        let mut result = String::new();
        loop {
            match token_rx.try_recv() {
                Ok(token) if token == "\x00" => break,
                Ok(token) => result.push_str(&token),
                Err(_) => break,
            }
        }
        Ok(result)
    }

    /// Run streaming inference.
    ///
    /// Each decoded token is sent as a `String` through `token_tx`.
    /// When generation finishes (or hits `params.max_tokens`), the sentinel
    /// string `"\x00"` (a single null byte) is sent to signal completion.
    ///
    /// If `cancel_flag` is set to `true` at any point during generation,
    /// inference stops immediately and the sentinel is sent.
    ///
    /// **Dynamic n_ctx**: the context window is sized at call time based on
    /// the machine's *current* available RAM (measured after the model is already
    /// loaded and WebView2 is running).  This means:
    ///   - High-RAM machines (32 GB) → full configured ceiling, best quality.
    ///   - Typical 8 GB student laptop (~2–3 GB free post-load) → 1024–1536.
    ///   - Budget 4 GB laptop (~1 GB free) → 768 minimum viable context.
    /// No artificial cap is applied — more RAM always means more context.
    pub fn generate_stream(
        &mut self,
        messages: &[ChatMessage],
        params: &GenerationParams,
        token_tx: UnboundedSender<String>,
        cancel_flag: Option<Arc<AtomicBool>>,
    ) -> Result<()> {
        let mut active_messages = messages.to_vec();

        // ── Dynamic context window ────────────────────────────────────────────
        // Sample available RAM *now* (model already loaded, WebView2 running).
        // This gives the real post-load headroom and lets us allocate exactly
        // as much KV-cache as the machine can comfortably hold.
        //
        // NOTE: We do NOT call CpuProfile::detect() here — it invokes sysinfo
        // and queries the OS on every inference request (expensive). total_ram_gib
        // is captured once at load() and stored in self; available_mb is a fast
        // GlobalMemoryStatusEx call via ModelManager (no sysinfo overhead).
        let available_mb = crate::model_manager::ModelManager::available_ram_mb();
        let ctx_profile = crate::cpu_profile::CpuProfile {
            model_name: String::new(),
            logical_cpus: 0,
            physical_p_cores: self.n_threads,
            physical_e_cores: 0,
            is_laptop: false,
            total_ram_gib: self.total_ram_gib,
            available_ram_gib: available_mb as f32 / 1024.0,
            recommended_threads: self.n_threads,
            recommendation_reason: String::new(),
        };
        let effective_n_ctx = compute_effective_n_ctx(self.n_ctx, available_mb, &ctx_profile);
        info!(
            available_mb,
            configured_ceiling = self.n_ctx,
            effective_n_ctx,
            n_threads = self.n_threads,
            n_threads_batch = self.n_threads_batch,
            "Dynamic n_ctx: adapted to current free RAM"
        );

        // ── Rolling Context Window ────────────────────────────────────────────
        // If the tokenised prompt size exceeds effective_n_ctx, we remove the oldest history turns.
        // We guarantee a minimum generation budget of 128 tokens.
        let mut prompt = self.build_prompt(&active_messages, params)?;
        let mut tokens = self.model.str_to_token(&prompt, AddBos::Always)
            .context("Failed to tokenise prompt")?;
        let mut prompt_token_count = tokens.len();

        let target_limit = effective_n_ctx.saturating_sub(128).max(512) as usize;
        while prompt_token_count >= target_limit && active_messages.len() > 2 {
            if active_messages.len() >= 4 {
                // Ensure we remove a complete turn (user and assistant pair)
                if active_messages[1].role == "user" && active_messages[2].role == "assistant" {
                    active_messages.remove(1); // Remove oldest user message
                    active_messages.remove(1); // Remove oldest assistant message
                } else if active_messages[1].role == "system" {
                    active_messages.remove(1);
                } else {
                    active_messages.remove(1);
                }
            } else {
                // Only 3 messages left: [system, oldest, new_user].
                active_messages.remove(1);
            }

            // Re-evaluate prompt and tokenized length
            prompt = self.build_prompt(&active_messages, params)?;
            tokens = self.model.str_to_token(&prompt, AddBos::Always)
                .context("Failed to tokenise prompt")?;
            prompt_token_count = tokens.len();
            info!(
                prompt_tokens = prompt_token_count,
                remaining_messages = active_messages.len(),
                "Rolling context: pruned older history turn to fit context window"
            );
        }
        debug!(prompt_len = prompt.len(), "Final built prompt via model's embedded chat template; prompt_tokens = {}", prompt_token_count);

        // ── Incremental KV-cache reuse ────────────────────────────────────────
        // Determine how many leading tokens of the new prompt are already
        // resident in the KV cache from the previous call.
        //
        //  • Perfect extension (start_pos == cached.filled_tokens.len()):
        //      The new prompt starts with every token that's already in the KV
        //      cache.  Only the new tail tokens need to be decoded — typically
        //      just the new user message (~20 tokens) → TTFT ≈ 2 s.
        //
        //  • Partial match (start_pos > 16):
        //      Common prefix found but KV cache has stale entries beyond it
        //      (e.g. session reset / mode switch).  Clear from the divergence
        //      point and re-prefill the remainder.
        //
        //  • No match (start_pos ≤ 16):
        //      Full KV clear + re-prefill from scratch (first call, cold start).
        //
        // NOTE: We deliberately ignore n_ctx drift between calls (WebView2 may
        // allocate a few hundred MB after streaming the first response, pushing
        // available_mb into a different 256-aligned bucket and changing
        // effective_n_ctx by 256 tokens).  We reuse the cached context whenever
        // the prompt fits inside it — wasting a bit of KV memory is far cheaper
        // than a full re-prefill on every turn.
        let start_pos: usize = if let Some(ref cached) = self.ctx_cache {
            if !cached.filled_tokens.is_empty() && prompt_token_count < cached.n_ctx as usize {
                let overlap = tokens
                    .iter()
                    .zip(cached.filled_tokens.iter())
                    .take_while(|(a, b)| a == b)
                    .count();
                info!(
                    overlap,
                    new_prompt_tokens = tokens.len(),
                    cached_tokens = cached.filled_tokens.len(),
                    "KV-cache prefix overlap"
                );
                overlap
            } else {
                info!(
                    filled_empty = cached.filled_tokens.is_empty(),
                    prompt_token_count,
                    cached_n_ctx = cached.n_ctx,
                    "KV-cache skipped (condition not met)"
                );
                0
            }
        } else {
            0
        };

        info!(
            available_mb,
            effective_n_ctx,
            prompt_token_count,
            start_pos,
            cached_n_ctx = self.ctx_cache.as_ref().map(|c| c.n_ctx).unwrap_or(0),
            cached_filled = self.ctx_cache.as_ref().map(|c| c.filled_tokens.len()).unwrap_or(0),
            "KV-cache decision"
        );

        let ctx_params = LlamaContextParams::default()
            .with_n_ctx(std::num::NonZeroU32::new(effective_n_ctx))
            .with_n_batch(effective_n_ctx.min(512))
            .with_n_ubatch(effective_n_ctx.min(512))
            .with_n_threads(self.n_threads as i32)
            .with_n_threads_batch(self.n_threads_batch as i32)
            // Flash Attention: AUTO lets llama.cpp enable it when the backend supports
            // it (all CPU backends on b9000+). Reduces prefill memory O(n²)→O(n) and
            // speeds up multi-turn TTFT by 20–40% for n_ctx ≥ 512.
            .with_flash_attention_policy(LLAMA_FLASH_ATTN_TYPE_AUTO);

        // ── Context cache ─────────────────────────────────────────────────────
        // Acquire the cached LlamaContext (or create a fresh one on first call),
        // clearing only the KV entries that are no longer valid.
        //
        // Reuse policy: keep the cached context as long as the new prompt fits
        // inside it (prompt_token_count < cached.n_ctx).  Do NOT require that
        // effective_n_ctx exactly matches — RAM fluctuations between calls can
        // change the computed effective_n_ctx by up to 256 tokens, which would
        // cause a spurious cache miss and a full re-prefill on every turn.
        let (mut ctx, actual_n_ctx, start_pos) = if let Some(cached) = self.ctx_cache.take() {
            let cached_n_ctx = cached.n_ctx;
            if prompt_token_count < cached_n_ctx as usize {
                // Context is large enough — reuse regardless of effective_n_ctx drift.
                let mut c = cached.ctx;
                let mut start_pos = start_pos;
                if start_pos == 0 {
                    // No usable prefix: full KV clear.
                    c.clear_kv_cache();
                } else if start_pos < cached.filled_tokens.len() {
                    // Partial match: clear stale KV entries beyond the overlap.
                    if let Ok(false) = c.clear_kv_cache_seq(Some(0), Some(start_pos as u32), None) {
                        // Recurrent models (Mamba/RNN) do not support partial sequence removal.
                        // We must fallback to a full KV clear.
                        c.clear_kv_cache();
                        start_pos = 0;
                    }
                }
                // Perfect extension (start_pos == cached.filled_tokens.len()):
                // nothing to clear — all cached entries are still valid.
                (c, cached_n_ctx, start_pos)
            } else {
                // Cached context too small for this prompt: drop and allocate fresh.
                drop(cached);
                let raw = self
                    .model
                    .new_context(crate::llama_backend()?, ctx_params)
                    .context("Failed to create llama context")?;
                // SAFETY: see CachedCtx declaration above.
                let ctx = unsafe { std::mem::transmute::<LlamaContext<'_>, LlamaContext<'static>>(raw) };
                (ctx, effective_n_ctx, 0)
            }
        } else {
            let raw = self
                .model
                .new_context(crate::llama_backend()?, ctx_params)
                .context("Failed to create llama context")?;
            // SAFETY: see CachedCtx declaration above.
            let ctx = unsafe { std::mem::transmute::<LlamaContext<'_>, LlamaContext<'static>>(raw) };
            (ctx, effective_n_ctx, 0)
        };

        if prompt_token_count >= actual_n_ctx as usize {
            anyhow::bail!(
                "Prompt ({} tokens) exceeds context window ({} tokens)",
                prompt_token_count,
                actual_n_ctx
            );
        }

        // Prefill: decode only the tokens not already in the KV cache.
        // tokens[0..start_pos] are already resident; only tokens[start_pos..] are new.
        let prefill_chunk_cap = effective_n_ctx.min(512) as usize;
        let mut batch = LlamaBatch::new(prefill_chunk_cap.max(1), 1);

        if start_pos < prompt_token_count {
            for chunk_start in (start_pos..prompt_token_count).step_by(prefill_chunk_cap.max(1)) {
                let chunk_end = (chunk_start + prefill_chunk_cap).min(prompt_token_count);
                batch.clear();

                for (offset, token) in tokens[chunk_start..chunk_end].iter().enumerate() {
                    let pos = (chunk_start + offset) as i32;
                    let is_last = (chunk_start + offset) == (prompt_token_count - 1);
                    batch.add(*token, pos, &[0], is_last)?;
                }

                ctx.decode(&mut batch)
                    .context("Failed to decode prompt batch")?;
            }
        } else {
            // All prompt tokens are already in the KV cache (exact match or over-cached).
            // Re-decode the last prompt token to ensure the context holds fresh logits
            // at position prompt_token_count-1, ready for the first generation step.
            batch.clear();
            batch.add(
                tokens[prompt_token_count - 1],
                (prompt_token_count - 1) as i32,
                &[0],
                true,
            )?;
            ctx.decode(&mut batch)
                .context("Failed to re-decode last cached prompt token")?;
        }

        // Build sampler chain: repetition penalty → temperature → top-p → greedy pick.
        // Build sampler chain. When no_think is active, prepend a logit-bias sampler
        // that sets P(<think>) = 0, preventing Qwen3 from ever starting a think block.
        // This is a sampling-level hard ban — more reliable than any prompt trick.
        let think_bias: Vec<LlamaLogitBias> = if params.no_think {
            #[allow(deprecated)]
            let toks = self.model.str_to_token("<think>", AddBos::Never).unwrap_or_default();
            toks.into_iter()
                .map(|t| LlamaLogitBias::new(t, f32::NEG_INFINITY))
                .collect()
        } else {
            vec![]
        };
        let n_vocab = self.model.n_vocab();
        let mut base_samplers: Vec<LlamaSampler> = Vec::new();
        if !think_bias.is_empty() {
            base_samplers.push(LlamaSampler::logit_bias(n_vocab, &think_bias));
        }
        base_samplers.extend([
            LlamaSampler::penalties(64, params.repeat_penalty, 0.0, 0.0),
            LlamaSampler::temp(params.temperature),
            LlamaSampler::top_p(params.top_p, 1),
            LlamaSampler::greedy(),
        ]);
        let mut sampler = LlamaSampler::chain_simple(base_samplers);

        // Clamp max_tokens so prompt + output can never exceed the KV-cache size.
        // If the prompt already fills almost the whole window, allow at least 64 tokens out.
        let available_for_output = (actual_n_ctx as usize).saturating_sub(prompt_token_count);
        let effective_max_tokens = (params.max_tokens as usize)
            .min(available_for_output.max(64)) as u32;
        if effective_max_tokens < params.max_tokens {
            debug!(
                prompt_tokens = prompt_token_count,
                n_ctx = actual_n_ctx,
                original_max = params.max_tokens,
                clamped_max = effective_max_tokens,
                "Clamped max_tokens to avoid KV-cache overflow"
            );
        }


        // Think tokens are streamed through to the frontend unchanged.
        // MessageBubble.svelte parses <think>...</think> and renders a collapsible
        // "⚡ Thinking..." panel — no buffering or filtering needed here.

        // Collect token IDs of every generated token so we can repopulate
        // filled_tokens for the next call's incremental-prefill comparison.
        let mut generated_tokens: Vec<LlamaToken> = Vec::new();

        // Generation loop.
        let mut n_generated: u32 = 0;
        let mut pos = prompt_token_count as i32;

        loop {
            if n_generated >= effective_max_tokens {
                debug!("Reached max_tokens limit");
                break;
            }

            // Hard guard: never decode past the KV-cache boundary.
            if pos >= actual_n_ctx as i32 {
                debug!("Context window full, stopping generation cleanly");
                break;
            }

            // Check cancel flag every 8 tokens to avoid busy-polling.
            if n_generated % 8 == 0 {
                if let Some(ref flag) = cancel_flag {
                    if flag.load(Ordering::SeqCst) {
                        debug!("Cancel flag set, stopping generation early");
                        break;
                    }
                }
            }

            // Sample the next token from the last logits position.
            let next_token = sampler.sample(&ctx, batch.n_tokens() - 1);

            // Check for end-of-sequence (EOS or any EOG-style special token).
            if next_token == self.model.token_eos() {
                debug!("EOS token reached");
                break;
            }

            // Convert token → UTF-8 text.
            // Use Special::Tokenize so special tokens (e.g. <|im_end|>) return their text
            // representation instead of an error. Then stop if a known stop-token was produced.
            #[allow(deprecated)]
            let token_bytes = match self.model.token_to_bytes(next_token, Special::Tokenize) {
                Ok(b) => b,
                Err(_) => {
                    // Unknown / unrepresentable token — treat as end of generation.
                    debug!("Unknown token type, stopping generation");
                    break;
                }
            };
            let text = String::from_utf8_lossy(&token_bytes).to_string();

            // Stop on model-specific end-of-turn markers.
            let is_stop = text.contains("<|im_end|>")
                || text.contains("<|end|>")
                || text.contains("<|endoftext|>")
                || text.contains("<end_of_turn>")
                || text.contains("<turn|>")      // Gemma-4 end-of-turn token
                || text.contains("<|eot_id|>");
            if is_stop {
                debug!("Stop token reached: {:?}", text);
                break;
            }

            if !text.is_empty() && token_tx.send(text).is_err() {
                warn!("Token receiver dropped, stopping generation");
                return Ok(());
            }

            sampler.accept(next_token);
            // Record this token ID for incremental KV-cache tracking.
            generated_tokens.push(next_token);

            // Prepare the next decode step with only the new token.
            batch.clear();
            batch.add(next_token, pos, &[0], true)?;
            ctx.decode(&mut batch).context("Failed to decode generated token")?;

            n_generated += 1;
            pos += 1;
        }

        // Build filled_tokens: all token IDs now resident in the KV cache
        // (prefill tokens + generated tokens).  The next call uses this to detect
        // whether its prompt is a prefix-extension and skip re-prefilling.
        let mut filled_tokens = tokens;
        filled_tokens.extend(generated_tokens);
        // Cache the context + KV contents for the next call.
        self.ctx_cache = Some(CachedCtx { ctx, n_ctx: actual_n_ctx, filled_tokens });

        // Signal completion to the receiver.
        let _ = token_tx.send("\x00".to_string());
        info!(n_generated, "Generation complete");
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Dynamic context sizing
// ---------------------------------------------------------------------------

/// Compute the effective context window based on *currently* available RAM.
///
/// Called at the start of every inference call (after model load + WebView2
/// startup), so it reflects the machine's real post-load headroom.
///
/// ### Behaviour
/// | Available RAM | Effective n_ctx            |
/// |---------------|----------------------------|
/// | ≥ 3 000 MB    | `ceiling` (full quality)   |
/// | 2 000–3 000   | 1024 → ceiling (linear)    |
/// | 1 200–2 000   | 768 → 1024 (linear)        |
/// | 600–1 200     | 768                        |
/// | < 600         | 512 (emergency floor)      |
///
/// Results are rounded down to the nearest 256-token boundary.
/// No artificial upper cap is applied — more RAM always means more context.
pub fn compute_effective_n_ctx(ceiling: u32, available_mb: u64, profile: &crate::cpu_profile::CpuProfile) -> u32 {
    let mut raw: f32 = ceiling as f32;

    // Hard ceiling based on TOTAL RAM for low-spec student laptops.
    // An 8GB laptop will struggle if we give it a 4096 context, even if 3GB happens to be free right now.
    let max_allowed_by_total_ram = if profile.total_ram_gib <= 8.5 {
        2048.0
    } else {
        ceiling as f32
    };
    raw = raw.min(max_allowed_by_total_ram);

    // Dynamic scaling based on AVAILABLE RAM.
    if available_mb >= 3000 {
        // Keep raw as-is
    } else if available_mb >= 2000 {
        let t = (available_mb - 2000) as f32 / 1000.0;
        raw = raw.min(1024.0 + (ceiling as f32 - 1024.0) * t);
    } else if available_mb >= 1200 {
        let t = (available_mb - 1200) as f32 / 800.0;
        raw = raw.min(768.0 + 256.0 * t);
    } else if available_mb >= 600 {
        raw = raw.min(768.0);
    } else {
        raw = raw.min(512.0);
    }

    let raw_u32 = raw as u32;
    // Round down to nearest 256-token boundary; clamp to [512, ceiling].
    let aligned = (raw_u32 / 256) * 256;
    aligned.max(512).min(ceiling)
}
