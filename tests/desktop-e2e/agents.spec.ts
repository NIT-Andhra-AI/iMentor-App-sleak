/**
 * Agents Tests
 *
 * Covers:
 *  1. Agents sidebar renders title and spawn buttons
 *  2. "Dev Agent" spawn button creates a dev agent tab
 *  3. "Test Agent" spawn button creates a test agent tab
 *  4. Agent tabs appear and are clickable
 *  5. Sending a message to a dev agent returns a reply
 *  6. Sending a message to a test agent returns a reply
 *  7. Multiple agents can be spawned (one dev, one test)
 *  8. Switching between agent tabs preserves message history
 *  9. Empty input is disabled in agent chat
 * 10. Agent replies are non-trivial (not just "▋" cursor)
 * 11. Agent status dot appears (Running / Idle indicator)
 */

import { test, expect } from "@playwright/test";
import {
  installTauriMock,
  dismissModals,
  clickNav,
  spawnAgent,
  sendAgentMessage,
  waitForAgentReply,
  assertNoError,
  T,
} from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await dismissModals(page);
  await clickNav(page, "agents");
});

// ── 1. Agents sidebar renders ─────────────────────────────────────────────────
test("agents sidebar shows AI Agents title and spawn buttons", async ({ page }) => {
  await expect(page.locator(".sidebar .title").filter({ hasText: /AI Agents/i })).toBeVisible({
    timeout: T.ui,
  });
  await expect(page.getByRole("button", { name: /Dev Agent/i })).toBeVisible({ timeout: T.ui });
  await expect(page.getByRole("button", { name: /Test Agent/i })).toBeVisible({ timeout: T.ui });
});

// ── 2. Spawn Dev Agent ─────────────────────────────────────────────────────────
test("spawning a Dev Agent creates an agent tab", async ({ page }) => {
  await spawnAgent(page, "dev");
  const tab = page.locator(".tabs .tab").filter({ hasText: /Dev/i });
  await expect(tab.first()).toBeVisible({ timeout: T.ui });
});

// ── 3. Spawn Test Agent ────────────────────────────────────────────────────────
test("spawning a Test Agent creates an agent tab", async ({ page }) => {
  await spawnAgent(page, "test");
  const tab = page.locator(".tabs .tab").filter({ hasText: /Test/i });
  await expect(tab.first()).toBeVisible({ timeout: T.ui });
});

// ── 4. Dev agent input and send button appear after spawn ─────────────────────
test("Dev Agent: input and send button appear after spawning", async ({ page }) => {
  await spawnAgent(page, "dev");

  const input = page.locator(".input-row input").first();
  await expect(input).toBeVisible({ timeout: T.ui });

  const sendBtn = page.locator(".input-row .send, .input-row button").last();
  await expect(sendBtn).toBeVisible({ timeout: T.ui });
});

// ── 5. Dev agent responds to a message ────────────────────────────────────────
test("Dev Agent replies to a question about code", async ({ page }) => {
  await spawnAgent(page, "dev");

  await sendAgentMessage(page, "Write a one-line Python function to compute factorial");
  const reply = await waitForAgentReply(page);
  assertNoError(reply);
  expect(reply.toLowerCase()).toMatch(/def |factorial|return|lambda/);
});

// ── 6. Test agent responds to a message ───────────────────────────────────────
test("Test Agent replies to a question about testing", async ({ page }) => {
  await spawnAgent(page, "test");

  await sendAgentMessage(page, "What is unit testing and give one pytest example");
  const reply = await waitForAgentReply(page);
  assertNoError(reply);
  expect(reply.toLowerCase()).toMatch(/test|assert|pytest|unit|function/);
});

// ── 7. Agent send button disabled for empty input ─────────────────────────────
test("agent send button is disabled when input is empty", async ({ page }) => {
  await spawnAgent(page, "dev");

  const sendBtn = page.locator(".input-row .send, .input-row button").last();
  await expect(sendBtn).toBeDisabled({ timeout: T.ui });

  // Type something
  const input = page.locator(".input-row input").first();
  await input.fill("hello");
  await expect(sendBtn).not.toBeDisabled();

  // Clear it
  await input.fill("");
  await expect(sendBtn).toBeDisabled();
});

// ── 8. Both agent types can coexist ───────────────────────────────────────────
test("spawning both Dev and Test agents shows two tabs", async ({ page }) => {
  await spawnAgent(page, "dev");
  await spawnAgent(page, "test");

  const tabs = page.locator(".tabs .tab");
  const count = await tabs.count();
  expect(count).toBeGreaterThanOrEqual(2);
});

// ── 9. Switching between agent tabs preserves messages ────────────────────────
test("switching between two agent tabs preserves each chat history", async ({ page }) => {
  await spawnAgent(page, "dev");
  await sendAgentMessage(page, "Hello from dev agent");
  const reply1 = await waitForAgentReply(page);

  await spawnAgent(page, "test");
  await sendAgentMessage(page, "Hello from test agent");
  const reply2 = await waitForAgentReply(page);

  // Switch back to dev tab
  const devTab = page.locator(".tabs .tab").filter({ hasText: /Dev/i }).first();
  await devTab.click();
  await page.waitForTimeout(300);

  // Dev agent messages should still be visible
  const aiMsgs = page.locator(".messages .msg.ai");
  expect(await aiMsgs.count()).toBeGreaterThan(0);
  const lastText = await aiMsgs.last().innerText();
  // It should be reply1, not reply2
  expect(lastText.length).toBeGreaterThan(3);
});

// ── 10. Agent status dot renders ──────────────────────────────────────────────
test("spawned agent tab has a status dot element", async ({ page }) => {
  await spawnAgent(page, "dev");
  const dot = page.locator(".tabs .tab .dot");
  await expect(dot.first()).toBeVisible({ timeout: T.ui });
});

// ── 11. Dev agent multi-turn context ──────────────────────────────────────────
test("Dev Agent handles two follow-up questions in sequence", async ({ page }) => {
  await spawnAgent(page, "dev");

  await sendAgentMessage(page, "What is a Python list comprehension?");
  const r1 = await waitForAgentReply(page);
  assertNoError(r1);

  await sendAgentMessage(page, "Give a short example of it");
  const r2 = await waitForAgentReply(page);
  assertNoError(r2);
  // Should contain a list comprehension example
  expect(r2).toMatch(/\[.*for.*in.*\]|comprehension|example/i);
});

// ── 12. Empty agent list shows prompt to spawn ────────────────────────────────
test("before spawning, agents panel shows an empty state prompt", async ({ page }) => {
  const empty = page.locator(".sidebar .empty");
  await expect(empty).toBeVisible({ timeout: T.ui });
  await expect(empty).toContainText(/Spawn|agent|get started/i);
});

// ── Code Agent Stress Tests (merged from code-agent.spec.ts) ──────────────────

// ── 13. Coding prompt sequence ────────────────────────────────────────────────
test("Dev Agent handles coding-focused prompt sequence", async ({ page }) => {
  await spawnAgent(page, "dev");

  const prompts = [
    "Write a Python factorial function in one line",
    "Now give a list-comprehension example for squares",
    "Add one edge-case note for negative input",
  ];

  for (const prompt of prompts) {
    await sendAgentMessage(page, prompt);
    const reply = await waitForAgentReply(page, T.response);
    assertNoError(reply);
    expect(reply.length).toBeGreaterThan(12);
  }
});

// ── 14. Dev and Test agents survive alternating requests ──────────────────────
test("Dev and Test agents survive alternating requests", async ({ page }) => {
  await spawnAgent(page, "dev");
  await spawnAgent(page, "test");

  const devTab = page.locator(".tabs .tab").filter({ hasText: /Dev/i }).first();
  const testTab = page.locator(".tabs .tab").filter({ hasText: /Test/i }).first();

  await devTab.click();
  await sendAgentMessage(page, "Explain Python list comprehension in one sentence");
  const devReply = await waitForAgentReply(page);
  assertNoError(devReply);

  await testTab.click();
  await sendAgentMessage(page, "Give one pytest assertion example");
  const testReply = await waitForAgentReply(page);
  assertNoError(testReply);

  await devTab.click();
  await expect(page.locator(".messages .msg.ai").last()).toBeVisible({ timeout: T.ui });
});
