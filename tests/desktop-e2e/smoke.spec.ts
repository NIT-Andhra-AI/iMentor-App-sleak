import { test, expect } from "@playwright/test";

/**
 * Desktop smoke test contract:
 * - Tauri dev/build runtime is up
 * - Main shell loads
 */
test("tauri window loads app shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});
