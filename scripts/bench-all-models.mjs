/**
 * bench-all-models.mjs
 *
 * Benchmark TTFT (Time To First Token) across all locally available LLM models
 * by swapping each one into the active model slot (chat-model-5.gguf), running
 * the 3-prompt student scenario, then restoring the original.
 *
 * Usage:
 *   node scripts/bench-all-models.mjs
 *
 * Environment overrides (same as test-installed-playwright-metrics.mjs):
 *   STUDENT_AI_CDP_URL   — default http://127.0.0.1:9222
 *   STUDENT_AI_EXE       — path to installed student-ai.exe
 */

import { chromium } from "../tests/desktop-e2e/node_modules/playwright/index.mjs";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

// ── Config ───────────────────────────────────────────────────────────────────

const DEBUG_URL = process.env.STUDENT_AI_CDP_URL ?? "http://127.0.0.1:9222";
const APP_EXE =
  process.env.STUDENT_AI_EXE ??
  path.join(process.env.LOCALAPPDATA ?? "", "Student AI", "student-ai.exe");

// Active model slot — the file name baked into the binary at compile time.
const ACTIVE_SLOT = "chat-model-5.gguf";

// Where the installed app stores models at runtime (Tauri app_data_dir/models/).
const MODELS_DIR = path.join(process.env.APPDATA ?? "", "com.studentai.app", "models");

// Backup name while we have another model swapped in.
const SLOT_BACKUP = "chat-model-5--backup.gguf";

// Repo dirs where extra model files live.
const REPO_MODELS_DIR = path.join(import.meta.dirname, "..", "models");
const BUNDLED_DIR = path.join(import.meta.dirname, "..", "bundled_model");

const REPORT_PATH = path.join(import.meta.dirname, "..", "reports", "bench-all-models.json");

const STUDENT_PROMPTS = [
  "Explain gradient descent in simple words for a 2nd year BTech student.",
  "What is overfitting and how does regularization help? Give one practical example.",
  "Differentiate supervised and unsupervised learning in a short exam-style answer.",
];

// ── Model catalogue ───────────────────────────────────────────────────────────
// Each entry describes one model to test.
// sourcePath: absolute path to the .gguf to swap in.
//   - If sourcePath is the ACTIVE_SLOT itself → no swap, test as-is.
//   - If sourcePath is on the same drive as MODELS_DIR → rename (instant).
//   - Otherwise → copy (may take 30–120 s for large models).

function buildCatalogue() {
  const active = path.join(MODELS_DIR, ACTIVE_SLOT);

  const candidates = [
    {
      id: "qwen3-4b",
      label: "Qwen3-4B Q4_K_M",
      sourcePath: active, // native slot — no swap needed
    },
    {
      id: "phi4-mini",
      label: "Phi-4-mini Q4_K_M",
      sourcePath: path.join(MODELS_DIR, "chat-model-1.gguf"),
    },
    {
      id: "qwen35-4b",
      label: "Qwen3.5-4B Q4_K_M",
      sourcePath: path.join(REPO_MODELS_DIR, "Qwen_Qwen3.5-4B-Q4_K_M.gguf"),
    },
    {
      id: "phi4-mini-bundled",
      label: "Phi-4-mini Q4_K_M (bundled_model fallback)",
      sourcePath: path.join(BUNDLED_DIR, "Phi-4-mini-instruct-Q4_K_M.gguf"),
    },
  ];

  // Deduplicate by resolved path, keep first occurrence.
  const seen = new Set();
  return candidates.filter((c) => {
    if (!fs.existsSync(c.sourcePath)) return false;
    const real = fs.realpathSync(c.sourcePath);
    if (seen.has(real)) return false;
    seen.add(real);
    return true;
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

let APP_PID = null;

function log(step, msg) {
  process.stdout.write(`[${step}] ${msg}\n`);
}
function warn(step, msg) {
  process.stderr.write(`[${step}] WARN ${msg}\n`);
}

function psExec(cmd, timeout = 30000) {
  return spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", cmd], {
    encoding: "utf8",
    timeout,
  });
}

function killApp() {
  psExec(
    'Get-Process -Name "student-ai" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue',
  );
  APP_PID = null;
}

function resetLicense() {
  const licDir = path.join(process.env.APPDATA ?? "", "com.studentai.app");
  const licPath = path.join(licDir, "license.json");
  try {
    fs.mkdirSync(licDir, { recursive: true });
    const now = new Date().toISOString();
    fs.writeFileSync(licPath, JSON.stringify({ install_date: now, last_poll: now }, null, 2));
  } catch (err) {
    warn("license", `could not reset: ${err.message}`);
  }
}

function launchApp() {
  if (!fs.existsSync(APP_EXE)) throw new Error(`Installed app not found: ${APP_EXE}`);
  const cmd = [
    "$ErrorActionPreference = 'Stop'",
    "$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222 --disable-background-timer-throttling --disable-renderer-backgrounding'",
    `$p = Start-Process '${APP_EXE.replace(/'/g, "''")}' -PassThru`,
    "$p.Id",
  ].join("; ");
  const res = psExec(cmd, 15000);
  if (res.status !== 0) throw new Error(`Failed to launch app: ${res.stderr || res.stdout}`);
  const pid = Number.parseInt((res.stdout || "").trim(), 10);
  if (Number.isFinite(pid) && pid > 0) APP_PID = pid;
}

async function waitForCdp(maxWaitMs = 90000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${DEBUG_URL}/json/list`);
      const targets = await r.json();
      const hit = targets.find(
        (t) =>
          (t.title && t.title.toLowerCase().includes("student ai")) ||
          (t.url && t.url.includes("tauri.localhost")),
      );
      if (hit) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("CDP did not become available within timeout");
}

async function dismissModals(page) {
  const selectors = [
    'button:has-text("I Agree")',
    'button:has-text("Accept")',
    'button:has-text("Continue anyway")',
    'button:has-text("Skip")',
    'button:has-text("Later")',
    'button:has-text("Close")',
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
      await loc.click({ force: true }).catch(() => {});
      await page.waitForTimeout(600);
    }
  }
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const has = await page.evaluate(() => !!document.querySelector(".overlay")).catch(() => false);
    if (!has) return;
    await page.waitForTimeout(500);
  }
}

async function waitForAiResponse(page, aiBefore, timeoutMs = 300000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await page.locator(".bubble.ai").count().catch(() => aiBefore);
    if (count > aiBefore) return page.locator(".bubble.ai").last();
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error("Timed out waiting for AI response bubble");
}

async function waitForFirstToken(locator, timeoutMs = 300000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const txt = await locator.innerText().catch(() => "");
    if ((txt || "").trim().length > 0) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for first token");
}

async function waitForStableReply(locator, timeoutMs = 300000) {
  const deadline = Date.now() + timeoutMs;
  let prev = "";
  let stable = 0;
  while (Date.now() < deadline) {
    const raw = await locator.innerText().catch(() => "");
    const txt = raw.trim().replace(/▌$/, "").trim();
    if (txt.length > 8 && txt === prev) {
      stable += 1;
      if (stable >= 3) return txt;
    } else {
      stable = 0;
      prev = txt;
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error("Timed out waiting for stable reply");
}

// ── File swap ─────────────────────────────────────────────────────────────────

/**
 * Put `sourcePath` into the active model slot.
 * Returns a restore function (call it after testing).
 */
function swapModel(sourcePath) {
  const active = path.join(MODELS_DIR, ACTIVE_SLOT);
  const backup = path.join(MODELS_DIR, SLOT_BACKUP);

  const isAlreadyActive = fs.realpathSync(sourcePath) === fs.realpathSync(active);
  if (isAlreadyActive) {
    log("swap", "model is already in the active slot — no swap needed");
    return () => {}; // no-op restore
  }

  // Backup the current active model
  if (fs.existsSync(active)) {
    log("swap", `backing up ${ACTIVE_SLOT} → ${SLOT_BACKUP}`);
    fs.renameSync(active, backup);
  }

  // Copy source into active slot (copy works cross-drive; rename works same-drive)
  const srcDrive = path.parse(sourcePath).root;
  const dstDrive = path.parse(active).root;
  if (srcDrive.toLowerCase() === dstDrive.toLowerCase()) {
    log("swap", `renaming (same drive): ${path.basename(sourcePath)} → ${ACTIVE_SLOT}`);
    fs.copyFileSync(sourcePath, active); // copy preserves the source
  } else {
    const sizeMB = Math.round(fs.statSync(sourcePath).size / 1024 / 1024);
    log("swap", `copying ${sizeMB} MB cross-drive: ${path.basename(sourcePath)} → ${ACTIVE_SLOT} (may take up to 2 min)`);
    fs.copyFileSync(sourcePath, active);
    log("swap", "copy complete");
  }

  // Return a restore function
  return function restore() {
    try {
      if (fs.existsSync(active)) fs.unlinkSync(active);
      if (fs.existsSync(backup)) {
        log("swap", `restoring ${SLOT_BACKUP} → ${ACTIVE_SLOT}`);
        fs.renameSync(backup, active);
      }
    } catch (err) {
      warn("swap", `restore failed: ${err.message}`);
    }
  };
}

// ── Single-model benchmark ────────────────────────────────────────────────────

async function benchmarkModel(modelEntry) {
  const { id, label } = modelEntry;
  log("bench", `\n${"─".repeat(60)}`);
  log("bench", `Model: ${label}  (${id})`);
  log("bench", "─".repeat(60));

  killApp();
  await new Promise((r) => setTimeout(r, 1500));
  resetLicense();
  launchApp();
  await waitForCdp(90000);

  const browser = await chromium.connectOverCDP(DEBUG_URL);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0];
  if (!page) throw new Error("No WebView2 page found via CDP");

  await dismissModals(page);
  log("warmup", "waiting 30 s for LLM warm-up...");
  await page.waitForTimeout(30000);

  // Fresh session
  await page.locator('button[title="sessions"]').click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.locator("button.btn-accent").click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);

  const ttfts = [];
  const totals = [];

  for (let i = 0; i < STUDENT_PROMPTS.length; i++) {
    const prompt = STUDENT_PROMPTS[i];
    log("prompt", `[${i + 1}/${STUDENT_PROMPTS.length}] ${prompt.slice(0, 60)}...`);

    const aiBefore = await page.locator(".bubble.ai").count();
    const t0 = Date.now();

    try {
      const input = page.locator(".input-area textarea");
      await input.fill(prompt);
      await input.press("Enter");

      const bubble = await waitForAiResponse(page, aiBefore);
      await waitForFirstToken(bubble);
      const ttft = Date.now() - t0;

      const reply = await waitForStableReply(bubble);
      const total = Date.now() - t0;

      ttfts.push(ttft);
      totals.push(total);
      log("result", `  TTFT=${ttft}ms  total=${total}ms  reply[0..60]="${reply.slice(0, 60)}"`);
    } catch (err) {
      warn("prompt", `  prompt ${i + 1} failed: ${err.message}`);
      ttfts.push(null);
      totals.push(null);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  await browser.close().catch(() => {});
  killApp();
  await new Promise((r) => setTimeout(r, 1500));

  return { id, label, ttfts, totals };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const catalogue = buildCatalogue();

  if (catalogue.length === 0) {
    console.error(
      "No model files found. Expected at least chat-model-5.gguf in:\n  " + MODELS_DIR,
    );
    process.exit(1);
  }

  log("main", `Found ${catalogue.length} model(s) to benchmark:`);
  for (const m of catalogue) log("main", `  • ${m.label}  ← ${m.sourcePath}`);
  log("main", "");

  const results = [];

  for (const entry of catalogue) {
    const restore = swapModel(entry.sourcePath);
    try {
      const r = await benchmarkModel(entry);
      results.push(r);
    } catch (err) {
      warn("bench", `Model ${entry.id} failed: ${err.message}`);
      results.push({ id: entry.id, label: entry.label, ttfts: [], totals: [], error: String(err.message) });
    } finally {
      restore();
    }
  }

  // ── Print comparison table ────────────────────────────────────────────────

  console.log("\n");
  console.log("═".repeat(72));
  console.log("  TTFT BENCHMARK — all models");
  console.log("═".repeat(72));
  const pad = (s, n) => String(s).padStart(n);
  const header = `${"Model".padEnd(28)} ${pad("p1 TTFT", 9)} ${pad("p2 TTFT", 9)} ${pad("p3 TTFT", 9)} ${pad("avg TTFT", 9)}`;
  console.log(header);
  console.log("─".repeat(72));

  for (const r of results) {
    const fmt = (ms) => (ms == null ? "  FAILED" : `${ms}ms`);
    const validTtfts = r.ttfts.filter((t) => t != null);
    const avg = validTtfts.length
      ? Math.round(validTtfts.reduce((a, b) => a + b, 0) / validTtfts.length)
      : null;
    const row = `${r.label.padEnd(28)} ${pad(fmt(r.ttfts[0] ?? null), 9)} ${pad(fmt(r.ttfts[1] ?? null), 9)} ${pad(fmt(r.ttfts[2] ?? null), 9)} ${pad(fmt(avg), 9)}`;
    console.log(row);
  }
  console.log("═".repeat(72));
  console.log("p1 = cold-start KV cache, p2/p3 = multi-turn (lower = KV reuse working)");
  console.log("");

  // Save JSON report
  const report = {
    ran_at: new Date().toISOString(),
    prompts: STUDENT_PROMPTS,
    results,
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  log("report", `Saved → ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(`[fatal] ${err?.stack || err}`);
  killApp();
  process.exit(1);
});
