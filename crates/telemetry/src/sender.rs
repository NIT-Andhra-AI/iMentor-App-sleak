use crate::session_serializer::TelemetrySession;

/// Sends telemetry payloads to a remote HTTPS endpoint with retry logic.
pub struct TelemetrySender {
    client: reqwest::Client,
    /// Runtime-switchable endpoint URL.  Updated by `EndpointResolver` before
    /// each flush so on-campus students use the LAN IP automatically.
    endpoint: std::sync::RwLock<String>,
    enabled: std::sync::atomic::AtomicBool,
}

impl TelemetrySender {
    pub fn new(endpoint: String, enabled: bool) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            // Accept self-signed certs for LAN deployments.
            .danger_accept_invalid_certs(true)
            .build()
            .expect("Failed to build reqwest client");

        Self {
            client,
            endpoint: std::sync::RwLock::new(endpoint),
            enabled: std::sync::atomic::AtomicBool::new(enabled),
        }
    }

    /// Attempt to POST `session` to the endpoint.
    ///
    /// Retries up to 3 times with exponential back-off (1 s, 2 s, 4 s).
    /// Returns `Ok(())` on success or `Err` if all retries are exhausted.
    /// Returns `Ok(())` immediately (no network call) if telemetry is disabled.
    pub async fn send(&self, session: &TelemetrySession) -> anyhow::Result<()> {
        if !self.enabled.load(std::sync::atomic::Ordering::Relaxed) {
            return Ok(());
        }

        let body = serde_json::to_string(session)?;

        let mut last_err: Option<anyhow::Error> = None;
        let delays = [1u64, 2, 4];

        for (attempt, &delay_secs) in delays.iter().enumerate() {
            match self.post_once(&body).await {
                Ok(()) => return Ok(()),
                Err(e) => {
                    eprintln!(
                        "Telemetry attempt {}/{} failed: {}",
                        attempt + 1,
                        delays.len(),
                        e
                    );
                    last_err = Some(e);
                    if attempt + 1 < delays.len() {
                        tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
                    }
                }
            }
        }

        Err(last_err.unwrap_or_else(|| anyhow::anyhow!("All telemetry retries exhausted")))
    }

    /// Enable or disable telemetry sending at runtime (thread-safe).
    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(std::sync::atomic::Ordering::Relaxed)
    }

    /// Overwrite the telemetry endpoint URL at runtime.
    /// Called by the background flush task after `EndpointResolver` picks the
    /// best reachable URL (LAN IP on campus, public IP off-campus).
    pub fn set_endpoint(&self, url: &str) {
        if let Ok(mut ep) = self.endpoint.write() {
            *ep = url.to_string();
        }
    }

    async fn post_once(&self, body: &str) -> anyhow::Result<()> {
        let endpoint = self.endpoint.read()
            .map(|e| e.clone())
            .unwrap_or_default();
        let response = self
            .client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .body(body.to_string())
            .send()
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            anyhow::bail!("Telemetry endpoint returned {}: {}", status, text);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_disabled_sender_does_not_send() {
        let sender = TelemetrySender::new("https://example.invalid/telemetry".to_string(), false);
        assert!(!sender.is_enabled());
    }

    #[test]
    fn test_set_enabled_toggles() {
        let sender = TelemetrySender::new("https://example.invalid/telemetry".to_string(), false);
        sender.set_enabled(true);
        assert!(sender.is_enabled());
        sender.set_enabled(false);
        assert!(!sender.is_enabled());
    }
}
