use serde::Deserialize;
use tauri::{ipc::Channel, State};

use agents::{AgentInfo, AgentType};
use inference::{ChatMessage, GenerationParams};

use crate::state::{AppState, TokenEvent};

// ── Request types ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SpawnAgentRequest {
    /// `"dev"` or `"test"` (extensible via the `agents` crate).
    pub agent_type: String,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Create a new agent of the requested type and return its UUID.
#[tauri::command]
pub async fn spawn_agent(
    request: SpawnAgentRequest,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let agent_type = match request.agent_type.as_str() {
        "dev" => AgentType::Dev,
        "test" => AgentType::Test,
        other => return Err(format!("Unknown agent type: {other}")),
    };

    let mut orch = state.orchestrator.lock().await;
    let id = orch.spawn_agent(agent_type);
    Ok(id)
}

/// Send a message to an existing agent and stream the reply token-by-token.
///
/// The agent's full conversation history is used as context so each call is
/// stateful within the agent's lifetime.
#[tauri::command]
pub async fn agent_message(
    agent_id: String,
    message: String,
    channel: Channel<TokenEvent>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // ── 1. Append user message to agent history, then read the full history. ──
    let history: Vec<(String, String)> = {
        let mut orch = state.orchestrator.lock().await;
        orch.add_message(&agent_id, "user", &message)
            .map_err(|e| e.to_string())?;
        orch.get_agent_messages(&agent_id)
            .ok_or_else(|| format!("Agent not found: {agent_id}"))?
    };

    // ── 2. Build the ChatMessage list that goes to the LLM. ───────────────────
    let messages: Vec<ChatMessage> = history
        .into_iter()
        .map(|(role, content)| ChatMessage { role, content })
        .collect();

    let params = GenerationParams {
        max_tokens: 1024,
        temperature: 0.7,
        top_p: 0.9,
        repeat_penalty: 1.1,
        system_prompt: None, // agents carry their own system message in history
        no_think: crate::build_config::LLM_NO_THINK,
    };

    // ── 3. Run inference (blocking) on a spawned task. ────────────────────────
    let (token_tx, mut token_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let llm_arc = state.llm.clone();

    tokio::task::spawn(async move {
        let mut llm_guard = llm_arc.lock().await;
        if let Some(llm) = llm_guard.as_mut() {
            tokio::task::block_in_place(|| {
                let _ = llm.generate_stream(&messages, &params, token_tx, None);
            });
        } else {
            let _ = token_tx.send("\x00".to_string());
        }
    });

    // ── 4. Forward tokens to the frontend. ───────────────────────────────────
    let mut full_response = String::new();

    while let Some(token) = token_rx.recv().await {
        if token == "\x00" {
            channel
                .send(TokenEvent {
                    token: String::new(),
                    done: true,
                })
                .ok();
            break;
        }
        full_response.push_str(&token);
        channel
            .send(TokenEvent {
                token,
                done: false,
            })
            .ok();
    }

    // ── 5. Persist the assistant's reply to the agent's history. ─────────────
    if !full_response.is_empty() {
        let mut orch = state.orchestrator.lock().await;
        orch.add_message(&agent_id, "assistant", &full_response)
            .ok();
    }

    Ok(())
}

/// List all currently live agents with their metadata.
#[tauri::command]
pub async fn list_agents(state: State<'_, AppState>) -> Result<Vec<AgentInfo>, String> {
    let orch = state.orchestrator.lock().await;
    Ok(orch.list_agents())
}

/// Terminate an agent and remove it from the orchestrator.
#[tauri::command]
pub async fn remove_agent(
    agent_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut orch = state.orchestrator.lock().await;
    orch.remove_agent(&agent_id).map_err(|e| e.to_string())
}
