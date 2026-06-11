/**
 * Shared helpers for Student AI Playwright tests.
 */

import { type Page, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Timeouts ────────────────────────────────────────────────────────────────
export const T = {
  ui: 5_000,
  firstToken: 30_000,   // mock responds in <200ms; real LLM ≤30s on first token
  response: 120_000,
  index: 30_000,         // mock indexes instantly
} as const;

// ── File fixtures ────────────────────────────────────────────────────────────

export const SAMPLE_PDF = path.resolve(__dirname, "..", "..", "RAG_test.pdf");
export const CS229_PDF = path.resolve(__dirname, "..", "..", "RAG_test.pdf");

// ── Browser-side Tauri mock ─────────────────────────────────────────────────

export async function installTauriMock(page: Page): Promise<void> {
  await page.addInitScript(
    ({ samplePdfPath, cs229PdfPath }) => {
      const w = window as any;
      if (w.__STUDENT_AI_TAURI_MOCK__) return;
      w.__STUDENT_AI_TAURI_MOCK__ = true;

      const callbacks = new Map<number, (msg: any) => void>();
      let nextCbId = 1;

      type Session = { id: string; title: string; mode: string; updated_at: string };
      type ChatMsg = { id: string; role: "user" | "assistant"; content: string; created_at: string };
      type Doc = {
        id: string;
        file_name: string;
        chunk_count: number;
        word_count: number;
        created_at: string;
        status: string;
        selected: boolean;
      };
      type Agent = {
        id: string;
        agent_type: "Dev" | "Test";
        status: "Idle" | "Running" | "Queued";
        message_count: number;
        created_at: string;
      };

      const nowIso = () => new Date().toISOString();
      const mkId = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`;

      const state: {
        sessions: Session[];
        messagesBySession: Record<string, ChatMsg[]>;
        docs: Doc[];
        agents: Agent[];
      } = {
        sessions: [],
        messagesBySession: {},
        docs: [],
        agents: [],
      };

      const sid = mkId("session");
      state.sessions = [{ id: sid, title: "New chat", mode: "general", updated_at: nowIso() }];
      state.messagesBySession[sid] = [];

      const courses = [
        {
          id: "machine-learning",
          title: "Machine Learning",
          description: "Core ML concepts",
          wiki_page_count: 5,
          version: "1.0.0",
          is_downloaded: false,
          removed: false,
        },
      ];

      const manifests: Record<string, any> = {
        "machine-learning": {
          id: "machine-learning",
          title: "Machine Learning",
          modules: [
            {
              id: "getting-started",
              title: "Getting Started",
              pages: [
                { slug: "overview", title: "Overview", type: "overview" },
                { slug: "gradient-descent-variants", title: "Gradient Descent Variants", type: "theory" },
              ],
            },
            {
              id: "generalization",
              title: "Generalization",
              pages: [
                { slug: "regularization-techniques", title: "Regularization Techniques", type: "theory" },
                { slug: "bias-variance-tradeoff", title: "Bias Variance Tradeoff", type: "theory" },
              ],
            },
            {
              id: "visual-learning",
              title: "Visual Learning",
              pages: [
                { slug: "learning-flow-diagram", title: "Learning Flow Diagram", type: "visualization" },
              ],
            },
          ],
        },
      };

      const pages: Record<string, Record<string, string>> = {
        "machine-learning": {
          index: "# Machine Learning\n\nStart with the Overview page.",
          overview:
            "# Overview\n\nMachine learning studies algorithms that learn from data. " +
            "This page introduces core ideas like supervised learning and optimization.",
          "gradient-descent-variants":
            "# Gradient Descent Variants\n\nGradient descent minimizes loss by following the negative gradient. " +
            "Variants include batch, stochastic, and mini-batch gradient descent.\n\n" +
            "| Variant | Samples per Update | Speed |\n|---|---|---|\n| Batch GD | All | Slow |\n| SGD | One | Fast |\n| Mini-Batch | Small batch | Balanced |",
          "regularization-techniques":
            "# Regularization Techniques\n\nRegularization (L1/L2/dropout) helps prevent overfitting.",
          "bias-variance-tradeoff": "# Bias Variance Tradeoff\n\nGood models balance bias and variance.",
          "learning-flow-diagram":
            "# Learning Flow Diagram\n\n```mermaid\ngraph TD\n  A[Data] --> B[Training]\n  B --> C[Model]\n  C --> D[Evaluation]\n```\n\nMermaid should render the learning flow chart.",
        },
      };

      function parseChannelId(v: unknown): number | null {
        if (v && typeof v === "object" && "id" in (v as Record<string, unknown>)) {
          const maybeId = (v as { id?: unknown }).id;
          if (typeof maybeId === "number") return maybeId;
          if (typeof maybeId === "string" && /^\d+$/.test(maybeId)) return Number(maybeId);
        }
        if (v && typeof v === "object" && typeof (v as { toJSON?: unknown }).toJSON === "function") {
          try {
            const j = (v as { toJSON: () => unknown }).toJSON();
            if (typeof j === "string") {
              const mObj = /^__CHANNEL__:(\d+)$/.exec(j);
              if (mObj) return Number(mObj[1]);
            }
          } catch {
            // no-op
          }
        }
        if (typeof v !== "string") return null;
        const m = /^__CHANNEL__:(\d+)$/.exec(v);
        return m ? Number(m[1]) : null;
      }

      function streamText(channelValue: unknown, text: string): void {
        const tokens = text.split(/(\s+)/).filter(Boolean);
        const ch = parseChannelId(channelValue);
        if (ch == null) return;
        const cb = callbacks.get(ch);
        if (!cb) return;
        tokens.forEach((tok, i) => {
          setTimeout(() => cb({ index: i, message: { token: tok, done: false } }), (i + 1) * 15);
        });
        setTimeout(() => {
          cb({ index: tokens.length, message: { token: "", done: true } });
          cb({ index: tokens.length + 1, end: true });
        }, (tokens.length + 2) * 15);
      }

      function replyFor(prompt: string, modeType: string): string {
        const p = prompt.toLowerCase();
        if (modeType === "user_docs") {
          const hasSelected = state.docs.some((d) => d.selected);
          if (!hasSelected) return "No selected documents found. Upload and select a document first.";
          if (p.includes("logistic")) {
            return "Logistic regression models classification probability with a sigmoid function.";
          }
          if (p.includes("em algorithm") || /\bem\b/.test(p)) {
            return "The EM algorithm alternates expectation and maximization steps for latent-variable models.";
          }
          if (p.includes("bias") && p.includes("variance")) {
            return "Bias-variance tradeoff balances underfitting (high bias) and overfitting (high variance).";
          }
          if (p.includes("regularization")) {
            return "The document says regularization prevents overfitting in neural networks.";
          }
          if (p.includes("table") || (p.includes("compare") && p.includes("method"))) {
            // Intentionally emits blank lines between rows — tests normalizeMarkdownTables fix
            return "Comparison from the document:\n\n| Method | Description |\n|---|---|\n\n| SGD | Single sample gradient updates |\n\n| Adam | Adaptive per-parameter learning rates |";
          }
          if (p.includes("formula") || p.includes("equation")) {
            return "The document states the update rule: $$\\theta_{t+1} = \\theta_t - \\eta \\nabla J(\\theta_t)$$";
          }
          if (p.includes("gradient")) {
            return "The document says gradient descent minimizes a loss function.";
          }
          return "From your document: gradient descent minimizes loss, and regularization prevents overfitting.";
        }
        if (p.includes("latex") || p.includes("update rule")) {
          return "Use $$\\theta_{t+1}=\\theta_t-\\eta\\nabla J(\\theta_t).$$";
        }
        if (p.includes("python") || p.includes("code block")) {
          return "```python\ndef step(theta, grad, lr):\n    return theta - lr * grad\n```";
        }
        if (p.includes("table") || (p.includes("compare") && p.includes("supervised"))) {
          // Intentionally emits blank lines between rows — tests normalizeMarkdownTables fix
          return "Comparison:\n\n| Aspect | Supervised | Unsupervised |\n|---|---|---|\n\n| Labels | Required | Not needed |\n\n| Goal | Predict outputs | Find structure |\n\n| Example | Classification | Clustering |";
        }
        if (p.includes("learning rate")) {
          return "Learning rate controls step size. Too large can diverge; too small can converge slowly.";
        }
        if (p.includes("gradient descent")) {
          return "Gradient descent is an optimization algorithm that iteratively minimizes a loss function.";
        }
        if (p.includes("supervised")) {
          return "Supervised learning trains on labeled examples to predict outputs for new inputs.";
        }
        if (modeType === "course") {
          return "This topic explains machine learning fundamentals and optimization behavior.";
        }
        return "Machine learning learns patterns from data to make predictions.";
      }

      function agentReply(kind: "Dev" | "Test", prompt: string): string {
        const p = prompt.toLowerCase();
        if (kind === "Dev") {
          if (p.includes("factorial")) return "def factorial(n): return 1 if n < 2 else n * factorial(n - 1)";
          if (p.includes("list comprehension")) {
            return "A list comprehension builds lists concisely, e.g. [x*x for x in nums if x % 2 == 0].";
          }
          if (p.includes("example of it") || p.includes("short example")) {
            return "Example: [x*x for x in nums if x % 2 == 0] is a Python list comprehension.";
          }
          return "Start with a simple implementation, then handle edge cases.";
        }
        if (p.includes("pytest") || p.includes("unit")) {
          return "Unit testing checks small pieces in isolation. Example: def test_add(): assert add(1,2) == 3";
        }
        return "Define expected behavior, then add assertions for edge cases.";
      }

      w.__TAURI_INTERNALS__ = {
        transformCallback(fn: (msg: any) => void) {
          const id = nextCbId++;
          callbacks.set(id, fn);
          return id;
        },
        unregisterCallback(id: number) {
          callbacks.delete(id);
        },
        async invoke(cmd: string, args: any) {
          switch (cmd) {
            case "get_consent_status":
              return { consent_given: true };
            case "get_model_status":
              return {
                llm_loaded: true,
                llm_exists: true,
                embedding_exists: true,
                available_ram_mb: 8192,
                vcredist_ok: true,
                gpu_enabled: false,
              };
            case "list_courses":
              return courses;
            case "get_course_manifest":
              return manifests[args.courseId] ?? null;
            case "get_wiki_page": {
              const byCourse = pages[args.courseId] ?? {};
              return byCourse[args.pageSlug] ?? byCourse.index ?? "# Missing page";
            }

            case "list_chat_sessions":
              return [...state.sessions].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
            case "create_chat_session": {
              const id = mkId("session");
              const row = { id, title: "New chat", mode: args?.request?.mode ?? "general", updated_at: nowIso() };
              state.sessions.unshift(row);
              state.messagesBySession[id] = [];
              return id;
            }
            case "rename_chat_session": {
              const id = args?.request?.session_id;
              const title = String(args?.request?.title ?? "New chat");
              state.sessions = state.sessions.map((s) => (s.id === id ? { ...s, title, updated_at: nowIso() } : s));
              return null;
            }
            case "delete_chat_session": {
              const id = args?.request?.session_id;
              state.sessions = state.sessions.filter((s) => s.id !== id);
              delete state.messagesBySession[id];
              return null;
            }
            case "get_session_messages": {
              const sidLocal = args.sessionId;
              const msgs = state.messagesBySession[sidLocal] ?? [];
              return msgs.map((m) => ({
                id: m.id,
                session_id: sidLocal,
                role: m.role,
                content: m.content,
                created_at: m.created_at,
                token_count: null,
                ttft_ms: null,
                source_refs: null,
              }));
            }
            case "chat_stream": {
              const request = args.request;
              const sessionId = String(request.session_id);
              const modeType = String(request.mode?.type ?? "general");
              const userText = String(request.message ?? "");
              const assistantText = replyFor(userText, modeType);
              if (!state.messagesBySession[sessionId]) state.messagesBySession[sessionId] = [];
              state.messagesBySession[sessionId].push({
                id: mkId("msg"),
                role: "user",
                content: userText,
                created_at: nowIso(),
              });
              state.messagesBySession[sessionId].push({
                id: mkId("msg"),
                role: "assistant",
                content: assistantText,
                created_at: nowIso(),
              });
              state.sessions = state.sessions.map((s) => (s.id === sessionId ? { ...s, updated_at: nowIso() } : s));
              streamText(args.channel, assistantText);
              return null;
            }
            case "cancel_generation":
              return null;

            case "list_documents":
              return state.docs;
            case "upload_document": {
              const name = String(args?.request?.file_name ?? "uploaded.pdf");
              const doc = {
                id: mkId("doc"),
                file_name: name,
                chunk_count: name.includes("1.pdf") ? 220 : 8,
                word_count: name.includes("1.pdf") ? 32000 : 120,
                created_at: nowIso(),
                status: "ready",
                selected: true,
              };
              state.docs.unshift(doc);
              return { doc_id: doc.id, chunk_count: doc.chunk_count, word_count: doc.word_count };
            }
            case "toggle_doc_selection": {
              const id = args.docId;
              state.docs = state.docs.map((d) => (d.id === id ? { ...d, selected: Boolean(args.selected) } : d));
              return null;
            }
            case "delete_document": {
              const id = args.docId;
              state.docs = state.docs.filter((d) => d.id !== id);
              return null;
            }

            case "spawn_agent": {
              const kind = String(args?.request?.agent_type ?? "dev") === "test" ? "Test" : "Dev";
              const id = mkId("agent");
              state.agents.push({ id, agent_type: kind, status: "Idle", message_count: 0, created_at: nowIso() });
              return id;
            }
            case "list_agents":
              return state.agents;
            case "remove_agent": {
              const id = args.agentId;
              state.agents = state.agents.filter((a) => a.id !== id);
              return null;
            }
            case "agent_message": {
              const aid = String(args.agentId);
              const msg = String(args.message ?? "");
              const agent = state.agents.find((a) => a.id === aid);
              if (!agent) throw new Error("Agent not found");
              agent.status = "Running";
              agent.message_count += 1;
              const reply = agentReply(agent.agent_type, msg);
              streamText(args.channel, reply);
              setTimeout(() => {
                agent.status = "Idle";
              }, 200);
              return null;
            }

            case "plugin:dialog|open":
              return cs229PdfPath || samplePdfPath;
            case "open_url":
              return null;
            case "get_setting":
              return null;
            case "set_setting":
              return null;
            default:
              throw new Error(`Mock invoke not implemented: ${cmd}`);
          }
        },
      };

      w.__TAURI__ = { core: { invoke: w.__TAURI_INTERNALS__.invoke } };
    },
    { samplePdfPath: SAMPLE_PDF, cs229PdfPath: CS229_PDF }
  );
}

// ── Setup / nav helpers ─────────────────────────────────────────────────────

export async function dismissModals(page: Page): Promise<void> {
  for (const label of [/I Agree/i, /Accept/i]) {
    const btn = page.getByRole("button", { name: label });
    if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(250);
      break;
    }
  }

  const skip = page.getByRole("button", { name: /Continue anyway/i });
  if (await skip.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(250);
  }

  const later = page.getByRole("button", { name: /Skip|Later|Close/i });
  if (await later.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await later.click();
  }
}

export type NavTab = "sessions" | "courses" | "documents" | "agents" | "settings";

export async function clickNav(page: Page, tab: NavTab): Promise<void> {
  await page.locator(`.nav-btn[title="${tab}"]`).click();
  await page.waitForTimeout(250);
}

export async function ensureSessionChatReady(page: Page): Promise<void> {
  await clickNav(page, "sessions");
  const input = page.locator(".input-area textarea");
  if (!(await input.isVisible().catch(() => false))) {
    const newBtn = page.getByRole("button", { name: /\+ New/i });
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
      await page.waitForTimeout(250);
    }
  }
  await input.waitFor({ state: "visible", timeout: T.ui });
}

// ── Main chat helpers ───────────────────────────────────────────────────────

export async function sendChatMessage(page: Page, text: string): Promise<void> {
  const ta = page.locator(".input-area textarea");
  await ta.waitFor({ state: "visible", timeout: T.ui });
  await ta.fill(text);
  await ta.press("Enter");
}

export async function waitForAiReply(page: Page, timeout = T.response): Promise<string> {
  const aiBubbles = page.locator(".bubble.ai");
  await aiBubbles.first().waitFor({ state: "visible", timeout: T.firstToken });

  let prev = "";
  await expect
    .poll(
      async () => {
        const n = await aiBubbles.count();
        if (n === 0) return "";
        const text = (await aiBubbles.nth(n - 1).innerText()).trim();
        const stable = text.length > 0 && text === prev;
        prev = text;
        return stable;
      },
      { timeout, intervals: [100, 200, 400, 800] }
    )
    .toBeTruthy();

  const count = await aiBubbles.count();
  // No artificial read-delay — timing is captured by metrics.ts for latency tests.
  return (await aiBubbles.nth(count - 1).innerText()).trim();
}

export function assertNoError(text: string): void {
  expect(text).not.toMatch(/⚠️ Error|IPC error|model not loaded|not implemented/i);
  expect(text.length).toBeGreaterThan(5);
}

// ── Floating chat helpers ───────────────────────────────────────────────────

export async function openFloatingChat(page: Page): Promise<void> {
  const fab = page.locator(".floating-btn, .fab-btn, button.open-btn").first();
  await fab.waitFor({ state: "visible", timeout: T.ui });
  await fab.click();
  await page.waitForTimeout(250);
}

export async function sendFloatingMessage(page: Page, text: string): Promise<void> {
  const ta = page.locator(".floating-chat textarea");
  await ta.waitFor({ state: "visible", timeout: T.ui });
  await ta.fill(text);
  await ta.press("Enter");
}

export async function waitForFloatingReply(page: Page, timeout = T.response): Promise<string> {
  await page.locator(".floating-chat .message .cursor").first().waitFor({ state: "visible", timeout: T.firstToken });
  await page.locator(".floating-chat .message .cursor").last().waitFor({ state: "detached", timeout });
  const msgs = page.locator(".floating-chat .message:not(.user) .message-bubble");
  const n = await msgs.count();
  return (await msgs.nth(n - 1).innerText()).trim();
}

// ── Agent helpers ───────────────────────────────────────────────────────────

export async function spawnAgent(page: Page, type: "dev" | "test"): Promise<void> {
  const btn = page.getByRole("button", { name: type === "dev" ? /Dev Agent/i : /Test Agent/i });
  await btn.waitFor({ state: "visible", timeout: T.ui });
  await btn.click();
  await page.waitForTimeout(400);
}

export async function sendAgentMessage(page: Page, text: string): Promise<void> {
  const input = page.locator(".input-row input");
  await input.waitFor({ state: "visible", timeout: T.ui });
  await input.fill(text);
  await input.press("Enter");
}

export async function waitForAgentReply(page: Page, timeout = T.response): Promise<string> {
  const aiMsgs = page.locator(".messages .msg.ai");
  await aiMsgs.first().waitFor({ state: "visible", timeout: T.firstToken });

  let prev = "";
  await expect
    .poll(
      async () => {
        const n = await aiMsgs.count();
        if (n === 0) return "";
        const text = (await aiMsgs.nth(n - 1).innerText()).replace(/▋/g, "").trim();
        const stable = text.length > 0 && text === prev;
        prev = text;
        return stable;
      },
      { timeout, intervals: [100, 200, 400, 800] }
    )
    .toBeTruthy();

  const n = await aiMsgs.count();
  return (await aiMsgs.nth(n - 1).innerText()).replace(/▋/g, "").trim();
}
