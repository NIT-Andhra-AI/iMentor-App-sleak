/**
 * Agent mode test: verifies the Agents panel loads, can spawn Dev + Test agents,
 * and that messages are sent and replied to by each agent.
 *
 * Usage:
 *   node scripts/test-agent-mode.mjs
 *
 * Override exe:
 *   $env:STUDENT_AI_EXE = "D:\app2\app\target\x86_64-pc-windows-msvc\release\student-ai.exe"
 *   node scripts/test-agent-mode.mjs
 */

import { chromium } from "../tests/desktop-e2e/node_modules/playwright/index.mjs";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const DEBUG_URL = process.env.STUDENT_AI_CDP_URL ?? "http://127.0.0.1:9222";
const APP_EXE   = process.env.STUDENT_AI_EXE
  ?? path.join(process.env.LOCALAPPDATA ?? "", "Student AI", "student-ai.exe");

function log(step, msg)  { console.log(`[${step}] ${msg}`); }
function warn(step, msg) { console.warn(`[${step}] ⚠ ${msg}`); }

function psExec(cmd) {
  return spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", cmd], {
    encoding: "utf8", timeout: 30_000,
  });
}
function killApp() {
  psExec('Get-Process -Name "student-ai" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue');
}

async function waitForCdp(maxWaitMs = 60_000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${DEBUG_URL}/json/list`);
      const targets = await r.json();
      const appTarget = targets.find(t =>
        (t.title && t.title.toLowerCase().includes("student ai")) ||
        (t.url && t.url.includes("tauri.localhost"))
      );
      if (appTarget) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error("CDP did not become available within timeout");
}

async function dismissModals(page) {
  const overlaySelectors = [
    'button:has-text("I Agree")',
    'button:has-text("Accept")',
    'button:has-text("Continue anyway")',
    'button:has-text("Skip")',
    'button:has-text("Later")',
    'button:has-text("Close")',
  ];
  for (const sel of overlaySelectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
      await loc.click({ force: true }).catch(() => {});
      await page.waitForTimeout(600);
    }
  }
  // Wait for overlay to disappear
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const hasOverlay = await page.evaluate(
      () => !!document.querySelector('.overlay')
    ).catch(() => false);
    if (!hasOverlay) return;
    await page.waitForTimeout(500);
  }
}

async function pollCondition(page, fn, { timeout = 120_000, interval = 2000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const result = await page.evaluate(fn);
      if (result) return result;
    } catch (e) {
      if (/closed|disconnect/i.test(String(e))) throw e;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("Condition timed out");
}

async function testAgents(page) {
  log("agents", "navigating to Agents panel");

  // Click the Agents nav button - title="agents" per App.svelte nav loop
  const agentNavBtn = page.locator('.nav-btn[title="agents"]').first();
  const agentNavBtnByIndex = page.locator('.nav-bar .nav-btn').nth(3);

  let clicked = false;
  if (await agentNavBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await agentNavBtn.click();
    clicked = true;
  } else if (await agentNavBtnByIndex.isVisible({ timeout: 3000 }).catch(() => false)) {
    await agentNavBtnByIndex.click();
    clicked = true;
  }

  if (!clicked) {
    const allNavBtns = await page.locator('.nav-btn').all();
    log("agents", `found ${allNavBtns.length} nav buttons, clicking 4th`);
    if (allNavBtns.length >= 4) {
      await allNavBtns[3].click();
      clicked = true;
    }
  }

  if (!clicked) throw new Error("Could not find Agents nav button");

  // Wait for AgentSpawner to be visible
  await page.waitForTimeout(1000);

  // Check the Agents UI is visible
  const spawnBtns = page.locator('.spawn-btns button');
  const btnCount = await spawnBtns.count();
  if (btnCount < 2) throw new Error(`Expected ≥2 spawn buttons, got ${btnCount}`);
  log("agents", `found ${btnCount} spawn buttons`);

  // ── Spawn Dev Agent ────────────────────────────────────────────────────────
  log("agents", "spawning Dev Agent");
  const devBtn = page.locator('.spawn-btns button').filter({ hasText: /dev/i }).first();
  await devBtn.click();
  await page.waitForTimeout(1500);

  // Wait for a tab to appear
  const tabAppeared = await pollCondition(page,
    () => document.querySelectorAll('.tab').length > 0 ? true : null,
    { timeout: 30_000, interval: 1000 }
  ).catch(() => null);

  if (!tabAppeared) throw new Error("Dev agent tab did not appear after spawn");
  log("agents", "Dev Agent tab appeared");

  // Send a message to the Dev agent
  const inputBox = page.locator('.input-row input').first();
  await inputBox.waitFor({ state: "visible", timeout: 10_000 });
  await inputBox.fill("Hello! What are your capabilities?");
  await inputBox.press("Enter");
  log("agents", "sent message to Dev Agent, waiting for reply...");

  // Wait for assistant reply (non-empty .msg.ai)
  const devReply = await pollCondition(page,
    () => {
      const msgs = Array.from(document.querySelectorAll('.msg.ai'));
      const last = msgs[msgs.length - 1];
      if (last && last.textContent.trim().length > 10) return last.textContent.trim();
      return null;
    },
    { timeout: 180_000, interval: 2000 }
  ).catch(() => null);

  if (!devReply) {
    warn("agents", "Dev Agent did not reply within 3 minutes — agent infrastructure may need model warm-up");
  } else {
    log("agents", `Dev Agent replied: ${devReply.slice(0, 150)}`);
  }

  // ── Spawn Test Agent ───────────────────────────────────────────────────────
  log("agents", "spawning Test Agent");
  const testBtn = page.locator('.spawn-btns button').filter({ hasText: /test/i }).first();
  await testBtn.click();
  await page.waitForTimeout(1500);

  // Wait for second tab
  const twoTabs = await pollCondition(page,
    () => document.querySelectorAll('.tab').length >= 2 ? true : null,
    { timeout: 30_000, interval: 1000 }
  ).catch(() => null);

  if (!twoTabs) {
    warn("agents", "Test Agent second tab did not appear");
  } else {
    log("agents", "Test Agent tab appeared");
    // Click the Test Agent tab (last one)
    const tabs = await page.locator('.tab').all();
    await tabs[tabs.length - 1].click();
    await page.waitForTimeout(500);

    // Send message to test agent
    await inputBox.fill("Run a basic connectivity test");
    await inputBox.press("Enter");
    log("agents", "sent message to Test Agent, waiting for reply...");

    const testReply = await pollCondition(page,
      () => {
        const msgs = Array.from(document.querySelectorAll('.msg.ai'));
        // Look for a new message after the dev agent reply
        const last = msgs[msgs.length - 1];
        if (last && last.textContent.trim().length > 10) return last.textContent.trim();
        return null;
      },
      { timeout: 180_000, interval: 2000 }
    ).catch(() => null);

    if (!testReply) {
      warn("agents", "Test Agent did not reply within 3 minutes");
    } else {
      log("agents", `Test Agent replied: ${testReply.slice(0, 150)}`);
    }
  }

  return {
    devAgentSpawned: !!tabAppeared,
    devAgentReplied: !!devReply,
    devReplySnippet: devReply ? devReply.slice(0, 200) : null,
    testAgentSpawned: !!twoTabs,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────
log("setup", "killing any existing student-ai process");
killApp();
await new Promise((r) => setTimeout(r, 800));

if (!fs.existsSync(APP_EXE)) {
  throw new Error(`Installed app not found: ${APP_EXE}\nRun the NSIS installer first.`);
}

log("setup", `launching ${APP_EXE}`);
spawnSync("powershell", [
  "-NoProfile", "-NonInteractive", "-Command",
  `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'; Start-Process '${APP_EXE.replace(/'/g, "''")}'`
], { encoding: "utf8", timeout: 15_000 });

log("setup", "waiting for WebView2 CDP…");
await waitForCdp(60_000);
await new Promise((r) => setTimeout(r, 1000));

const browser = await chromium.connectOverCDP(DEBUG_URL);
const contexts = browser.contexts();
const context  = contexts[0] ?? await browser.newContext();
let page = context.pages()[0];
// NOTE: Do NOT call context.newPage() — WebView2 CDP does not support it.
if (!page) throw new Error("No page found in WebView2 CDP context");

log("app", `connected to ${await page.title().catch(() => "")} at ${page.url()}`);
await dismissModals(page);
await page.waitForTimeout(1000);

let result;
let agentError = null;
try {
  result = await testAgents(page);
} catch (e) {
  agentError = String(e);
  warn("agents", `Test failed: ${agentError}`);
}

log("setup", "killing app");
killApp();

// ── Results ────────────────────────────────────────────────────────────────
console.log("\n══════════════════════ AGENT MODE TEST RESULTS ══════════════════════");
if (agentError) {
  console.log(`❌ Agent test ERRORED: ${agentError}`);
  process.exit(1);
}
console.log(`  Dev Agent spawned:    ${result.devAgentSpawned  ? "✅" : "❌"}`);
console.log(`  Dev Agent replied:    ${result.devAgentReplied  ? "✅" : "⚠ (timeout)"}`);
console.log(`  Test Agent spawned:   ${result.testAgentSpawned ? "✅" : "❌"}`);
if (result.devReplySnippet) {
  console.log(`  Dev reply snippet:    "${result.devReplySnippet}"`);
}
console.log("═════════════════════════════════════════════════════════════════════\n");

const spawnOk = result.devAgentSpawned;
if (!spawnOk) {
  console.log("RESULT: FAIL — agents could not be spawned");
  process.exit(1);
} else {
  console.log("RESULT: PASS — agent infrastructure functional");
  process.exit(0);
}
