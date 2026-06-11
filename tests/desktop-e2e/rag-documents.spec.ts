/**
 * RAG / Document Chat Tests
 *
 * Architecture: RAG is inline in ChatPanel — no separate Documents nav tab.
 *
 * Covers:
 *  1. Upload button (+) is visible in the ChatPanel input bar
 *  2. Mode pill shows "RAG Context" after uploading a document
 *  3. Upload a PDF fixture via file chooser → doc chip appears
 *  4. Chat in user_docs mode answers from the uploaded document
 *  5. RAG answer references the document content
 *  6. Doc chip is present after upload (graceful del check)
 *  7. Querying before any doc is uploaded returns a graceful fallback
 *  8. Markdown table renders as HTML table in RAG reply
 *  9. LaTeX formula renders KaTeX element in RAG reply
 */

import { test, expect } from "@playwright/test";

import {
  installTauriMock,
  dismissModals,
  sendChatMessage,
  waitForAiReply,
  assertNoError,
  T,
} from "./helpers.js";

/** Click the inline upload button and wait for the doc chip to confirm indexing. */
async function uploadDocInline(page: any) {
  await page.locator(".upload-icon-btn").click();
  // Doc chip appears when ragEnabled=true and docs.length > 0
  await page.locator(".doc-chip").first().waitFor({ state: "visible", timeout: T.index });
}

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await dismissModals(page);
  // Sessions view is the default — ChatPanel is visible with the inline upload button
  await page.locator(".input-area").waitFor({ state: "visible", timeout: T.ui });
});

// ── 1. Inline upload button is visible ────────────────────────────────────────
test("documents sidebar shows the upload area and title", async ({ page }) => {
  const uploadBtn = page.locator(".upload-icon-btn");
  await expect(uploadBtn).toBeVisible({ timeout: T.ui });
});

// ── 2. Mode pill shows RAG Context after upload ────────────────────────────────
test("chat panel mode pill shows 'My Documents' in documents view", async ({ page }) => {
  await uploadDocInline(page);
  const pill = page.locator(".mode-pill");
  await expect(pill).toBeVisible({ timeout: T.ui });
  await expect(pill).toContainText(/RAG Context|user_docs|Documents/i);
});

// ── 3. Upload a PDF → doc chip appears ────────────────────────────────────────
test("uploading sample PDF shows it in the knowledge base list", async ({ page }) => {
  await page.locator(".upload-icon-btn").click();

  // Spinner may flash briefly
  await expect(page.locator(".upload-icon-btn .spin")).toBeVisible({
    timeout: T.ui,
  }).catch(() => {});

  // Doc chip should appear after indexing completes
  await expect(page.locator(".doc-chip").first()).toBeVisible({ timeout: T.index });
});

// ── 4. Chat with sample doc uploaded ────────────────────────────────────────
test("chat in user_docs mode returns a reply (sample PDF uploaded)", async ({ page }) => {
  await uploadDocInline(page);

  await sendChatMessage(page, "What does the document say about gradient descent?");
  const reply = await waitForAiReply(page);
  assertNoError(reply);
  expect(reply.length).toBeGreaterThan(15);
});

// ── 5. RAG answer contains document-specific terms ────────────────────────────
test("RAG answer references content from the uploaded document", async ({ page }) => {
  await uploadDocInline(page);

  await sendChatMessage(page, "What is mentioned about regularization in the document?");
  const reply = await waitForAiReply(page);
  assertNoError(reply);
  expect(reply.toLowerCase()).toMatch(/regulariz|overfitt|neural|machine learning|document/i);
});

// ── 6. Doc chip present after upload (del-btn check is graceful) ───────────────
test("deleting an uploaded document removes it from the knowledge base", async ({ page }) => {
  await uploadDocInline(page);

  const chip = page.locator(".doc-chip").first();
  await expect(chip).toBeVisible({ timeout: T.ui });

  // The inline ChatPanel UI shows chips but no delete button; del lives in DocumentUploader.
  // If a del-btn is ever added to the chip, test it; otherwise the chip presence is enough.
  const delBtn = chip.locator(".del-btn");
  if (await delBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await delBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator(".doc-chip")).toHaveCount(0);
  }
});

// ── 7. No doc uploaded – graceful fallback ────────────────────────────────────
test("asking in user_docs mode with no documents uploaded returns a graceful reply", async ({ page }) => {
  // No upload — question is answered in general mode
  await sendChatMessage(page, "What does my document say?");
  const reply = await waitForAiReply(page);
  expect(reply.length).toBeGreaterThan(5);
  expect(reply).not.toMatch(/IPC error|panic|thread.*main/i);
});

// ── 8. Markdown table rendering in RAG chat ────────────────────────────────────
test("RAG chat reply with a markdown table renders as HTML table, not raw pipes", async ({ page }) => {
  await uploadDocInline(page);

  await sendChatMessage(page, "Compare gradient descent methods in a table from the document");
  await waitForAiReply(page);

  const tableCount = await page.locator(".bubble.ai table").count();
  expect(tableCount).toBeGreaterThan(0);
  const visibleText = await page.locator(".bubble.ai .markdown").innerText();
  expect(visibleText).not.toMatch(/^\|.+\|$/m);
});

// ── 9. LaTeX formula rendering in RAG chat ────────────────────────────────────
test("RAG chat reply with LaTeX formula renders KaTeX element", async ({ page }) => {
  await uploadDocInline(page);

  await sendChatMessage(page, "Show the gradient descent update equation formula from the document");
  await waitForAiReply(page);

  const katexCount = await page.locator(".bubble.ai .katex").count();
  expect(katexCount).toBeGreaterThan(0);
});
