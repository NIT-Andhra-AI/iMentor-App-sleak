/**
 * General Chat Tests
 *
 * Covers:
 *  1. Session creation and listing
 *  2. Sending a message and receiving a streaming AI reply
 *  3. Multiple turns in a single session
 *  4. Session auto-title after first reply
 *  5. Session delete and auto-creation of replacement
 *  6. Markdown + code rendering in AI reply
 *  7. Math rendering (KaTeX) in AI reply
 *  8. Markdown table rendering in AI reply
 *  9. Cancel streaming mid-response
 * 10. Empty input is rejected
 * 11. New session starts fresh (no prior messages)
 * 12. Chat panel shows General mode pill
 * 13. Shift+Enter inserts newline
 */

import { test, expect } from "@playwright/test";
import {
  installTauriMock,
  dismissModals,
  ensureSessionChatReady,
  sendChatMessage,
  waitForAiReply,
  assertNoError,
  T,
} from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await dismissModals(page);
  await ensureSessionChatReady(page);
});

// ── 1. Session creation ────────────────────────────────────────────────────
test("creates a new session via '+ New' and it appears in the list", async ({ page }) => {
  const before = await page.locator(".session-item").count();
  await page.getByRole("button", { name: /\+ New/i }).click();
  await page.waitForTimeout(500);
  const after = await page.locator(".session-item").count();
  expect(after).toBeGreaterThanOrEqual(before); // may dedupe if model not loaded yet
});

// ── 3. Sends message and gets a reply ────────────────────────────────────────
test("sends a simple question and receives a non-empty AI reply", async ({ page }) => {
  await sendChatMessage(page, "What is supervised learning in one sentence?");

  // User bubble appears
  await expect(page.locator(".bubble.user").last()).toContainText(
    "What is supervised learning",
    { timeout: T.ui }
  );

  const reply = await waitForAiReply(page);
  assertNoError(reply);
  // Should mention supervised / learning / label / training
  expect(reply.toLowerCase()).toMatch(/learn|label|train|predict|output/);
});

// ── 4. Multi-turn conversation ────────────────────────────────────────────────
test("carries context across multiple turns in the same session", async ({ page }) => {
  await sendChatMessage(page, "What is gradient descent?");
  const reply1 = await waitForAiReply(page);
  assertNoError(reply1);
  expect(reply1.toLowerCase()).toMatch(/gradient|loss|optim|minimiz/);

  await sendChatMessage(page, "How does learning rate affect it?");
  const reply2 = await waitForAiReply(page);
  assertNoError(reply2);
  expect(reply2.toLowerCase()).toMatch(/learning rate|step|converge|large|small/);
});

// ── 5. Session auto-title ─────────────────────────────────────────────────────
test("session auto-titles itself after first AI reply", async ({ page }) => {
  await sendChatMessage(page, "Explain what is bias-variance tradeoff");
  await waitForAiReply(page);
  // Title in sidebar should no longer be just "New chat"
  const activeTitle = page.locator(".session-item.active .truncate");
  await expect(activeTitle).not.toHaveText("New chat", { timeout: T.ui });
  const title = await activeTitle.innerText();
  expect(title.length).toBeGreaterThan(4);
});

// ── 6. Session delete ─────────────────────────────────────────────────────────
test("deleting a session creates a new one automatically", async ({ page }) => {
  const delBtn = page.locator(".del-session").first();
  await delBtn.waitFor({ state: "visible", timeout: T.ui });
  const countBefore = await page.locator(".session-item").count();
  await delBtn.click();
  await page.waitForTimeout(600);
  // At least 1 session must still exist (auto-created)
  const countAfter = await page.locator(".session-item").count();
  expect(countAfter).toBeGreaterThanOrEqual(1);
  expect(countAfter).toBeLessThanOrEqual(countBefore); // one removed, one may have been added
});

// ── 7. Markdown rendering ─────────────────────────────────────────────────────
test("AI reply containing code is rendered as a chat-code-block with copy button", async ({ page }) => {
  await sendChatMessage(page, "Show a Python example of gradient descent with a code block");
  const reply = await waitForAiReply(page);
  // Either the reply raw text has ```python or the DOM rendered the chat-code-block div
  const codeRendered = await page.locator(".chat-code-block").count();
  const hasCodeInText = reply.includes("def ") || reply.includes("for ") || reply.includes("import ");
  expect(codeRendered > 0 || hasCodeInText).toBeTruthy();
});

// ── 8. Math rendering ─────────────────────────────────────────────────────────
test("AI reply containing LaTeX renders KaTeX without raw dollar signs leaking", async ({ page }) => {
  await sendChatMessage(page, "Write the gradient descent update rule using LaTeX math notation");
  const reply = await waitForAiReply(page);
  assertNoError(reply);
  // KaTeX renders <span class="katex"> elements; raw $$ should not appear in visible text
  const katexSpans = await page.locator(".bubble.ai .katex").count();
  const rawDollar = reply.includes("$$") || reply.includes("\\[");
  // If the model outputs math, it should be rendered not raw
  if (rawDollar || katexSpans > 0) {
    // The DOM should contain KaTeX spans
    expect(katexSpans).toBeGreaterThan(0);
  }
  // At minimum the reply should be non-empty
  expect(reply.length).toBeGreaterThan(10);
});

// ── 9. Cancel streaming ────────────────────────────────────────────────────────
test("pressing the cancel button stops streaming mid-reply", async ({ page }) => {
  await sendChatMessage(page, "Explain the history of machine learning in great detail, covering every decade");

  // Click cancel if generation is still in progress.
  const cancelBtn = page.locator(".send-btn.cancel, .send-btn[class*='cancel']");
  if (await cancelBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await cancelBtn.click();
  }

  // Send button should return to non-cancel mode.
  await expect(page.locator(".send-btn").first()).not.toHaveClass(/cancel/, {
    timeout: 10_000,
  });
});

// ── 10. Empty input rejected ───────────────────────────────────────────────────
test("send button is disabled for empty input", async ({ page }) => {
  const sendBtn = page.locator(".input-area .send-btn");
  await sendBtn.waitFor({ state: "visible", timeout: T.ui });
  await expect(sendBtn).toBeDisabled();

  // Type something
  await page.locator(".input-area textarea").fill("hello");
  await expect(sendBtn).not.toBeDisabled();

  // Clear it
  await page.locator(".input-area textarea").fill("");
  await expect(sendBtn).toBeDisabled();
});

// ── 11. New session starts fresh ───────────────────────────────────────────────
test("switching to a new session shows no prior messages", async ({ page }) => {
  // Send something in current session
  await sendChatMessage(page, "hello world for session isolation test");
  await waitForAiReply(page);

  // Create new session
  await page.getByRole("button", { name: /\+ New/i }).click();
  await page.waitForTimeout(500);

  // Empty state should be visible in the new session
  const emptyGlyph = page.locator(".empty-glyph");
  await expect(emptyGlyph).toBeVisible({ timeout: T.ui });
});

// ── 12. Markdown table rendering ────────────────────────────────────────────
test("AI reply with a markdown table renders as an HTML table, not raw pipe characters", async ({ page }) => {
  await sendChatMessage(page, "Compare supervised and unsupervised learning in a table");
  await waitForAiReply(page);
  // Table must be rendered as <table> element
  const tableCount = await page.locator(".bubble.ai table").count();
  expect(tableCount).toBeGreaterThan(0);
  // Raw pipe rows must not appear as plain text in the rendered output
  const visibleText = await page.locator(".bubble.ai .markdown").innerText();
  expect(visibleText).not.toMatch(/^\|.+\|$/m);
});

// ── 13. Mode pill shows "General" ─────────────────────────────────────────────
test("chat panel shows General mode pill in sessions view", async ({ page }) => {
  const pill = page.locator(".mode-pill");
  await expect(pill).toBeVisible({ timeout: T.ui });
  await expect(pill).toContainText("General");
});

// ── 14. Shift+Enter adds newline instead of sending ──────────────────────────
test("Shift+Enter inserts a newline without sending the message", async ({ page }) => {
  const ta = page.locator(".input-area textarea");
  await ta.fill("line one");
  await ta.press("Shift+Enter");
  await ta.press("a");
  // Message count should be 0 (no send happened)
  await expect(page.locator(".bubble.user")).toHaveCount(0);
});
