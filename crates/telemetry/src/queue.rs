/// Offline queue for telemetry sessions.
///
/// Sessions are stored in a JSON file (`telemetry_pending.json`) inside the
/// app data directory. The queue is loaded into memory on construction and
/// flushed back to disk on every mutation, giving crash-safe persistence
/// without requiring a new database dependency.
///
/// Sending is done only when:
///   1. The user has given consent (`TelemetryQueue::consent_given`)
///   2. The `TelemetrySender` is enabled
///   3. The caller has confirmed the app is idle (not in active inference)
///   4. An internet connection is reachable (fast HEAD probe)

use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::sender::TelemetrySender;
use crate::session_serializer::TelemetrySession;

const QUEUE_FILE: &str = "telemetry_pending.json";

pub struct TelemetryQueue {
    queue_path: PathBuf,
    inner: Arc<Mutex<QueueInner>>,
}

struct QueueInner {
    pending: Vec<TelemetrySession>,
}

impl TelemetryQueue {
    /// Load the persisted queue from `app_data_dir/telemetry_pending.json`.
    /// If the file doesn't exist or is corrupt, starts with an empty queue.
    pub fn load(app_data_dir: &PathBuf) -> Self {
        let queue_path = app_data_dir.join(QUEUE_FILE);
        let pending: Vec<TelemetrySession> = if queue_path.exists() {
            std::fs::read_to_string(&queue_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        };
        Self {
            queue_path,
            inner: Arc::new(Mutex::new(QueueInner { pending })),
        }
    }

    /// Add a session to the queue and persist to disk immediately.
    pub async fn enqueue(&self, session: TelemetrySession) {
        let mut inner = self.inner.lock().await;
        inner.pending.push(session);
        self.save_to_disk(&inner.pending);
    }

    /// Return the number of sessions waiting to be sent.
    pub async fn pending_count(&self) -> usize {
        self.inner.lock().await.pending.len()
    }

    /// Discard all queued sessions (e.g. when user revokes consent).
    pub async fn clear(&self) {
        let mut inner = self.inner.lock().await;
        inner.pending.clear();
        self.save_to_disk(&inner.pending);
    }

    /// Try to send all pending sessions.
    ///
    /// The **caller** (background task in `lib.rs`) is responsible for:
    ///   - checking consent (`TelemetrySender::is_enabled()`)
    ///   - checking idle state (`is_inferring` flag)
    ///   - resolving the best endpoint via `EndpointResolver` and calling
    ///     `TelemetrySender::set_endpoint()` before invoking this method
    ///
    /// Sessions that fail to send are re-queued for the next attempt.
    pub async fn flush(&self, sender: &TelemetrySender) {
        let mut inner = self.inner.lock().await;
        if inner.pending.is_empty() {
            return;
        }

        let mut still_pending: Vec<TelemetrySession> = Vec::new();
        let sessions = std::mem::take(&mut inner.pending);

        for session in sessions {
            match sender.send(&session).await {
                Ok(()) => {
                    tracing::debug!("Telemetry session {} sent", session.session_id);
                }
                Err(e) => {
                    tracing::warn!("Failed to send telemetry session: {e}; re-queuing");
                    still_pending.push(session);
                }
            }
        }

        inner.pending = still_pending;
        self.save_to_disk(&inner.pending);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    fn save_to_disk(&self, sessions: &[TelemetrySession]) {
        let json = serde_json::to_string(sessions).unwrap_or_else(|_| "[]".to_string());
        let _ = std::fs::write(&self.queue_path, json);
    }
}
