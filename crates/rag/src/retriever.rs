use crate::chunker::Chunk;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScoredChunk {
    pub chunk: Chunk,
    pub score: f32,
    pub doc_name: String,
}
