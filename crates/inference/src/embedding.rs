use anyhow::{Context, Result};
use llama_cpp_2::{
    context::params::LlamaContextParams,
    llama_batch::LlamaBatch,
    model::{params::LlamaModelParams, AddBos, LlamaModel},
};
use std::path::Path;
use tracing::{debug, info};

/// Wraps a llama.cpp model/context pair configured for producing sentence embeddings.
///
/// The model should be a dedicated embedding model (e.g. BGE, nomic-embed-text)
/// loaded in GGUF format.  The context is created with `embeddings = true` so
/// that llama.cpp returns the pooled hidden-state vector instead of logits.
pub struct EmbeddingEngine {
    model: LlamaModel,
    n_threads: u32,
    /// Dimensionality of the embedding vectors produced by the loaded model.
    embedding_dim: usize,
}

impl EmbeddingEngine {
    /// Load an embedding model from `model_path`.
    ///
    /// `n_threads` controls how many CPU threads are used per batch.
    pub fn load(model_path: &Path, n_threads: u32) -> Result<Self> {
        info!(
            path = %model_path.display(),
            n_threads,
            "Loading embedding model"
        );

        let backend = crate::llama_backend()?;

        let model_params = LlamaModelParams::default()
            .with_n_gpu_layers(0);

        let model = LlamaModel::load_from_file(backend, model_path, &model_params)
            .with_context(|| {
                format!(
                    "Failed to load embedding model from {}",
                    model_path.display()
                )
            })?;

        let embedding_dim = model.n_embd() as usize;
        info!(embedding_dim, "Embedding model loaded");

        Ok(Self {
            model,
            n_threads,
            embedding_dim,
        })
    }

    /// Embed a single text string and return a unit-normalised vector.
    pub fn embed(&mut self, text: &str) -> Result<Vec<f32>> {
        let results = self.embed_batch(&[text])?;
        results
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("embed_batch returned empty results"))
    }

    /// Embed multiple texts, returning one normalised vector per input.
    ///
    /// A single llama.cpp context is created once and reused for every text
    /// (KV-cache cleared between calls), avoiding the per-text context
    /// allocation overhead that dominated earlier versions.
    pub fn embed_batch(&mut self, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }

        // BGE-small and similar embedding models have a 512-token context.
        const EMB_CTX: u32 = 512;

        let backend = crate::llama_backend()?;
        let ctx_params = LlamaContextParams::default()
            .with_n_ctx(std::num::NonZeroU32::new(EMB_CTX))
            .with_n_threads(self.n_threads as i32)
            .with_n_threads_batch(self.n_threads as i32)
            .with_embeddings(true);

        // Create one context for ALL texts — reuse by clearing KV cache between texts.
        let mut ctx = self
            .model
            .new_context(backend, ctx_params)
            .context("Failed to create embedding context")?;

        let mut results: Vec<Vec<f32>> = Vec::with_capacity(texts.len());

        for (seq_id, text) in texts.iter().enumerate() {
            // Clear KV-cache so the previous text's keys/values don't bleed through.
            ctx.clear_kv_cache();

            let mut tokens = self
                .model
                .str_to_token(text, AddBos::Always)
                .with_context(|| format!("Failed to tokenise text at index {seq_id}"))?;

            // Truncate to context limit (keep FIRST EMB_CTX tokens — the title and
            // introductory content are the most semantically dense for retrieval).
            let max_len = EMB_CTX as usize;
            if tokens.len() > max_len {
                tokens = tokens[..max_len].to_vec();
            }

            let seq_len = tokens.len();
            debug!(seq_id, seq_len, "Tokenised embedding text");

            let mut batch = LlamaBatch::new(max_len, 1);
            for (i, &token) in tokens.iter().enumerate() {
                let is_last = i == seq_len - 1;
                batch.add(token, i as i32, &[0], is_last)?;
            }

            ctx.decode(&mut batch).context("Failed to decode embedding batch")?;

            let raw: &[f32] = ctx
                .embeddings_seq_ith(0)
                .with_context(|| format!("Failed to retrieve embedding for seq {seq_id}"))?;

            debug!(seq_id, dim = raw.len(), "Retrieved raw embedding");
            results.push(normalise(raw));
        }

        Ok(results)
    }

    /// The number of dimensions in each embedding vector.
    pub fn embedding_dim(&self) -> usize {
        self.embedding_dim
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// L2-normalise a float slice to unit length.
///
/// If the vector is all-zeros (degenerate case), it is returned as-is to avoid
/// a division-by-zero.
fn normalise(v: &[f32]) -> Vec<f32> {
    let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm < f32::EPSILON {
        return v.to_vec();
    }
    v.iter().map(|x| x / norm).collect()
}

#[cfg(test)]
mod tests {
    use super::normalise;

    #[test]
    fn test_normalise_unit_vector() {
        let v = vec![3.0_f32, 4.0];
        let n = normalise(&v);
        let len: f32 = n.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((len - 1.0).abs() < 1e-6, "Expected unit length, got {len}");
    }

    #[test]
    fn test_normalise_zero_vector() {
        let v = vec![0.0_f32, 0.0, 0.0];
        let n = normalise(&v);
        assert_eq!(n, v, "Zero vector should be returned unchanged");
    }
}
