/**
 * Deployment Stress Suite
 *
 * Runs repeated user journeys across chat, courses, RAG docs, and agents.
 */

import { test, expect } from "@playwright/test";
import {
  installTauriMock,
  dismissModals,
  clickNav,
  ensureSessionChatReady,
  sendChatMessage,
  waitForAiReply,
  openFloatingChat,
  sendFloatingMessage,
  waitForAgentReply,
  spawnAgent,
  sendAgentMessage,
  waitForFloatingReply,
  SAMPLE_PDF,
  T,
} from "./helpers.js";

test("aggressive cross-feature stress journey", async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);

  await installTauriMock(page);
  await page.goto("/");
  await dismissModals(page);

  // 1) General chat repeated turns
  await ensureSessionChatReady(page);
  for (let i = 0; i < 4; i++) {
    await sendChatMessage(page, `Stress chat turn ${i + 1}: explain gradient descent briefly.`);
    const reply = await waitForAiReply(page, T.response);
    expect(reply.length).toBeGreaterThan(10);
  }

  // 2) Course + course chat
  await clickNav(page, "courses");
  const courseBtn = page.locator("button").filter({ hasText: /Machine Learning/i }).first();
  await courseBtn.click();
  await page.waitForTimeout(400);

  const firstModule = page.locator(".module-row").first();
  if (await firstModule.isVisible({ timeout: T.ui }).catch(() => false)) {
    await firstModule.click();
    await page.waitForTimeout(300);
  }

  const overview = page.locator("button").filter({ hasText: /Overview|Foundations/i }).first();
  await overview.click();
  await page.waitForTimeout(700);
  await openFloatingChat(page);
  await sendFloatingMessage(page, "Summarize this topic in one line.");
  const fReply = await waitForFloatingReply(page, T.response);
  expect(fReply.length).toBeGreaterThan(8);

  // 3) RAG documents chat
  await clickNav(page, "documents");
  const uploadBtn = page.locator(".upload-btn, button").filter({ hasText: /Browse|Upload/i }).first();
  await uploadBtn.click();
  await page.locator(".doc-row").first().waitFor({ state: "visible", timeout: T.index });
  await sendChatMessage(page, `Use my document ${SAMPLE_PDF.split('/').pop()} and explain regularization.`);
  const ragReply = await waitForAiReply(page, T.response);
  expect(ragReply.toLowerCase()).toMatch(/regulariz|overfitt|document|gradient/);

  // 4) Agents + code-agent style prompt
  await clickNav(page, "agents");
  await spawnAgent(page, "dev");
  await sendAgentMessage(page, "Write one-line Python factorial function");
  const agentReply = await waitForAgentReply(page, T.response);
  expect(agentReply.toLowerCase()).toMatch(/factorial|def|return/);
});
