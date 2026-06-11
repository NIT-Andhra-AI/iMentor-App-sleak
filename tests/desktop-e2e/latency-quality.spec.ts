/**
 * latency-quality.spec.ts — Rigorous TTFT & Response Quality Benchmark
 *
 * This is the MASTER latency and quality test suite. It covers every major
 * feature path (chat, multi-turn, RAG, course floating chat, agents) and
 * records per-interaction TTFT + total response time + quality scores.
 *
 * Reports written to: test-results/latency-quality-report.{json,md}
 *
 * Quality rubric (0–100):
 *   30  Keyword coverage
 *   20  Length adequacy
 *   15  No error signals
 *   10  Structured output (code/table/math/list)
 *   10  Sentence completeness
 *   15  No hallucination / repetition
 */

import { test, expect } from "@playwright/test";
import {
  installTauriMock,
  dismissModals,
  ensureSessionChatReady,
  sendChatMessage,
  clickNav,
  openFloatingChat,
  sendFloatingMessage,
  sendAgentMessage,
  spawnAgent,
  T,
} from "./helpers.js";
import {
  timedChatReply,
  timedFloatingReply,
  timedAgentReply,
  scoreReply,
  metrics,
  buildEntry,
} from "./metrics.js";

// ── Suite constants ────────────────────────────────────────────────────────────

const SUITE_CHAT    = "general-chat";
const SUITE_RAG     = "rag-documents";
const SUITE_COURSE  = "course-chat";
const SUITE_AGENT   = "agents";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function uploadDoc(page: any) {
  await page.locator(".upload-icon-btn").click();
  await page.locator(".doc-chip").first().waitFor({ state: "visible", timeout: T.index });
}

async function openCoursePage(page: any) {
  await clickNav(page, "courses");
  const courseBtn = page.locator("button").filter({ hasText: /Machine Learning/i }).first();
  await courseBtn.waitFor({ state: "visible", timeout: T.ui });
  await courseBtn.click();
  await page.waitForTimeout(500);
  const firstModule = page.locator(".module-row").first();
  if (await firstModule.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await firstModule.click();
    await page.waitForTimeout(400);
  }
  const overviewBtn = page.locator("button").filter({ hasText: /Overview|Foundations/i }).first();
  await overviewBtn.click();
  await page.waitForTimeout(1_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL CHAT — TTFT & Quality
// ─────────────────────────────────────────────────────────────────────────────

test.describe("General Chat Latency & Quality", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await dismissModals(page);
    await ensureSessionChatReady(page);
  });

  test("TTFT: simple factual question — supervised learning", async ({ page }) => {
    const KEYWORDS = ["supervised", "label", "train", "predict"];
    const PROMPT = "Explain supervised learning in one concise sentence.";

    const result = await timedChatReply(page, () => sendChatMessage(page, PROMPT));
    const quality = scoreReply(result.text, KEYWORDS);

    metrics.record(buildEntry({ suite: SUITE_CHAT, test: "ttft-supervised-learning", result, quality, passed: quality.score >= 50 }));

    expect(result.ttft_ms).toBeLessThan(45_000);
    expect(result.text.length).toBeGreaterThan(20);
    expect(quality.score).toBeGreaterThanOrEqual(50);

    console.log(`[CHAT TTFT] supervised learning → TTFT=${result.ttft_ms}ms | Total=${result.total_ms}ms | Quality=${quality.score}/100`);
  });

  test("TTFT: gradient descent explanation", async ({ page }) => {
    const KEYWORDS = ["gradient", "loss", "minimize", "optimization"];
    const PROMPT = "What is gradient descent? Explain briefly.";

    const result = await timedChatReply(page, () => sendChatMessage(page, PROMPT));
    const quality = scoreReply(result.text, KEYWORDS);

    metrics.record(buildEntry({ suite: SUITE_CHAT, test: "ttft-gradient-descent", result, quality, passed: quality.score >= 50 }));

    expect(result.ttft_ms).toBeLessThan(45_000);
    expect(quality.score).toBeGreaterThanOrEqual(50);

    console.log(`[CHAT TTFT] gradient descent → TTFT=${result.ttft_ms}ms | Quality=${quality.score}/100`);
  });

  test("TTFT: learning rate explanation", async ({ page }) => {
    const KEYWORDS = ["learning rate", "step", "converge"];
    const PROMPT = "How does learning rate affect gradient descent?";

    const result = await timedChatReply(page, () => sendChatMessage(page, PROMPT));
    const quality = scoreReply(result.text, KEYWORDS);

    metrics.record(buildEntry({ suite: SUITE_CHAT, test: "ttft-learning-rate", result, quality, passed: quality.score >= 45 }));

    expect(result.ttft_ms).toBeLessThan(45_000);
    expect(quality.score).toBeGreaterThanOrEqual(45);

    console.log(`[CHAT TTFT] learning rate → TTFT=${result.ttft_ms}ms | Quality=${quality.score}/100`);
  });

  test("TTFT + Quality: code generation (Python function)", async ({ page }) => {
    const KEYWORDS = ["def", "return"];
    const PROMPT = "Show a Python code block for a simple gradient descent step function.";

    const result = await timedChatReply(page, () => sendChatMessage(page, PROMPT));
    const quality = scoreReply(result.text, KEYWORDS, { requireStructure: true });

    metrics.record(buildEntry({ suite: SUITE_CHAT, test: "ttft-code-generation", result, quality, passed: quality.score >= 55 }));

    expect(result.ttft_ms).toBeLessThan(45_000);
    expect(quality.score).toBeGreaterThanOrEqual(55);
    // Code should appear either as rendered block or raw ``` text
    const hasCode = result.text.includes("def ") || result.text.includes("return") || result.text.includes("```");
    expect(hasCode).toBeTruthy();

    console.log(`[CHAT TTFT] code generation → TTFT=${result.ttft_ms}ms | Quality=${quality.score}/100`);
  });

  test("TTFT + Quality: LaTeX / math rendering", async ({ page }) => {
    const KEYWORDS = ["theta", "gradient", "update"];
    const PROMPT = "Write the gradient descent update rule using LaTeX math notation.";

    const result = await timedChatReply(page, () => sendChatMessage(page, PROMPT));
    const quality = scoreReply(result.text, KEYWORDS, { requireStructure: true });

    metrics.record(buildEntry({ suite: SUITE_CHAT, test: "ttft-latex-math", result, quality, passed: quality.score >= 40 }));

    expect(result.ttft_ms).toBeLessThan(45_000);
    expect(result.text.length).toBeGreaterThan(10);
    // KaTeX should render — check DOM not just text
    const katexSpans = await page.locator(".bubble.ai .katex").count();
    const rawMath = result.text.includes("$$") || result.text.includes("\\[");
    if (rawMath || katexSpans > 0) {
      expect(katexSpans).toBeGreaterThan(0);
    }

    console.log(`[CHAT TTFT] LaTeX math → TTFT=${result.ttft_ms}ms | KaTeX spans=${katexSpans} | Quality=${quality.score}/100`);
  });

  test("TTFT + Quality: markdown table rendering", async ({ page }) => {
    const KEYWORDS = ["supervised", "unsupervised"];
    const PROMPT = "Compare supervised and unsupervised learning in a markdown table.";

    const result = await timedChatReply(page, () => sendChatMessage(page, PROMPT));
    const quality = scoreReply(result.text, KEYWORDS, { requireStructure: true });

    metrics.record(buildEntry({ suite: SUITE_CHAT, test: "ttft-markdown-table", result, quality, passed: quality.score >= 55 }));

    expect(result.ttft_ms).toBeLessThan(45_000);
    const tableCount = await page.locator(".bubble.ai table").count();
    expect(tableCount).toBeGreaterThan(0);

    console.log(`[CHAT TTFT] markdown table → TTFT=${result.ttft_ms}ms | HTML tables=${tableCount} | Quality=${quality.score}/100`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-TURN CHAT — Latency per turn
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Multi-Turn Chat Latency", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await dismissModals(page);
    await ensureSessionChatReady(page);
  });

  test("multi-turn: 3 turns — TTFT and quality recorded per turn", async ({ page }) => {
    const turns = [
      {
        prompt: "What is gradient descent?",
        keywords: ["gradient", "loss", "optim"],
        testId: "multi-turn-1",
      },
      {
        prompt: "How does the learning rate affect convergence?",
        keywords: ["learning rate", "step", "converge"],
        testId: "multi-turn-2",
      },
      {
        prompt: "What is a good starting learning rate value?",
        keywords: ["0.0", "learning", "rate", "start"],
        testId: "multi-turn-3",
      },
    ];

    for (const turn of turns) {
      const result = await timedChatReply(page, () => sendChatMessage(page, turn.prompt));
      const quality = scoreReply(result.text, turn.keywords);

      metrics.record(buildEntry({ suite: SUITE_CHAT, test: turn.testId, result, quality, passed: quality.score >= 45 }));

      expect(result.ttft_ms).toBeLessThan(45_000);
      expect(result.text.length).toBeGreaterThan(10);

      console.log(`[MULTI-TURN] ${turn.testId} → TTFT=${result.ttft_ms}ms | Total=${result.total_ms}ms | Quality=${quality.score}/100`);
    }
  });

  test("multi-turn: 5-turn conversation with increasing complexity", async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);

    const turns = [
      { prompt: "What is machine learning?",                    keywords: ["machine learning", "data", "pattern"] },
      { prompt: "What are the main types?",                     keywords: ["supervised", "unsupervised"] },
      { prompt: "Explain overfitting in one sentence.",         keywords: ["overfit", "train", "test"] },
      { prompt: "How does regularization help with it?",        keywords: ["regulariz", "overfit", "penalt"] },
      { prompt: "Give a Python snippet showing L2 regularization.", keywords: ["lambda", "weight", "norm"] },
    ];

    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const result = await timedChatReply(page, () => sendChatMessage(page, turn.prompt));
      const quality = scoreReply(result.text, turn.keywords);

      metrics.record(buildEntry({
        suite: SUITE_CHAT,
        test: `5-turn-seq-turn-${i + 1}`,
        result,
        quality,
        passed: quality.score >= 40,
      }));

      console.log(`[5-TURN] turn ${i + 1} → TTFT=${result.ttft_ms}ms | Quality=${quality.score}/100`);
      expect(result.ttft_ms).toBeLessThan(45_000);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RAG DOCUMENTS — Upload + Query Latency & Quality
// ─────────────────────────────────────────────────────────────────────────────

test.describe("RAG Document Latency & Quality", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await dismissModals(page);
    await page.locator(".input-area").waitFor({ state: "visible", timeout: T.ui });
  });

  test("RAG upload latency: time to index a document", async ({ page }) => {
    const t0 = performance.now();
    await page.locator(".upload-icon-btn").click();
    await page.locator(".doc-chip").first().waitFor({ state: "visible", timeout: T.index });
    const indexTime_ms = Math.round(performance.now() - t0);

    metrics.record({
      suite: SUITE_RAG,
      test: "upload-index-latency",
      timestamp: new Date().toISOString(),
      ttft_ms: indexTime_ms,
      total_ms: indexTime_ms,
      char_count: 0,
      word_count: 0,
      quality_score: indexTime_ms < 30_000 ? 100 : 50,
      quality_notes: [`Index time: ${indexTime_ms}ms`, indexTime_ms < 30_000 ? "✅ Fast indexing" : "⚠️ Slow indexing"],
      text_snippet: "",
      passed: indexTime_ms < T.index,
    });

    expect(indexTime_ms).toBeLessThan(T.index);
    console.log(`[RAG] Document index time: ${indexTime_ms}ms`);
  });

  test("RAG TTFT: gradient descent query from uploaded document", async ({ page }) => {
    await uploadDoc(page);
    const KEYWORDS = ["gradient", "descent", "minimize", "loss", "document"];
    const PROMPT = "What does the document say about gradient descent?";

    const result = await timedChatReply(page, () => sendChatMessage(page, PROMPT));
    const quality = scoreReply(result.text, KEYWORDS);

    metrics.record(buildEntry({ suite: SUITE_RAG, test: "ttft-rag-gradient-descent", result, quality, passed: quality.score >= 50 }));

    expect(result.ttft_ms).toBeLessThan(45_000);
    expect(result.text.length).toBeGreaterThan(15);
    expect(quality.score).toBeGreaterThanOrEqual(50);

    console.log(`[RAG TTFT] gradient descent → TTFT=${result.ttft_ms}ms | Quality=${quality.score}/100`);
  });

  test("RAG TTFT: regularization query from uploaded document", async ({ page }) => {
    await uploadDoc(page);
    const KEYWORDS = ["regulariz", "overfit", "neural", "machine learning"];
    const PROMPT = "What does my document say about regularization?";

    const result = await timedChatReply(page, () => sendChatMessage(page, PROMPT));
    const quality = scoreReply(result.text, KEYWORDS);

    metrics.record(buildEntry({ suite: SUITE_RAG, test: "ttft-rag-regularization", result, quality, passed: quality.score >= 45 }));

    expect(result.ttft_ms).toBeLessThan(45_000);
    expect(quality.score).toBeGreaterThanOrEqual(45);

    console.log(`[RAG TTFT] regularization → TTFT=${result.ttft_ms}ms | Quality=${quality.score}/100`);
  });

  test("RAG TTFT + Quality: logistic regression query", async ({ page }) => {
    await uploadDoc(page);
    const KEYWORDS = ["logistic", "classification", "sigmoid", "probability"];
    const PROMPT = "Explain what the document says about logistic regression.";

    const result = await timedChatReply(page, () => sendChatMessage(page, PROMPT));
    const quality = scoreReply(result.text, KEYWORDS);

    metrics.record(buildEntry({ suite: SUITE_RAG, test: "ttft-rag-logistic-regression", result, quality, passed: quality.score >= 45 }));

    expect(result.ttft_ms).toBeLessThan(45_000);
    console.log(`[RAG TTFT] logistic regression → TTFT=${result.ttft_ms}ms | Quality=${quality.score}/100`);
  });

  test("RAG TTFT + Structure: table rendered from RAG answer", async ({ page }) => {
    await uploadDoc(page);
    const KEYWORDS = ["method", "description", "comparison"];
    const PROMPT = "Compare gradient descent methods in a table based on the document.";

    const result = await timedChatReply(page, () => sendChatMessage(page, PROMPT));
    const quality = scoreReply(result.text, KEYWORDS, { requireStructure: true });

    metrics.record(buildEntry({ suite: SUITE_RAG, test: "ttft-rag-table-render", result, quality, passed: quality.score >= 40 }));

    expect(result.ttft_ms).toBeLessThan(45_000);
    const tableCount = await page.locator(".bubble.ai table").count();
    expect(tableCount).toBeGreaterThan(0);

    console.log(`[RAG TTFT] table rendering → TTFT=${result.ttft_ms}ms | HTML tables=${tableCount} | Quality=${quality.score}/100`);
  });

  test("RAG multi-turn: two sequential RAG queries", async ({ page }) => {
    await uploadDoc(page);

    const turn1 = await timedChatReply(page, () => sendChatMessage(page, "What is mentioned about regularization?"));
    const q1 = scoreReply(turn1.text, ["regulariz", "overfit"]);
    metrics.record(buildEntry({ suite: SUITE_RAG, test: "rag-multi-turn-1", result: turn1, quality: q1, passed: q1.score >= 40 }));

    const turn2 = await timedChatReply(page, () => sendChatMessage(page, "What about the EM algorithm in the document?"));
    const q2 = scoreReply(turn2.text, ["em", "expectation", "maximization", "latent"]);
    metrics.record(buildEntry({ suite: SUITE_RAG, test: "rag-multi-turn-2", result: turn2, quality: q2, passed: q2.score >= 30 }));

    console.log(`[RAG MULTI-TURN] Turn1: TTFT=${turn1.ttft_ms}ms Q=${q1.score}/100 | Turn2: TTFT=${turn2.ttft_ms}ms Q=${q2.score}/100`);
    expect(turn1.ttft_ms).toBeLessThan(45_000);
    expect(turn2.ttft_ms).toBeLessThan(45_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COURSE FLOATING CHAT — Latency & Quality
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Course Floating Chat Latency & Quality", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await dismissModals(page);
    await openCoursePage(page);
    await openFloatingChat(page);
  });

  test("Course TTFT: topic summary question", async ({ page }) => {
    const KEYWORDS = ["machine learning", "optimization", "fundamentals"];
    const PROMPT = "Summarize what this page covers in one sentence.";

    const result = await timedFloatingReply(page, () => sendFloatingMessage(page, PROMPT));
    const quality = scoreReply(result.text, KEYWORDS);

    metrics.record(buildEntry({ suite: SUITE_COURSE, test: "ttft-course-summary", result, quality, passed: quality.score >= 40 }));

    expect(result.ttft_ms).toBeLessThan(45_000);
    expect(result.text.length).toBeGreaterThan(10);

    console.log(`[COURSE TTFT] summary → TTFT=${result.ttft_ms}ms | Quality=${quality.score}/100`);
  });

  test("Course TTFT: gradient descent question on page", async ({ page }) => {
    const KEYWORDS = ["gradient", "descent", "optimization"];
    const PROMPT = "What is gradient descent and how does it work?";

    const result = await timedFloatingReply(page, () => sendFloatingMessage(page, PROMPT));
    const quality = scoreReply(result.text, KEYWORDS);

    metrics.record(buildEntry({ suite: SUITE_COURSE, test: "ttft-course-gradient", result, quality, passed: quality.score >= 45 }));

    expect(result.ttft_ms).toBeLessThan(45_000);
    expect(quality.score).toBeGreaterThanOrEqual(45);

    console.log(`[COURSE TTFT] gradient → TTFT=${result.ttft_ms}ms | Quality=${quality.score}/100`);
  });

  test("Course multi-turn: two follow-up questions", async ({ page }) => {
    const turn1 = await timedFloatingReply(page, () => sendFloatingMessage(page, "What is gradient descent?"));
    const q1 = scoreReply(turn1.text, ["gradient", "loss", "optim"]);
    metrics.record(buildEntry({ suite: SUITE_COURSE, test: "course-multi-turn-1", result: turn1, quality: q1, passed: q1.score >= 40 }));

    const turn2 = await timedFloatingReply(page, () => sendFloatingMessage(page, "How does learning rate affect convergence?"));
    const q2 = scoreReply(turn2.text, ["learning rate", "converge", "step"]);
    metrics.record(buildEntry({ suite: SUITE_COURSE, test: "course-multi-turn-2", result: turn2, quality: q2, passed: q2.score >= 40 }));

    console.log(`[COURSE MULTI-TURN] T1: TTFT=${turn1.ttft_ms}ms Q=${q1.score}/100 | T2: TTFT=${turn2.ttft_ms}ms Q=${q2.score}/100`);
    expect(turn1.ttft_ms).toBeLessThan(45_000);
    expect(turn2.ttft_ms).toBeLessThan(45_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AGENTS — Latency & Quality
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Agent Chat Latency & Quality", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await dismissModals(page);
    await clickNav(page, "agents");
  });

  test("Dev Agent TTFT: factorial function", async ({ page }) => {
    await spawnAgent(page, "dev");
    const KEYWORDS = ["def", "factorial", "return"];
    const PROMPT = "Write a one-line Python function to compute factorial.";

    const result = await timedAgentReply(page, () => sendAgentMessage(page, PROMPT));
    const quality = scoreReply(result.text, KEYWORDS, { requireStructure: true });

    metrics.record(buildEntry({ suite: SUITE_AGENT, test: "dev-agent-ttft-factorial", result, quality, passed: quality.score >= 55 }));

    expect(result.ttft_ms).toBeLessThan(45_000);
    expect(quality.score).toBeGreaterThanOrEqual(55);

    console.log(`[AGENT TTFT] Dev factorial → TTFT=${result.ttft_ms}ms | Quality=${quality.score}/100`);
  });

  test("Test Agent TTFT: pytest unit test", async ({ page }) => {
    await spawnAgent(page, "test");
    const KEYWORDS = ["test", "assert", "pytest", "unit"];
    const PROMPT = "What is unit testing and give one pytest example?";

    const result = await timedAgentReply(page, () => sendAgentMessage(page, PROMPT));
    const quality = scoreReply(result.text, KEYWORDS);

    metrics.record(buildEntry({ suite: SUITE_AGENT, test: "test-agent-ttft-pytest", result, quality, passed: quality.score >= 50 }));

    expect(result.ttft_ms).toBeLessThan(45_000);
    expect(quality.score).toBeGreaterThanOrEqual(50);

    console.log(`[AGENT TTFT] Test agent pytest → TTFT=${result.ttft_ms}ms | Quality=${quality.score}/100`);
  });

  test("Dev Agent multi-turn: list comprehension follow-up", async ({ page }) => {
    await spawnAgent(page, "dev");

    const turn1 = await timedAgentReply(page, () => sendAgentMessage(page, "What is a Python list comprehension?"));
    const q1 = scoreReply(turn1.text, ["list", "comprehension", "python"]);
    metrics.record(buildEntry({ suite: SUITE_AGENT, test: "dev-agent-multi-turn-1", result: turn1, quality: q1, passed: q1.score >= 40 }));

    const turn2 = await timedAgentReply(page, () => sendAgentMessage(page, "Give a short example of it."));
    const q2 = scoreReply(turn2.text, ["[", "for", "in"], { requireStructure: true });
    metrics.record(buildEntry({ suite: SUITE_AGENT, test: "dev-agent-multi-turn-2", result: turn2, quality: q2, passed: q2.score >= 45 }));

    console.log(`[AGENT MULTI-TURN] T1: TTFT=${turn1.ttft_ms}ms Q=${q1.score}/100 | T2: TTFT=${turn2.ttft_ms}ms Q=${q2.score}/100`);
    expect(turn1.ttft_ms).toBeLessThan(45_000);
    expect(turn2.ttft_ms).toBeLessThan(45_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-FEATURE LATENCY COMPARISON (run last — shows deltas)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Cross-Feature TTFT Comparison", () => {
  test("compare TTFT across general-chat, RAG-chat, course-chat in one session", async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);

    await installTauriMock(page);
    await page.goto("/");
    await dismissModals(page);

    // 1. General chat
    await ensureSessionChatReady(page);
    const generalResult = await timedChatReply(page, () =>
      sendChatMessage(page, "Explain machine learning briefly.")
    );
    const gQ = scoreReply(generalResult.text, ["machine learning", "data", "pattern"]);
    metrics.record(buildEntry({ suite: "cross-feature", test: "general-ttft", result: generalResult, quality: gQ, passed: gQ.score >= 40 }));

    // 2. RAG chat (upload then query)
    await page.locator(".upload-icon-btn").click();
    await page.locator(".doc-chip").first().waitFor({ state: "visible", timeout: T.index });
    const ragResult = await timedChatReply(page, () =>
      sendChatMessage(page, "What does the document say about gradient descent?")
    );
    const rQ = scoreReply(ragResult.text, ["gradient", "descent", "document"]);
    metrics.record(buildEntry({ suite: "cross-feature", test: "rag-ttft", result: ragResult, quality: rQ, passed: rQ.score >= 40 }));

    // 3. Course floating chat
    await openCoursePage(page);
    await openFloatingChat(page);
    const courseResult = await timedFloatingReply(page, () =>
      sendFloatingMessage(page, "Summarize this page in one line.")
    );
    const cQ = scoreReply(courseResult.text, ["machine learning", "optimization"]);
    metrics.record(buildEntry({ suite: "cross-feature", test: "course-ttft", result: courseResult, quality: cQ, passed: cQ.score >= 35 }));

    // Log comparison table
    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║            Cross-Feature TTFT Comparison                 ║");
    console.log("╠═══════════════╦════════════╦════════════╦══════════════╣");
    console.log("║ Mode          ║ TTFT (ms)  ║ Total (ms) ║ Quality/100  ║");
    console.log("╠═══════════════╬════════════╬════════════╬══════════════╣");
    console.log(`║ General Chat  ║ ${String(generalResult.ttft_ms).padStart(10)} ║ ${String(generalResult.total_ms).padStart(10)} ║ ${String(gQ.score).padStart(12)} ║`);
    console.log(`║ RAG Chat      ║ ${String(ragResult.ttft_ms).padStart(10)} ║ ${String(ragResult.total_ms).padStart(10)} ║ ${String(rQ.score).padStart(12)} ║`);
    console.log(`║ Course Chat   ║ ${String(courseResult.ttft_ms).padStart(10)} ║ ${String(courseResult.total_ms).padStart(10)} ║ ${String(cQ.score).padStart(12)} ║`);
    console.log("╚═══════════════╩════════════╩════════════╩══════════════╝\n");

    expect(generalResult.ttft_ms).toBeLessThan(45_000);
    expect(ragResult.ttft_ms).toBeLessThan(45_000);
    expect(courseResult.ttft_ms).toBeLessThan(45_000);
  });
});
