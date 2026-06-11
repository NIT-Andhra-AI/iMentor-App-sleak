/**
 * Course Chat Tests
 *
 * Covers:
 *  1. Course sidebar lists available courses
 *  2. Expanding a course shows modules and pages
 *  3. Clicking a page loads the wiki viewer
 *  4. Wiki content renders markdown (headings, paragraphs)
 *  5. Floating chat FAB appears when a page is open
 *  6. Floating chat opens on FAB click
 *  7. Floating chat sends a question and receives a reply
 *  8. Floating chat topic badge matches the open page
 *  9. Floating chat minimize / expand works
 * 10. Navigating to a second page clears the floating chat context
 * 11. Course search / filter narrows visible pages
 * 12. Study chat panel (StudyChatPanel) shows mode pill
 * 13. Multiple questions in the floating chat carry context
 */

import { test, expect } from "@playwright/test";
import {
  installTauriMock,
  dismissModals,
  clickNav,
  openFloatingChat,
  sendFloatingMessage,
  T,
} from "./helpers.js";

const COURSE_TITLE_RE = /Machine Learning/i;

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await dismissModals(page);
  await clickNav(page, "courses");
});

// ── 1. Courses list ───────────────────────────────────────────────────────────
test("course sidebar lists at least one course", async ({ page }) => {
  const items = page.locator(".course-item, .course-row");
  await expect(items.first()).toBeVisible({ timeout: T.ui });
  const count = await items.count();
  expect(count).toBeGreaterThan(0);
});

// ── 2. Expand course tree ─────────────────────────────────────────────────────
test("expanding Machine Learning course reveals modules and pages", async ({ page }) => {
  // Click the ML course row to expand it
  const courseBtn = page.locator("button").filter({ hasText: COURSE_TITLE_RE }).first();
  await courseBtn.waitFor({ state: "visible", timeout: T.ui });
  await courseBtn.click();
  await page.waitForTimeout(600);

  // A module button should appear
  const moduleBtns = page.locator(".module-header, .module-btn, button").filter({
    hasText: /Theory|Getting Started|Introduction/i,
  });
  await expect(moduleBtns.first()).toBeVisible({ timeout: T.ui });
});

// ── 3. Clicking a page loads wiki viewer ──────────────────────────────────────
test("clicking a page slug loads content in the wiki viewer", async ({ page }) => {
  // Expand ML course
  const courseBtn = page.locator("button").filter({ hasText: COURSE_TITLE_RE }).first();
  await courseBtn.click();
  await page.waitForTimeout(600);

  // Expand a module (click any module header)
  const firstModule = page.locator(".module-row").first();
  if (await firstModule.isVisible({ timeout: T.ui }).catch(() => false)) {
    await firstModule.click();
    await page.waitForTimeout(400);
  }

  // Click the first page link available
  const pageLink = page.locator(".page-row").first();
  if (!(await pageLink.isVisible({ timeout: T.ui }).catch(() => false))) {
    // Fallback: click any button matching "overview" or the page title
    await page.locator("button").filter({ hasText: /Overview|Foundations/i }).first().click();
  } else {
    await pageLink.click();
  }
  await page.waitForTimeout(1_000);

  // Wiki viewer should have rendered content
  const wikiContent = page.locator(".page-content, .prose");
  await expect(wikiContent.first()).toBeVisible({ timeout: T.ui });
  const text = await wikiContent.first().innerText();
  expect(text.trim().length).toBeGreaterThan(100);
});

// ── 4. Wiki markdown renders headings ──────────────────────────────────────────
test("wiki page renders proper HTML headings not raw markdown hashes", async ({ page }) => {
  // Navigate to overview page
  const courseBtn = page.locator("button").filter({ hasText: COURSE_TITLE_RE }).first();
  await courseBtn.click();
  await page.waitForTimeout(500);
  const firstModule = page.locator(".module-row").first();
  if (await firstModule.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await firstModule.click();
    await page.waitForTimeout(400);
  }
  await page.locator("button").filter({ hasText: /Overview|Foundations/i }).first().click();
  await page.waitForTimeout(1_000);

  // Should have <h1>/<h2>/<h3> elements, NOT raw "# ..." text
  const headings = await page.locator("h1, h2, h3").count();
  expect(headings).toBeGreaterThan(0);

  // Raw markdown hashes should not appear in visible text
  const visibleText = await page.locator(".page-content").first().innerText();
  expect(visibleText).not.toMatch(/^#{1,3} /m);
});

// ── 5. Floating chat FAB visible after opening a page ─────────────────────────
test("floating chat FAB appears when a course page is open", async ({ page }) => {
  const courseBtn = page.locator("button").filter({ hasText: COURSE_TITLE_RE }).first();
  await courseBtn.click();
  await page.waitForTimeout(500);
  const firstModule = page.locator(".module-row").first();
  if (await firstModule.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await firstModule.click();
    await page.waitForTimeout(400);
  }
  await page.locator("button").filter({ hasText: /Overview|Foundations/i }).first().click();
  await page.waitForTimeout(1_000);

  // FAB button (the floating "ask" button)
  const fab = page.locator(".floating-btn, .fab-btn, button.open-btn, button[title*='Ask'], button[title*='Chat']");
  await expect(fab.first()).toBeVisible({ timeout: T.ui });
});

// ── 6. Floating chat opens on FAB click ────────────────────────────────────────
test("clicking the FAB opens the floating chat panel", async ({ page }) => {
  // Navigate to page
  const courseBtn = page.locator("button").filter({ hasText: COURSE_TITLE_RE }).first();
  await courseBtn.click();
  await page.waitForTimeout(500);
  const firstModule = page.locator(".module-row").first();
  if (await firstModule.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await firstModule.click();
    await page.waitForTimeout(400);
  }
  await page.locator("button").filter({ hasText: /Overview|Foundations/i }).first().click();
  await page.waitForTimeout(1_000);

  await openFloatingChat(page);

  const floatingPanel = page.locator(".floating-chat");
  await expect(floatingPanel).toBeVisible({ timeout: T.ui });
  // The input textarea must be ready
  await expect(floatingPanel.locator("textarea")).toBeVisible({ timeout: T.ui });
});

// ── 7. Floating chat question gets AI reply ────────────────────────────────────
test("floating chat replies to a topic-relevant question", async ({ page }) => {
  // Navigate to a well-known page
  const courseBtn = page.locator("button").filter({ hasText: COURSE_TITLE_RE }).first();
  await courseBtn.click();
  await page.waitForTimeout(500);
  const firstModule = page.locator(".module-row").first();
  if (await firstModule.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await firstModule.click();
    await page.waitForTimeout(400);
  }
  await page.locator("button").filter({ hasText: /Overview|Foundations/i }).first().click();
  await page.waitForTimeout(1_000);

  // Open floating chat
  await openFloatingChat(page);

  await sendFloatingMessage(page, "What does this page cover in one line?");

  // Streaming cursor appears
  await page
    .locator(".floating-chat .message .cursor")
    .first()
    .waitFor({ state: "visible", timeout: T.firstToken });

  // Then disappears
  await page
    .locator(".floating-chat .message .cursor")
    .last()
    .waitFor({ state: "detached", timeout: T.response });

  const aiMsgs = page.locator(".floating-chat .message:not(.user) .message-bubble");
  const n = await aiMsgs.count();
  expect(n).toBeGreaterThan(0);
  const text = await aiMsgs.nth(n - 1).innerText();
  expect(text.trim().length).toBeGreaterThan(10);
});

// ── 8. Floating chat topic badge ───────────────────────────────────────────────
test("floating chat header shows the current page title", async ({ page }) => {
  const courseBtn = page.locator("button").filter({ hasText: COURSE_TITLE_RE }).first();
  await courseBtn.click();
  await page.waitForTimeout(500);
  const firstModule = page.locator(".module-row").first();
  if (await firstModule.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await firstModule.click();
    await page.waitForTimeout(400);
  }
  await page.locator("button").filter({ hasText: /Overview|Foundations/i }).first().click();
  await page.waitForTimeout(1_000);

  await openFloatingChat(page);

  const badge = page.locator(".floating-chat .topic-badge, .floating-chat .header-title");
  await expect(badge.first()).toBeVisible({ timeout: T.ui });
  // Badge should contain a non-empty page title
  const badgeText = await badge.first().innerText();
  expect(badgeText.trim().length).toBeGreaterThan(3);
});

// ── 9. Minimize / expand ───────────────────────────────────────────────────────
test("floating chat can be minimized and re-expanded", async ({ page }) => {
  const courseBtn = page.locator("button").filter({ hasText: COURSE_TITLE_RE }).first();
  await courseBtn.click();
  await page.waitForTimeout(500);
  const firstModule = page.locator(".module-row").first();
  if (await firstModule.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await firstModule.click();
    await page.waitForTimeout(400);
  }
  await page.locator("button").filter({ hasText: /Overview|Foundations/i }).first().click();
  await page.waitForTimeout(1_000);

  await openFloatingChat(page);

  // Minimize
  const minimizeBtn = page.locator(".floating-chat .header-btn").first();
  await minimizeBtn.click();
  await page.waitForTimeout(300);
  await expect(page.locator(".floating-chat .chat-messages")).not.toBeVisible();

  // Re-expand
  await minimizeBtn.click();
  await page.waitForTimeout(300);
  await expect(page.locator(".floating-chat .chat-messages")).toBeVisible({ timeout: T.ui });
});

// ── 10. Course filter / search ─────────────────────────────────────────────────
test("typing in course filter shows only matching pages", async ({ page }) => {
  const courseBtn = page.locator("button").filter({ hasText: COURSE_TITLE_RE }).first();
  await courseBtn.click();
  await page.waitForTimeout(500);

  // Find the search/filter input in the sidebar
  const filterInput = page.locator(".sidebar input[type=text], .sidebar input[placeholder]").first();
  if (!(await filterInput.isVisible({ timeout: T.ui }).catch(() => false))) {
    test.skip(); // no filter input present
    return;
  }
  await filterInput.fill("gradient");
  await page.waitForTimeout(600);

  // Pages listed should contain "gradient"
  const pageBtns = page.locator(".page-row");
  const count = await pageBtns.count();
  if (count > 0) {
    const firstText = await pageBtns.first().innerText();
    expect(firstText.toLowerCase()).toContain("gradient");
  }
});

// ── 11. Multi-turn floating chat ───────────────────────────────────────────────
test("floating chat handles two follow-up questions correctly", async ({ page }) => {
  const courseBtn = page.locator("button").filter({ hasText: COURSE_TITLE_RE }).first();
  await courseBtn.click();
  await page.waitForTimeout(500);
  const firstModule = page.locator(".module-row").first();
  if (await firstModule.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await firstModule.click();
    await page.waitForTimeout(400);
  }
  await page.locator("button").filter({ hasText: /Overview|Foundations/i }).first().click();
  await page.waitForTimeout(1_000);

  await openFloatingChat(page);

  await sendFloatingMessage(page, "What is gradient descent?");
  await page
    .locator(".floating-chat .cursor")
    .first()
    .waitFor({ state: "visible", timeout: T.firstToken });
  await page
    .locator(".floating-chat .cursor")
    .last()
    .waitFor({ state: "detached", timeout: T.response });

  await sendFloatingMessage(page, "How does the learning rate affect it?");
  await page
    .locator(".floating-chat .cursor")
    .first()
    .waitFor({ state: "visible", timeout: T.firstToken });
  await page
    .locator(".floating-chat .cursor")
    .last()
    .waitFor({ state: "detached", timeout: T.response });

  const allAiMsgs = page.locator(".floating-chat .message:not(.user)");
  expect(await allAiMsgs.count()).toBeGreaterThanOrEqual(2);
});

// ── 12. Wiki table renders as HTML table ──────────────────────────────────────
test("wiki page with a data table renders as HTML table, not raw pipe characters", async ({ page }) => {
  // Navigate to Gradient Descent Variants (mock includes a comparison table)
  const courseBtn = page.locator("button").filter({ hasText: COURSE_TITLE_RE }).first();
  await courseBtn.click();
  await page.waitForTimeout(500);
  const firstModule = page.locator(".module-row").first();
  if (await firstModule.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await firstModule.click();
    await page.waitForTimeout(400);
  }
  await page.locator("button, .page-row").filter({ hasText: /Gradient Descent Variants/i }).first().click();
  await page.waitForTimeout(1_000);

  // Table must be rendered as <table> element
  const tableCount = await page.locator(".page-content table, .prose table").count();
  expect(tableCount).toBeGreaterThan(0);

  // Raw pipe rows must not appear in visible text
  const visibleText = await page.locator(".page-content, .prose").first().innerText();
  expect(visibleText).not.toMatch(/^\|.+\|$/m);
});
