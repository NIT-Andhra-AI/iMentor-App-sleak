use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use inference::{LlmEngine, EmbeddingEngine, ModelManager};
use wiki::WikiEngine;
use rag::RagIndex;
use storage::SessionStore;
use telemetry::{EndpointResolver, TelemetrySender, TelemetryQueue};
use agents::AgentOrchestrator;
use crate::license::LicenseManager;

pub struct AppState {
    pub llm: Arc<Mutex<Option<LlmEngine>>>,
    pub embedder: Arc<Mutex<Option<EmbeddingEngine>>>,
    /// course_id -> WikiEngine
    pub wiki_engines: Arc<RwLock<std::collections::HashMap<String, WikiEngine>>>,
    pub rag_index: Arc<RwLock<RagIndex>>,
    pub session_store: Arc<Mutex<SessionStore>>,
    pub telemetry: Arc<TelemetrySender>,
    /// Offline queue — sessions buffered here, flushed by background task when
    /// the user is idle and has an internet connection.
    pub telemetry_queue: Arc<TelemetryQueue>,
    /// Races LAN IP vs public IP to find the reachable endpoint.
    /// Handles the campus NAT hairpin problem transparently.
    pub endpoint_resolver: Arc<EndpointResolver>,
    pub orchestrator: Arc<Mutex<AgentOrchestrator>>,
    pub model_manager: Arc<ModelManager>,
    /// Activity-based license: tracks install date + last poll, triggers
    /// auto-uninstall after max_install_days or inactivity_days of no polling.
    pub license_manager: Arc<Mutex<LicenseManager>>,
    pub app_data_dir: std::path::PathBuf,
    pub assets_dir: std::path::PathBuf,
    pub cancel_flag: Arc<std::sync::atomic::AtomicBool>,
    /// Set to `true` while `chat_stream` is running inference.
    /// The background telemetry flush checks this before sending.
    pub is_inferring: Arc<std::sync::atomic::AtomicBool>,
}

/// Token event sent to the frontend via a Tauri `Channel<TokenEvent>`.
#[derive(Clone, serde::Serialize)]
pub struct TokenEvent {
    pub token: String,
    pub done: bool,
}
