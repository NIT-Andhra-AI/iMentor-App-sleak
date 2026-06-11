/**
 * Visualization Tests
 *
 * Verifies Mermaid blocks in course wiki render as SVG in WikiViewer.
 */

import { test, expect } from "@playwright/test";
import { installTauriMock, dismissModals, clickNav, T } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await dismissModals(page);
  await clickNav(page, "courses");
});

test("Mermaid visualization renders in wiki page", async ({ page }) => {
  const courseBtn = page.locator("button").filter({ hasText: /Machine Learning/i }).first();
  await courseBtn.waitFor({ state: "visible", timeout: T.ui });
  await courseBtn.click();
  await page.waitForTimeout(400);

  const visualModule = page.locator(".module-row, .module-header, .module-btn, button").filter({
    hasText: /Visual Learning/i,
  }).first();

  if (await visualModule.isVisible({ timeout: T.ui }).catch(() => false)) {
    await visualModule.click();
    await page.waitForTimeout(300);
  }

  const pageLink = page.locator(".page-row, button").filter({ hasText: /Learning Flow Diagram/i }).first();
  await pageLink.click();

  await expect(page.locator(".mermaid-wrap").first()).toBeVisible({ timeout: T.ui });

  const mermaidSvg = page.locator(".mermaid-wrap svg").first();
  await expect(mermaidSvg).toBeVisible({ timeout: 20_000 });
});
