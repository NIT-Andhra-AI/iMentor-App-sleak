use std::collections::HashMap;

use uuid::Uuid;

/// The capability profile of an agent.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub enum AgentType {
    /// Software development assistant.
    Dev,
    /// Code review and testing expert.
    Test,
}

pub type AgentId = String;

/// Lifecycle state of an agent.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub enum AgentStatus {
    Idle,
    Running,
    Queued,
}

/// Public-facing summary of an agent (no conversation history).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AgentInfo {
    pub id: AgentId,
    pub agent_type: AgentType,
    pub status: AgentStatus,
    pub message_count: usize,
    /// ISO 8601 UTC creation timestamp.
    pub created_at: String,
}

/// Full internal state of an agent, including conversation history.
pub struct AgentState {
    pub info: AgentInfo,
    pub system_prompt: String,
    /// Ordered conversation history as (role, content) pairs.
    pub history: Vec<(String, String)>,
}

/// Manages a pool of named agents, at most one of which is "active" at a time.
///
/// Because the app targets 8 GB RAM machines, only one agent's LLM context
/// is loaded at a time. Inactive agents keep their conversation history in
/// memory but their model context is released (that responsibility belongs
/// to the inference layer; the orchestrator just tracks which agent is active).
pub struct AgentOrchestrator {
    agents: HashMap<AgentId, AgentState>,
    active_agent: Option<AgentId>,
}

impl AgentOrchestrator {
    pub fn new() -> Self {
        Self {
            agents: HashMap::new(),
            active_agent: None,
        }
    }

    /// Spawn a new agent of the given type. Returns the new agent's id.
    pub fn spawn_agent(&mut self, agent_type: AgentType) -> AgentId {
        let id = Uuid::new_v4().to_string();
        let system_prompt = Self::default_system_prompt(&agent_type);
        let info = AgentInfo {
            id: id.clone(),
            agent_type,
            status: AgentStatus::Idle,
            message_count: 0,
            created_at: utc_now_iso(),
        };
        let state = AgentState {
            info,
            system_prompt,
            history: Vec::new(),
        };
        self.agents.insert(id.clone(), state);
        id
    }

    /// Return the conversation history for an agent as (role, content) pairs.
    ///
    /// The system prompt is prepended as the first entry with role `"system"`.
    /// Returns `None` if the agent does not exist.
    pub fn get_agent_messages(&self, agent_id: &AgentId) -> Option<Vec<(String, String)>> {
        let state = self.agents.get(agent_id)?;
        let mut messages: Vec<(String, String)> =
            Vec::with_capacity(state.history.len() + 1);
        messages.push(("system".to_string(), state.system_prompt.clone()));
        messages.extend(state.history.iter().cloned());
        Some(messages)
    }

    /// Append a message to an agent's history and increment its message count.
    pub fn add_message(
        &mut self,
        agent_id: &AgentId,
        role: &str,
        content: &str,
    ) -> anyhow::Result<()> {
        let state = self
            .agents
            .get_mut(agent_id)
            .ok_or_else(|| anyhow::anyhow!("Agent not found: {}", agent_id))?;

        state.history.push((role.to_string(), content.to_string()));
        state.info.message_count += 1;
        Ok(())
    }

    /// Return a list of [`AgentInfo`] summaries for all agents, newest first.
    pub fn list_agents(&self) -> Vec<AgentInfo> {
        let mut infos: Vec<AgentInfo> = self.agents.values().map(|s| s.info.clone()).collect();
        infos.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        infos
    }

    /// Remove an agent from the pool.
    ///
    /// If the removed agent was the active agent, `active_agent` is cleared.
    pub fn remove_agent(&mut self, agent_id: &AgentId) -> anyhow::Result<()> {
        if self.agents.remove(agent_id).is_none() {
            anyhow::bail!("Agent not found: {}", agent_id);
        }
        if self.active_agent.as_deref() == Some(agent_id.as_str()) {
            self.active_agent = None;
        }
        Ok(())
    }

    /// Set the active agent (the one whose LLM context should be loaded).
    /// Pass `None` to unload all agent contexts.
    pub fn set_active(&mut self, agent_id: Option<AgentId>) {
        // Mark the previously active agent as Idle
        if let Some(prev) = &self.active_agent {
            if let Some(state) = self.agents.get_mut(prev) {
                state.info.status = AgentStatus::Idle;
            }
        }
        // Mark the new active agent as Running
        if let Some(ref id) = agent_id {
            if let Some(state) = self.agents.get_mut(id) {
                state.info.status = AgentStatus::Running;
            }
        }
        self.active_agent = agent_id;
    }

    /// Return the id of the currently active agent.
    pub fn active_agent(&self) -> Option<&AgentId> {
        self.active_agent.as_ref()
    }

    /// Generate the default system prompt for the given agent type.
    fn default_system_prompt(agent_type: &AgentType) -> String {
        match agent_type {
            AgentType::Dev => {
                "You are an expert software development assistant. \
                 You help students write clean, correct, and efficient code. \
                 When asked to implement something, provide complete, compilable code \
                 with clear explanations. Prefer idiomatic patterns for the language \
                 in use. Point out potential bugs and suggest improvements proactively."
                    .to_string()
            }
            AgentType::Test => {
                "You are a rigorous code reviewer and testing expert. \
                 Your role is to critically evaluate code for correctness, edge cases, \
                 security issues, and performance problems. \
                 Suggest comprehensive unit tests and integration tests. \
                 Use property-based thinking: enumerate boundary conditions and \
                 adversarial inputs. Be constructive but thorough."
                    .to_string()
            }
        }
    }
}

impl Default for AgentOrchestrator {
    fn default() -> Self {
        Self::new()
    }
}

fn utc_now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400;
    let (year, month, day) = epoch_days_to_ymd(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, h, m, s
    )
}

fn epoch_days_to_ymd(days: u64) -> (u64, u64, u64) {
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
    fn test_spawn_and_list() {
        let mut orch = AgentOrchestrator::new();
        let id1 = orch.spawn_agent(AgentType::Dev);
        let id2 = orch.spawn_agent(AgentType::Test);

        let agents = orch.list_agents();
        assert_eq!(agents.len(), 2);

        let ids: Vec<_> = agents.iter().map(|a| a.id.clone()).collect();
        assert!(ids.contains(&id1));
        assert!(ids.contains(&id2));
    }

    #[test]
    fn test_add_and_get_messages() {
        let mut orch = AgentOrchestrator::new();
        let id = orch.spawn_agent(AgentType::Dev);

        orch.add_message(&id, "user", "Write a hello world in Rust.")
            .unwrap();
        orch.add_message(&id, "assistant", "fn main() { println!(\"Hello, world!\"); }")
            .unwrap();

        let msgs = orch.get_agent_messages(&id).unwrap();
        // system prompt + 2 messages
        assert_eq!(msgs.len(), 3);
        assert_eq!(msgs[0].0, "system");
        assert_eq!(msgs[1].0, "user");
        assert_eq!(msgs[2].0, "assistant");
    }

    #[test]
    fn test_set_active_updates_status() {
        let mut orch = AgentOrchestrator::new();
        let id = orch.spawn_agent(AgentType::Dev);
        assert_eq!(orch.active_agent(), None);

        orch.set_active(Some(id.clone()));
        assert_eq!(orch.active_agent(), Some(&id));

        let agents = orch.list_agents();
        assert_eq!(agents[0].status, AgentStatus::Running);

        orch.set_active(None);
        assert_eq!(orch.active_agent(), None);
        let agents = orch.list_agents();
        assert_eq!(agents[0].status, AgentStatus::Idle);
    }

    #[test]
    fn test_remove_agent() {
        let mut orch = AgentOrchestrator::new();
        let id = orch.spawn_agent(AgentType::Test);
        orch.set_active(Some(id.clone()));

        orch.remove_agent(&id).unwrap();
        assert!(orch.list_agents().is_empty());
        assert_eq!(orch.active_agent(), None);
    }

    #[test]
    fn test_remove_nonexistent_agent() {
        let mut orch = AgentOrchestrator::new();
        let result = orch.remove_agent(&"no-such-id".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_dev_system_prompt() {
        let prompt = AgentOrchestrator::default_system_prompt(&AgentType::Dev);
        assert!(prompt.contains("software development"));
    }

    #[test]
    fn test_test_system_prompt() {
        let prompt = AgentOrchestrator::default_system_prompt(&AgentType::Test);
        assert!(prompt.contains("testing expert"));
    }
}
