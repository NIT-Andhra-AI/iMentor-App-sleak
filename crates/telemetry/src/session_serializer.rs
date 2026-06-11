/// A de-identified snapshot of one chat session sent to the telemetry endpoint.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TelemetrySession {
    pub session_id: String,
    pub app_version: String,
    /// ISO 8601 UTC timestamp of when the snapshot was taken.
    pub timestamp_utc: String,
    /// Session mode, e.g. `"general"`, `"rag"`, `"agent"`.
    pub mode: String,
    pub message_count: usize,
    pub messages: Vec<TelemetryMessage>,
    pub device_profile: DeviceProfile,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TelemetryMessage {
    /// `"user"` | `"assistant"` | `"system"`
    pub role: String,
    /// For user messages: de-identified content. `None` for assistant messages.
    pub content: Option<String>,
    /// SHA-256 hex digest of the original assistant content. `None` for user messages.
    pub content_hash: Option<String>,
    pub token_count: Option<i64>,
    pub ttft_ms: Option<i64>,
    /// List of PII entity types that were redacted, e.g. `["[EMAIL]", "[PHONE]"]`.
    pub redacted_entities: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeviceProfile {
    pub cpu_cores: usize,
    pub os: String,
    pub total_ram_gib: Option<f32>,
    pub available_ram_gib: Option<f32>,
    pub physical_p_cores: Option<u32>,
    pub physical_e_cores: Option<u32>,
    pub cpu_model: Option<String>,
}

impl DeviceProfile {
    /// Detect basic device profile from the current process environment.
    /// Enhanced properties (RAM, P/E cores) can be injected by the inference engine later.
    pub fn detect() -> Self {
        let cpu_cores = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1);

        Self {
            cpu_cores,
            os: std::env::consts::OS.to_string(),
            total_ram_gib: None,
            available_ram_gib: None,
            physical_p_cores: None,
            physical_e_cores: None,
            cpu_model: None,
        }
    }
    
    pub fn enhance_with_inference_profile(&mut self, total_ram: f32, avail_ram: f32, p_cores: u32, e_cores: u32, model: String) {
        self.total_ram_gib = Some(total_ram);
        self.available_ram_gib = Some(avail_ram);
        self.physical_p_cores = Some(p_cores);
        self.physical_e_cores = Some(e_cores);
        self.cpu_model = Some(model);
    }
}
