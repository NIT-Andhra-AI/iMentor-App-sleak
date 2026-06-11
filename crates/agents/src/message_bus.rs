/// A message passed between agents or between the user and an agent.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AgentMessage {
    /// Unique message identifier (UUID).
    pub id: String,
    /// Sender: agent UUID or `"user"`.
    pub from: String,
    /// Recipient: agent UUID or `"broadcast"`.
    pub to: String,
    pub content: String,
    /// ISO 8601 UTC timestamp.
    pub timestamp: String,
}

impl AgentMessage {
    pub fn new(from: impl Into<String>, to: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            from: from.into(),
            to: to.into(),
            content: content.into(),
            timestamp: utc_now_iso(),
        }
    }
}

fn utc_now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Minimal ISO 8601 UTC representation without chrono
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400;
    // Approximate year/month/day from epoch days
    let (year, month, day) = epoch_days_to_ymd(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, h, m, s
    )
}

fn epoch_days_to_ymd(days: u64) -> (u64, u64, u64) {
    // Civil calendar calculation (Gregorian proleptic)
    let z = days + 719468;
    let era = z / 146097;
    let doe = z % 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_construction() {
        let msg = AgentMessage::new("user", "agent-123", "Hello!");
        assert_eq!(msg.from, "user");
        assert_eq!(msg.to, "agent-123");
        assert_eq!(msg.content, "Hello!");
        assert!(!msg.id.is_empty());
        assert!(msg.timestamp.contains('T'));
    }
}
