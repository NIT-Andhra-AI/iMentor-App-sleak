use std::collections::HashMap;

use instant_distance::{Builder, HnswMap, Search};

use crate::chunker::Chunk;
use crate::retriever::ScoredChunk;

/// Newtype wrapper so we can implement `instant_distance::Point` for a Vec<f32>.
#[derive(Clone)]
struct Point(Vec<f32>);

impl instant_distance::Point for Point {
    fn distance(&self, other: &Self) -> f32 {
        // Cosine distance: 1 - cosine_similarity
        // Assumes embeddings are L2-normalised; dot product == cosine similarity.
        let dot: f32 = self.0.iter().zip(other.0.iter()).map(|(a, b)| a * b).sum();
        1.0 - dot.clamp(-1.0, 1.0)
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct RagIndex {
    /// chunk_id → Chunk metadata
    chunks: HashMap<String, Chunk>,
    /// Ordered list of (chunk_id, embedding) used to rebuild HNSW on load.
    embeddings: Vec<(String, Vec<f32>)>,
    /// The live HNSW map. Skipped during serde; rebuilt via `rebuild_hnsw`.
    #[serde(skip)]
    hnsw: Option<HnswMap<Point, String>>,
}

impl RagIndex {
    pub fn new() -> Self {
        Self {
            chunks: HashMap::new(),
            embeddings: Vec::new(),
            hnsw: None,
        }
    }

    /// Add chunks and their embeddings to the index, then rebuild HNSW.
    pub fn add_chunks(
        &mut self,
        chunks: Vec<Chunk>,
        embeddings: Vec<Vec<f32>>,
    ) -> anyhow::Result<()> {
        if chunks.len() != embeddings.len() {
            anyhow::bail!(
                "chunks ({}) and embeddings ({}) length mismatch",
                chunks.len(),
                embeddings.len()
            );
        }

        for (chunk, embedding) in chunks.into_iter().zip(embeddings.into_iter()) {
            let id = chunk.id.clone();
            self.chunks.insert(id.clone(), chunk);
            self.embeddings.push((id, embedding));
        }

        self.rebuild_hnsw();
        Ok(())
    }

    /// Search for the `top_k` nearest chunks to `query_embedding`.
    pub fn search(
        &self,
        query_embedding: &[f32],
        top_k: usize,
    ) -> anyhow::Result<Vec<ScoredChunk>> {
        // Return empty results when there is nothing indexed yet rather than
        // propagating an error that would abort the whole chat request.
        if self.embeddings.is_empty() {
            return Ok(Vec::new());
        }

        let hnsw = self
            .hnsw
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("HNSW index is not built; add chunks first"))?;

        let query_point = Point(query_embedding.to_vec());
        let mut search = Search::default();

        let results: Vec<_> = hnsw.search(&query_point, &mut search).collect();

        let mut scored: Vec<ScoredChunk> = results
            .into_iter()
            .take(top_k)
            .filter_map(|item| {
                let chunk_id: &str = item.value.as_str();
                let distance = item.distance;
                self.chunks.get(chunk_id).map(|chunk| ScoredChunk {
                    chunk: chunk.clone(),
                    score: 1.0 - distance, // convert distance back to similarity
                    doc_name: chunk.doc_id.clone(),
                })
            })
            .collect();

        // Sort descending by similarity score
        scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        Ok(scored)
    }

    /// Serialize the index to a file using bincode.
    pub fn save(&self, path: &std::path::Path) -> anyhow::Result<()> {
        let encoded = bincode::serialize(self)?;
        std::fs::write(path, encoded)?;
        Ok(())
    }

    /// Deserialize the index from a file and rebuild the HNSW structure.
    pub fn load(path: &std::path::Path) -> anyhow::Result<Self> {
        let bytes = std::fs::read(path)?;
        let mut index: Self = bincode::deserialize(&bytes)?;
        index.rebuild_hnsw();
        Ok(index)
    }

    pub fn chunk_count(&self) -> usize {
        self.chunks.len()
    }

    /// Remove all chunks that belong to `doc_id` from the index and rebuild HNSW.
    pub fn remove_doc(&mut self, doc_id: &str) {
        self.chunks.retain(|_, chunk| chunk.doc_id != doc_id);
        let live_ids: std::collections::HashSet<&str> =
            self.chunks.keys().map(String::as_str).collect();
        self.embeddings.retain(|(id, _)| live_ids.contains(id.as_str()));
        self.rebuild_hnsw();
    }

    /// Rebuild the HNSW map from stored embeddings.
    fn rebuild_hnsw(&mut self) {
        if self.embeddings.is_empty() {
            self.hnsw = None;
            return;
        }

        let points: Vec<Point> = self
            .embeddings
            .iter()
            .map(|(_, emb)| Point(emb.clone()))
            .collect();

        let values: Vec<String> = self
            .embeddings
            .iter()
            .map(|(id, _)| id.clone())
            .collect();

        let hnsw = Builder::default().build(points, values);
        self.hnsw = Some(hnsw);
    }
}

impl Default for RagIndex {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chunker::Chunk;
    use uuid::Uuid;

    fn make_chunk(doc_id: &str) -> Chunk {
        Chunk {
            id: Uuid::new_v4().to_string(),
            doc_id: doc_id.to_string(),
            text: "test chunk".to_string(),
            char_start: 0,
            char_end: 10,
            chunk_index: 0,
            page_number: Some(1),
        }
    }

    fn normalize(v: &[f32]) -> Vec<f32> {
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        v.iter().map(|x| x / norm).collect()
    }

    #[test]
    fn test_add_and_search() {
        let mut index = RagIndex::new();
        let chunk = make_chunk("doc1");
        let emb = normalize(&[1.0f32, 0.0, 0.0]);
        index.add_chunks(vec![chunk], vec![emb]).unwrap();

        let query = normalize(&[1.0f32, 0.0, 0.0]);
        let results = index.search(&query, 1).unwrap();
        assert_eq!(results.len(), 1);
        assert!((results[0].score - 1.0).abs() < 1e-5);
    }

    // ── RAG pipeline with realistic ML document chunks ────────────────────────

    /// Simulate embedding a keyword as a normalised unit vector in a dimension
    /// corresponding to the keyword's index (poor-man's bag-of-words mock).
    fn topic_embedding(topic_index: usize, total_topics: usize) -> Vec<f32> {
        let mut v = vec![0.0f32; total_topics];
        v[topic_index] = 1.0;
        v
    }

    fn make_ml_chunk(doc_id: &str, text: &str, index: usize) -> Chunk {
        Chunk {
            id: Uuid::new_v4().to_string(),
            doc_id: doc_id.to_string(),
            text: text.to_string(),
            char_start: index * 200,
            char_end: index * 200 + text.len(),
            chunk_index: index,
            page_number: Some(index + 1),
        }
    }

    #[test]
    fn test_rag_retrieves_relevant_ml_doc_chunk() {
        // Simulate 5 topic dimensions: [gradient_descent, backprop, cnn, nlp, reinforcement_learning]
        const DIMS: usize = 5;
        let mut index = RagIndex::new();

        let chunks = vec![
            make_ml_chunk("week1.pdf", "Gradient descent minimises the loss by computing parameter gradients.", 0),
            make_ml_chunk("week2.pdf", "Backpropagation applies the chain rule to propagate errors backwards through layers.", 1),
            make_ml_chunk("week3.pdf", "Convolutional neural networks use shared weights for image recognition tasks.", 2),
            make_ml_chunk("week4.pdf", "Recurrent networks and attention mechanisms are used in natural language processing.", 3),
            make_ml_chunk("week5.pdf", "Q-learning is a model-free reinforcement learning algorithm.", 4),
        ];

        let embeddings: Vec<Vec<f32>> = (0..DIMS).map(|i| topic_embedding(i, DIMS)).collect();
        index.add_chunks(chunks, embeddings).unwrap();

        // Query about gradient descent → should return week1.pdf
        let query_gradient = topic_embedding(0, DIMS);
        let results = index.search(&query_gradient, 1).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].chunk.text.contains("Gradient descent"), "Got: {}", results[0].chunk.text);
        assert_eq!(results[0].doc_name, "week1.pdf");
        assert!((results[0].score - 1.0).abs() < 1e-5, "Exact match should score ~1.0");

        // Query about NLP → should return week4.pdf
        let query_nlp = topic_embedding(3, DIMS);
        let results = index.search(&query_nlp, 1).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].chunk.text.contains("natural language"), "Got: {}", results[0].chunk.text);
        assert_eq!(results[0].doc_name, "week4.pdf");
    }

    #[test]
    fn test_rag_top_k_ordering() {
        // Three chunks, one highly relevant (score ~1.0), others less so
        const DIMS: usize = 3;
        let mut index = RagIndex::new();

        let chunks = vec![
            make_ml_chunk("a.pdf", "Neural network backpropagation", 0),
            make_ml_chunk("b.pdf", "Orthogonal topic about databases", 1),
            make_ml_chunk("c.pdf", "Slightly related: optimisation methods", 2),
        ];

        // a.pdf maps to dim 0, b.pdf to dim 1, c.pdf to dim 2
        let embeddings = vec![
            normalize(&[1.0, 0.0, 0.0]),
            normalize(&[0.0, 1.0, 0.0]),
            normalize(&[0.0, 0.0, 1.0]),
        ];

        index.add_chunks(chunks, embeddings).unwrap();

        // Query closely aligned to a.pdf
        let query = normalize(&[1.0, 0.0, 0.0]);
        let results = index.search(&query, 3).unwrap();

        assert_eq!(results.len(), 3);
        // a.pdf must be first (highest similarity)
        assert_eq!(results[0].doc_name, "a.pdf", "Closest doc should be first");
        // Results must be sorted descending by score
        assert!(results[0].score >= results[1].score);
        assert!(results[1].score >= results[2].score);
    }

    #[test]
    fn test_rag_empty_index_returns_empty() {
        let index = RagIndex::new();
        let query = normalize(&[1.0f32, 0.0, 0.0]);
        let result = index.search(&query, 5);
        assert!(result.is_ok(), "Searching empty index should succeed");
        assert!(result.unwrap().is_empty(), "Searching empty index should return empty results");
    }

    #[test]
    fn test_rag_chunk_count_tracking() {
        let mut index = RagIndex::new();
        assert_eq!(index.chunk_count(), 0);

        let chunks: Vec<Chunk> = (0..5).map(|i| make_ml_chunk("doc.pdf", "content", i)).collect();
        let embeddings: Vec<Vec<f32>> = (0..5).map(|i| normalize(&{
            let mut v = vec![0.0f32; 5]; v[i] = 1.0; v
        })).collect();

        index.add_chunks(chunks, embeddings).unwrap();
        assert_eq!(index.chunk_count(), 5);
    }

    #[test]
    fn test_rag_save_and_load() {
        const DIMS: usize = 3;
        let mut index = RagIndex::new();
        let chunks = vec![
            make_ml_chunk("notes.pdf", "Softmax converts logits to probabilities.", 0),
        ];
        let embeddings = vec![normalize(&[1.0, 0.0, 0.0])];
        index.add_chunks(chunks, embeddings).unwrap();

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("rag_index.bin");
        index.save(&path).unwrap();

        let loaded = RagIndex::load(&path).unwrap();
        assert_eq!(loaded.chunk_count(), 1);

        let query = normalize(&[1.0f32, 0.0, 0.0]);
        let results = loaded.search(&query, 1).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].chunk.text.contains("Softmax"));
    }
}
