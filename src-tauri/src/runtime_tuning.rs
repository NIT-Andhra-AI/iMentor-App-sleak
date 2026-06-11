/// Runtime tuning helpers that adapt memory-heavy LLM knobs to free RAM.
///
/// Compile-time defaults in `build_config.toml` remain the upper bound.
/// These helpers only scale down at runtime when free memory is low.

#[derive(Debug, Clone, Copy)]
pub struct RamSnapshot {
    pub total_mb: u64,
    pub available_mb: u64,
}

impl RamSnapshot {
    pub fn free_ratio(self) -> f32 {
        (self.available_mb as f32 / self.total_mb.max(1) as f32).clamp(0.0, 1.0)
    }
}

fn pressure_scale(snapshot: RamSnapshot) -> f32 {
    // Chrome-like memory-pressure scaling:
    // - below ~8% free RAM: severe pressure
    // - above ~40% free RAM: relaxed
    ((snapshot.free_ratio() - 0.08) / 0.32).clamp(0.0, 1.0)
}

pub fn context_char_budget_from_ram(snapshot: RamSnapshot, n_ctx: u32) -> usize {
    let tokens_for_context = ((n_ctx as f32) * 0.45).round().max(320.0);
    let chars_per_token = 3.6f32;
    let base_chars = tokens_for_context * chars_per_token;
    let scaled = base_chars * (0.45 + pressure_scale(snapshot) * 0.75);

    let mut budget = scaled.round() as usize;
    if snapshot.available_mb < 1536 {
        budget = budget.min(1000);
    }
    budget.clamp(700, 7000)
}

/// Soft character budget for retrieval context injection.
pub fn adaptive_rag_top_k_from_ram(configured_top_k: usize, snapshot: RamSnapshot) -> usize {
    if configured_top_k <= 1 {
        return configured_top_k.max(1);
    }

    let scale = pressure_scale(snapshot);
    let min_k = 1usize;
    let k = min_k as f32 + (configured_top_k - min_k) as f32 * scale;

    let mut out = k.round() as usize;
    // More aggressive: reduce to 1 chunk if RAM is tight
    if snapshot.available_mb < 1536 {
        out = 1;
    } else if snapshot.available_mb < 2048 {
        out = out.min(1);
    }
    out.clamp(1, configured_top_k)
}

/// Number of past user/assistant pairs to retain in prompt history based on RAM.
pub fn history_pairs_budget_from_ram(snapshot: RamSnapshot) -> usize {
    // Scale from 2 pairs at low RAM to 6 pairs at high RAM.
    let pairs = (2.0 + pressure_scale(snapshot) * 4.0).round() as usize;

    if snapshot.available_mb < 1024 {
        return 2;
    } else if snapshot.available_mb < 2048 {
        return pairs.min(3);
    }

    pairs.clamp(2, 6)
}

/// Maximum generated tokens for the current request, scaled to RAM pressure.
pub fn adaptive_max_tokens_from_ram(n_ctx: u32, snapshot: RamSnapshot) -> u32 {
    let scale = pressure_scale(snapshot);
    // Scale from 512 tokens at severe pressure to 2048 tokens at relaxed pressure.
    let ram_scaled = (512.0 + scale * 1536.0).round() as u32;
    // Allow up to 45% of the context for generation (rest is for prompt + history).
    let ctx_cap = ((n_ctx as f32) * 0.45).round() as u32;

    let mut out = ram_scaled.min(ctx_cap.max(512)).min(2048);
    if snapshot.available_mb < 1024 {
        out = out.min(512);
    } else if snapshot.available_mb < 2048 {
        out = out.min(1024);
    }
    out.max(512)
}

/// Truncate a context string to a char budget on valid UTF-8 boundaries.
pub fn truncate_context(context: String, max_chars: usize) -> String {
    if context.chars().count() <= max_chars {
        return context;
    }

    let truncated: String = context.chars().take(max_chars).collect();
    format!("{truncated}\n\n[Context trimmed for memory safety]")
}
