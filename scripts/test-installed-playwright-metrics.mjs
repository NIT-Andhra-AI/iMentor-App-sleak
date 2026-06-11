import { chromium } from "../tests/desktop-e2e/node_modules/playwright/index.mjs";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const DEBUG_URL = process.env.STUDENT_AI_CDP_URL ?? "http://127.0.0.1:9222";
const APP_EXE =
  process.env.STUDENT_AI_EXE ??
  path.join(process.env.LOCALAPPDATA ?? "", "Student AI", "student-ai.exe");
const REPORT_PATH =
  process.env.STUDENT_AI_METRICS_REPORT ??
  path.join(process.cwd(), "reports", "installed-playwright-metrics.json");
let APP_PID = null;

const STUDENT_PROMPTS = [
  "Explain gradient descent in simple words for a 2nd year BTech student.",
  "What is overfitting and how does regularization help? Give one practical example.",
  "Differentiate supervised and unsupervised learning in a short exam-style answer.",
];

function log(step, msg) {
  process.stdout.write(`[${step}] ${msg}\n`);
}

function warn(step, msg) {
  process.stderr.write(`[${step}] ${msg}\n`);
}

function psExec(cmd, timeout = 30000) {
  return spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", cmd], {
    encoding: "utf8",
    timeout,
  });
}

function killApp() {
  psExec('Get-Process -Name "student-ai" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue');
}

/**
 * Reset license.json so the app doesn't self-uninstall due to an old install_date.
 * Writes today's date as both install_date and last_poll, giving a fresh 7-day window.
 */
function resetLicense() {
  const licDir = path.join(process.env.APPDATA ?? "", "com.studentai.app");
  const licPath = path.join(licDir, "license.json");
  try {
    fs.mkdirSync(licDir, { recursive: true });
    const now = new Date().toISOString();
    fs.writeFileSync(licPath, JSON.stringify({ install_date: now, last_poll: now }, null, 2));
    log("license", `reset license.json to ${now}`);
  } catch (err) {
    warn("license", `could not reset license.json: ${err.message}`);
  }
}

function launchApp() {
  if (!fs.existsSync(APP_EXE)) {
    throw new Error(`Installed app not found: ${APP_EXE}`);
  }
  const cmd = [
    "$ErrorActionPreference = 'Stop'",
    // Disable Chromium's background timer throttling so setTimeout(fn, 30) fires
    // correctly even when the app window is behind VS Code during the benchmark.
    "$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222 --disable-background-timer-throttling --disable-renderer-backgrounding'",
    `$p = Start-Process '${APP_EXE.replace(/'/g, "''")}' -RedirectStandardError 'd:/app2/app/app.err.log' -RedirectStandardOutput 'd:/app2/app/app.log' -PassThru`,
    "$p.Id",
  ].join("; ");
  const res = psExec(cmd, 15000);
  if (res.status !== 0) {
    throw new Error(`Failed to launch app: ${res.stderr || res.stdout}`);
  }
  const pidText = (res.stdout || "").trim();
  const pid = Number.parseInt(pidText, 10);
  if (Number.isFinite(pid) && pid > 0) {
    APP_PID = pid;
  }
}

async function waitForCdp(maxWaitMs = 60000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${DEBUG_URL}/json/list`);
      const targets = await r.json();
      const appTarget = targets.find(
        (t) =>
          (t.title && t.title.toLowerCase().includes("student ai")) ||
          (t.url && t.url.includes("tauri.localhost")),
      );
      if (appTarget) return;
    } catch (_) {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 1000));
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

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const hasOverlay = await page
      .evaluate(() => !!document.querySelector(".overlay"))
      .catch(() => false);
    if (!hasOverlay) return;
    await page.waitForTimeout(500);
  }
  warn("ui", "overlay still visible after timeout");
}

/**
 * Take a single process snapshot. Returns a plain object or null.
 * Uses a simple pipe-delimited one-liner to avoid PowerShell hashtable
 * syntax issues and JSON encoding edge-cases.
 * Format: ws_mb|threads|cpu|wv_ws_mb|wv_threads
 */
function snapshotMetrics() {
  const pidExpr = APP_PID && Number.isFinite(APP_PID)
    ? `Get-Process -Id ${APP_PID} -ErrorAction SilentlyContinue`
    : `Get-Process -Name 'student-ai' -ErrorAction SilentlyContinue | Select-Object -First 1`;

  const script = [
    `$a = ${pidExpr}`,
    `if (-not $a) { $a = Get-Process -Name 'student-ai' -ErrorAction SilentlyContinue | Select-Object -First 1 }`,
    `if (-not $a) { Write-Output '0|0|0|0|0'; exit 0 }`,
    `$wv = @(Get-Process -Name 'msedgewebview2' -ErrorAction SilentlyContinue)`,
    `$ws   = [math]::Round($a.WorkingSet64 / 1MB, 1)`,
    `$th   = $a.Threads.Count`,
    `$cpu  = [math]::Round($a.CPU, 2)`,
    `$wws  = if ($wv.Count -gt 0) { [math]::Round(($wv | Measure-Object -Property WorkingSet64 -Sum).Sum / 1MB, 1) } else { 0 }`,
    `$wth  = if ($wv.Count -gt 0) { ($wv | ForEach-Object { $_.Threads.Count } | Measure-Object -Sum).Sum } else { 0 }`,
    `Write-Output "$ws|$th|$cpu|$wws|$wth"`,
  ].join("\n");

  const out = psExec(script, 8000);
  const txt = (out.stdout || "").trim();
  // grab last line in case PS emits a version banner or other noise
  const lastLine = txt.split(/\r?\n/).pop() || "";
  const parts = lastLine.split("|");
  if (parts.length < 5) return null;
  const ws = parseFloat(parts[0]);
  const th = parseInt(parts[1], 10);
  const cpu = parseFloat(parts[2]);
  const wvWs = parseFloat(parts[3]);
  const wvTh = parseInt(parts[4], 10);
  if (!Number.isFinite(ws)) return null;
  return {
    student_ai_working_set_mb: ws,
    student_ai_threads: th,
    student_ai_cpu_seconds: cpu,
    webview_working_set_mb: wvWs,
    webview_threads: wvTh,
  };
}

function peakMetrics(snapshots) {
  const empty = {
    sample_count: 0,
    peak_student_ai_working_set_mb: 0,
    peak_student_ai_threads: 0,
    peak_webview_working_set_mb: 0,
    peak_webview_threads: 0,
  };
  const valid = snapshots.filter(Boolean);
  if (!valid.length) return empty;
  return {
    sample_count: valid.length,
    peak_student_ai_working_set_mb: Math.max(...valid.map((s) => s.student_ai_working_set_mb)),
    peak_student_ai_threads: Math.max(...valid.map((s) => s.student_ai_threads)),
    peak_webview_working_set_mb: Math.max(...valid.map((s) => s.webview_working_set_mb)),
    peak_webview_threads: Math.max(...valid.map((s) => s.webview_threads)),
    snapshots: valid,
  };
}

async function waitForAiResponse(page, aiBefore, timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await page.locator(".bubble.ai").count().catch(() => aiBefore);
    if (count > aiBefore) {
      return page.locator(".bubble.ai").last();
    }
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

async function waitForStableReply(locator, timeoutMs = 240000) {
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

  throw new Error("Timed out waiting for stable reply text");
}

async function runStudentScenario(page) {
  const input = page.locator(".input-area textarea");
  await input.waitFor({ state: "visible", timeout: 20000 });

  // Create a fresh session to avoid polluting context with history from
  // previous (potentially failed) benchmark runs.
  await page.locator('button[title="sessions"]').click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.locator('button.btn-accent').click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
  log("scenario", "created fresh session — starting clean with no history");

  const interactions = [];

  for (let i = 0; i < STUDENT_PROMPTS.length; i += 1) {
    const prompt = STUDENT_PROMPTS[i];
    log("scenario", `[${i + 1}/${STUDENT_PROMPTS.length}] prompting as student`);

    const aiBefore = await page.locator(".bubble.ai").count();
    const t0 = Date.now();

    // Baseline snapshot (synchronous — before yielding to inference)
    const snapBefore = snapshotMetrics();

    try {
      await input.fill(prompt);
      await input.press("Enter");

      // ── Diagnostic: verify the send was processed ──────────────────────
      await page.waitForTimeout(3000);
      const diagInfo = await page.evaluate(() => {
        const userBubbles = document.querySelectorAll(".bubble.user");
        const aiBubbles   = document.querySelectorAll(".bubble.ai");
        const streaming   = document.querySelectorAll(".streaming-text");
        return {
          userBubbleCount: userBubbles.length,
          aiBubbleCount:   aiBubbles.length,
          streamingCount:  streaming.length,
          lastUserText:    userBubbles[userBubbles.length - 1]?.innerText?.slice(0, 80) ?? "",
          lastAiText:      aiBubbles[aiBubbles.length - 1]?.innerText?.slice(0, 80) ?? "",
        };
      }).catch(e => ({ error: String(e) }));
      log("diag", `dom 3s after Enter: ${JSON.stringify(diagInfo)}`);
      // ───────────────────────────────────────────────────────────────────

      const bubble = await waitForAiResponse(page, aiBefore);
      await waitForFirstToken(bubble);
      const tFirstToken = Date.now();
      // Snapshot at peak inference load (first token just appeared = CPU hottest)
      const snapInference = snapshotMetrics();

      const reply = await waitForStableReply(bubble);
      const tDone = Date.now();
      // Snapshot once generation is complete
      const snapDone = snapshotMetrics();

      const metrics = peakMetrics([snapBefore, snapInference, snapDone]);
      interactions.push({
        prompt,
        reply_snippet: reply.slice(0, 280),
        latency_ms: {
          first_token: tFirstToken - t0,
          complete_response: tDone - t0,
        },
        process_metrics: metrics,
      });

      log(
        "metrics",
        `prompt ${i + 1}: TTFT=${tFirstToken - t0}ms  total=${tDone - t0}ms  ` +
        `appRAM=${metrics.peak_student_ai_working_set_mb}MB  threads=${metrics.peak_student_ai_threads}  ` +
        `wvRAM=${metrics.peak_webview_working_set_mb}MB`,
      );
    } catch (err) {
      interactions.push({
        prompt,
        error: String(err?.message || err),
        process_metrics: peakMetrics([snapBefore]),
      });
      warn("scenario", `prompt ${i + 1} failed: ${String(err?.message || err)}`);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  return interactions;
}

function ensureReportDir() {
  const dir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const startedAt = new Date().toISOString();
  killApp();
  await new Promise((r) => setTimeout(r, 800));

  // Reset license so the 7-day rolling window starts fresh for this test run.
  resetLicense();

  launchApp();
  await waitForCdp(60000);

  const browser = await chromium.connectOverCDP(DEBUG_URL);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0];
  if (!page) throw new Error("No WebView2 page found via CDP");

  await dismissModals(page);
  // Allow the LLM to fully settle after cold-start before sending the first prompt.
  // On a loaded system the model is resident but the KV-cache warm-up can take
  // an extra 15-30 s after the window appears.
  log("warmup", "waiting 30 s for LLM warm-up before first prompt...");
  await page.waitForTimeout(30000);

  const interactions = await runStudentScenario(page);

  const report = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    app_exe: APP_EXE,
    cdp_url: DEBUG_URL,
    prompts_run: STUDENT_PROMPTS.length,
    interactions,
  };

  ensureReportDir();
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  log("report", `saved metrics report -> ${REPORT_PATH}`);

  await browser.close().catch(() => {});
  killApp();
}

main().catch((err) => {
  console.error(`[fatal] ${err?.stack || err}`);
  killApp();
  process.exit(1);
});
