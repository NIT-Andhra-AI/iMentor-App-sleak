<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { writable } from "svelte/store";
  import { spawnAgent, agentMessage, listAgents } from "../lib/tauri";
  import type { AgentInfo } from "../lib/tauri";

  export let embedded = false;
  const dispatch = createEventDispatcher<{ openAgents: void }>();

  interface Msg { id: string; role: "user"|"assistant"; content: string; streaming?: boolean; }
  let agents: AgentInfo[] = [];
  let activeAgentId: string | null = null;
  let agentMessages: Record<string, Msg[]> = {};
  let input = "";
  let generating = false;
  let messagesEnd: HTMLDivElement;

  onMount(() => {
    listAgents().then((a) => (agents = a)).catch(console.error);
  });

  async function handleSpawn(type: "dev" | "test") {
    const id = await spawnAgent(type);
    agents = await listAgents();
    activeAgentId = id;
    if (!embedded) dispatch("openAgents");
  }

  async function handleSend() {
    if (!input.trim() || !activeAgentId || generating) return;
    const msg = input.trim();
    input = "";
    const uid = crypto.randomUUID();
    agentMessages[activeAgentId] = [...(agentMessages[activeAgentId] ?? []),
      { id: uid, role: "user", content: msg }];
    const aid = crypto.randomUUID();
    agentMessages[activeAgentId] = [...agentMessages[activeAgentId],
      { id: aid, role: "assistant", content: "", streaming: true }];
    agentMessages = { ...agentMessages };
    generating = true;
    try {
      await agentMessage(activeAgentId, msg,
        (token) => {
          agentMessages[activeAgentId!] = agentMessages[activeAgentId!].map((m) =>
            m.id === aid ? { ...m, content: m.content + token } : m
          );
          agentMessages = { ...agentMessages };
        },
        () => {
          agentMessages[activeAgentId!] = agentMessages[activeAgentId!].map((m) =>
            m.id === aid ? { ...m, streaming: false } : m
          );
          agentMessages = { ...agentMessages };
          generating = false;
        }
      );
    } catch {
      agentMessages[activeAgentId] = agentMessages[activeAgentId].map((m) =>
        m.id === aid ? { ...m, streaming: false } : m
      );
      agentMessages = { ...agentMessages };
      generating = false;
    }
  }

  $: activeMessages = activeAgentId ? (agentMessages[activeAgentId] ?? []) : [];
  $: activeAgent    = agents.find((a) => a.id === activeAgentId);
  $: if (messagesEnd) { setTimeout(() => messagesEnd?.scrollIntoView({ behavior:"smooth" }), 50); }
</script>

<div class="wrap">
  <div class="header">
    <p class="title">AI Agents</p>
    <div class="spawn-btns">
      <button on:click={() => handleSpawn("dev")}>⌨ Dev Agent</button>
      <button on:click={() => handleSpawn("test")}>⚗ Test Agent</button>
    </div>
  </div>

  {#if agents.length > 0}
    <div class="tabs">
      {#each agents as a (a.id)}
        <button class="tab" class:active={a.id === activeAgentId}
                on:click={() => (activeAgentId = a.id)}>
          🤖 {a.agent_type === "Dev" ? "Dev" : "Test"}
          <span class="dot" class:green={a.status === "Running"} />
        </button>
      {/each}
    </div>
  {/if}

  {#if activeAgent}
    <div class="messages">
      {#each activeMessages as m (m.id)}
        <div class="msg" class:user={m.role==="user"} class:ai={m.role==="assistant"}>
          {m.content || (m.streaming ? "▋" : "")}
        </div>
      {/each}
      <div bind:this={messagesEnd} />
    </div>
    <div class="input-row">
      <input bind:value={input} placeholder="Message agent…"
             on:keydown={(e) => e.key === "Enter" && handleSend()} />
      <button class="send" disabled={!input.trim() || generating} on:click={handleSend}>▶</button>
    </div>
  {:else}
    <div class="empty">
      <p>🤖</p>
      <p>Spawn an agent to get started</p>
    </div>
  {/if}
</div>

<style>
  .wrap { display:flex; flex-direction:column; height:100%; }
  .header { padding:10px 12px; border-bottom:1px solid var(--border); }
  .title  { font-size:13px; font-weight:600; color:#d1d5db; margin-bottom:6px; }
  .spawn-btns { display:flex; gap:8px; }
  .spawn-btns button {
    font-size:11px; padding:5px 10px; background:var(--bg-hover);
    border:1px solid var(--border); border-radius:6px; color:#d1d5db;
    cursor:pointer; transition:background .15s;
  }
  .spawn-btns button:hover { background:var(--bg-active); }
  .tabs { display:flex; border-bottom:1px solid var(--border); overflow-x:auto; }
  .tab  {
    display:flex; align-items:center; gap:6px;
    padding:8px 12px; font-size:11px; background:none; border:none;
    border-right:1px solid var(--border); color:#6b7280; cursor:pointer; white-space:nowrap;
  }
  .tab.active { background:var(--bg-hover); color:#fff; }
  .dot { width:6px; height:6px; border-radius:50%; background:#4b5563; }
  .dot.green { background:#4ade80; }
  .messages { flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:6px; }
  .msg {
    max-width:90%; border-radius:10px; padding:8px 12px;
    font-size:12px; line-height:1.5;
  }
  .msg.user { background:var(--accent); color:#fff; align-self:flex-end; }
  .msg.ai   { background:#1a1b1e; border:1px solid var(--border); color:#d1d5db; align-self:flex-start; }
  .input-row {
    display:flex;
    gap:6px;
    padding:10px;
    border-top:1px solid var(--border);
    background:
      linear-gradient(180deg, rgba(255,255,255,.02) 0%, rgba(255,255,255,0) 52%),
      var(--bg-panel);
  }
  input {
    flex:1;
    background:var(--bg-hover);
    border:1px solid color-mix(in srgb, var(--border) 84%, rgba(99,102,241,.2));
    border-radius:8px;
    padding:8px 10px;
    font-size:12px;
    color:#e5e7eb;
    outline:none;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.03),
      0 6px 14px rgba(2,6,23,.12);
    transition:border-color 150ms, box-shadow 150ms;
  }
  input:focus {
    border-color:rgba(99,102,241,.45);
    box-shadow: 0 0 0 2px rgba(99,102,241,.08), 0 8px 16px rgba(2,6,23,.16);
  }
  .send {
    padding:8px 12px;
    background:var(--accent);
    color:#fff;
    border:1px solid rgba(99,102,241,.16);
    border-radius:8px;
    cursor:pointer;
    font-size:13px;
    box-shadow: 0 2px 10px rgba(99,102,241,.34);
    transition: background 150ms, transform 100ms, border-color 150ms;
  }
  .send:hover:not(:disabled) {
    background: var(--accent-h);
    transform: translateY(-1px);
    border-color: rgba(99,102,241,.3);
  }
  .send:disabled { opacity:.4; cursor:not-allowed; }
  .empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; text-align:center; }
  .empty p { font-size:12px; color:#6b7280; }
  .empty p:first-child { font-size:28px; }
</style>
