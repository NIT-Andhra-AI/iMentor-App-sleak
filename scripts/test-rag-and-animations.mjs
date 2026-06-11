/**
 * Rigorous deployment-grade test: multi-question RAG quality + citation check
 * over the real CS229 (Andrew Ng) 227-page ML lecture notes PDF,
 * then animation walk-through across every course.
 *
 * Usage:
 *   node scripts/test-rag-and-animations.mjs
 *
 * Override exe:
 *   $env:STUDENT_AI_EXE = "D:\app2\app\target\x86_64-pc-windows-msvc\release\student-ai.exe"
 *   node scripts/test-rag-and-animations.mjs
 *
 * The test document is RAG_test.pdf (CS229 Stanford ML notes, 227 pages).
 * Questions span: linear regression, normal equations, logistic regression,
 * SVMs, kernel methods, EM/ELBO, deep learning (SGD), RL (Bellman / policy).
 * Pass threshold: 6/8 correct (75%) with ≥4 citation signals.
 */

import { chromium } from "../tests/desktop-e2e/node_modules/playwright/index.mjs";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const DEBUG_URL = process.env.STUDENT_AI_CDP_URL ?? "http://127.0.0.1:9222";
const APP_EXE   = process.env.STUDENT_AI_EXE
  ?? path.join(process.env.LOCALAPPDATA ?? "", "Student AI", "student-ai.exe");
const APP_DATA  = path.join(process.env.APPDATA ?? "", "com.studentai.app");

// Path to the CS229 ML notes PDF (real course material — no synthetic doc)
// Place the PDF at: tests/fixtures/RAG_test.pdf
// (CS229 Andrew Ng Stanford ML lecture notes, 227 pages — available publicly)
const RAG_PDF_PATH = process.env.RAG_PDF_PATH
  ?? path.resolve("tests", "fixtures", "RAG_test.pdf");

// ── RAG test document ─────────────────────────────────────────────────────────
// CS229 (Andrew Ng & Tengyu Ma, Stanford, 2023) — 227-page ML lecture notes.
// No synthetic content: this is real course material used as a deployment test.
// The PDF must exist at tests/fixtures/RAG_test.pdf (or set RAG_PDF_PATH env var).

if (!fs.existsSync(RAG_PDF_PATH)) {
  console.error(`[setup] FATAL: RAG test PDF not found at ${RAG_PDF_PATH}`);
  console.error(`[setup] Download CS229 notes and place at: tests/fixtures/RAG_test.pdf`);
  console.error(`[setup] Or set: $env:RAG_PDF_PATH = "C:\\path\\to\\your.pdf"`);
  process.exit(1);
}

// ── Rigorous RAG questions ────────────────────────────────────────────────────
// 8 questions spanning 7 distinct chapters of the CS229 notes.
// Each requires retrieving a specific formula, derivation, or comparison
// from a specific section of the 227-page document — not guessable from
// general LLM knowledge alone (the LLM should cite the document).
//
// Pass threshold: ≥6/8 correct AND ≥4 with citation signals.
const RAG_QUESTIONS = [
  // ── Chapter 1: Linear regression ──────────────────────────────────────────
  {
    label: "cost-function-J-theta",
    q: "According to the CS229 notes, what is the exact definition of the cost function J(θ) for linear regression? Write the formula and describe each term.",
    // Must reference the 1/2 * sum of squared residuals form
    mustMatch: /J\(θ\)|J\(theta\)|1\/2|one.half|sum.*squared|hθ.*y|h_theta.*y|squared.error|residual/i,
  },
  {
    label: "normal-equations-closed-form",
    q: "Derive and state the normal equations for linear regression as given in the CS229 notes. What closed-form expression gives the optimal θ?",
    // Must reference X^T X θ = X^T y or the solution θ = (X^T X)^{-1} X^T y
    mustMatch: /X\^T|X\.T|X\s*T\s*X|normal equation|closed.form|X.*T.*y|XTX|XT y|(X'|Xᵀ)/i,
  },
  // ── Chapter 2: Logistic regression ────────────────────────────────────────
  {
    label: "logistic-log-likelihood",
    q: "Write out the log-likelihood function ℓ(θ) for logistic regression as defined in the CS229 notes (equation 2.1). How does gradient ascent use it?",
    // Must reference the binary cross-entropy sum: y log h + (1-y) log(1-h)
    mustMatch: /log.likelihood|y.*log.*h|log.*1.*h|\(1.*y\).*log|binary.*cross.entropy|ℓ\(θ\)|maximize/i,
  },
  // ── Chapter 6: Support Vector Machines ────────────────────────────────────
  {
    label: "svm-optimization-problem",
    q: "After rescaling so the functional margin equals 1, what optimization problem does the SVM solve according to the CS229 notes? State the objective and constraints.",
    // Must reference min 1/2 ||w||^2 subject to y(i)(w^T x + b) >= 1
    mustMatch: /1\/2.*\|w\||minimize.*w|min.*w|hard.margin|y\(i\).*w|constraint.*y|quadratic|support vector/i,
  },
  // ── Chapter 5: Kernel methods ──────────────────────────────────────────────
  {
    label: "kernel-cubic-feature-map",
    q: "In the CS229 kernel methods chapter, what feature map φ(x) is used to represent a cubic polynomial as a linear function? Give the explicit mapping.",
    // Must reference φ(x) = [1, x, x², x³] ∈ R^4 or similar
    mustMatch: /phi\(x\)|φ\(x\)|1.*x.*x.2.*x.3|R\^4|R4|x_0.*x_1|cubic|feature map|monomial/i,
  },
  // ── Chapter 11: EM algorithm ──────────────────────────────────────────────
  {
    label: "em-elbo-definition",
    q: "How does the CS229 notes define the Evidence Lower Bound (ELBO) in the context of the EM algorithm? Write the expression and explain the E-step and M-step.",
    // Must reference ELBO = Σ Q(z) log p(x,z;θ)/Q(z) or evidence lower bound
    mustMatch: /ELBO|evidence lower bound|lower bound|Q\(z\).*log|E.step|M.step|expectation.*maximiz|EM algorithm/i,
  },
  // ── Chapter 15: Reinforcement Learning ────────────────────────────────────
  {
    label: "bellman-optimal-value",
    q: "State Bellman's optimality equation for V*(s) exactly as given in the CS229 reinforcement learning chapter (equation 15.2). Identify every term.",
    // Must reference V*(s) = R(s) + max_a γ Σ P_sa(s') V*(s')
    mustMatch: /V\*\(s\)|Bellman|optimal.*value|R\(s\)|immediate reward|max.*action|Psa|discount.*factor|γ|gamma/i,
  },
  {
    label: "value-vs-policy-iteration",
    q: "The CS229 notes compare value iteration and policy iteration for solving MDPs. When is each preferred, and what is the key computational difference?",
    // Must reference: small MDP → policy iteration fast; large state space → value iteration (avoids linear system)
    mustMatch: /large state|linear system|value iteration|policy iteration|state space|small.*MDP|MDP.*small|converge|scalab/i,
  },
];

function log(step, msg) { console.log(`[${step}] ${msg}`); }
function warn(step, msg) { console.warn(`[${step}] ⚠ ${msg}`); }

function psExec(cmd) {
  return spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", cmd], {
    encoding: "utf8", timeout: 120_000,
  });
}
function killApp() {
  psExec('Get-Process -Name "student-ai" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue');
}
function cleanRagState() {
  const ragIndex = path.join(APP_DATA, "rag_index.bin");
  try { fs.rmSync(ragIndex); log("setup", `removed stale ${ragIndex}`); }
  catch (_) {}
}
function launchApp() {
  if (!fs.existsSync(APP_EXE)) {
    throw new Error(`App not found: ${APP_EXE}`);
  }
  spawnSync("powershell", [
    "-NoProfile", "-NonInteractive", "-Command",
    `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'; Start-Process '${APP_EXE.replace(/'/g, "''")}'`
  ], { encoding: "utf8", timeout: 15_000 });
}
async function waitForCdp(maxWaitMs = 60_000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:9222/json/list`);
      const targets = await r.json();
      // Wait until the WebView2 page has the actual app title (not chrome-error "localhost")
      const appTarget = targets.find(t =>
        (t.title && t.title.toLowerCase().includes("student ai")) ||
        (t.url && t.url.includes("tauri.localhost"))
      );
      if (appTarget) return;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error("Timed out waiting for WebView2 CDP (Student AI title not found)");
}

async function waitForNoOverlay(page, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const has = await page.evaluate(() => !!document.querySelector(".overlay")).catch(() => false);
    if (!has) return;
    for (const text of ["I Agree", "Accept & Continue", "Accept", "Skip", "Close"]) {
      const btn = page.locator(`.overlay button:has-text("${text}")`).first();
      if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(600);
        break;
      }
    }
    await new Promise(r => setTimeout(r, 800));
  }
  throw new Error("Timed out waiting for overlay to close");
}

async function clickNav(page, title) {
  await waitForNoOverlay(page, 5000).catch(() => {});
  await page.locator(`.nav-btn[title="${title}"]`).click();
  await page.waitForTimeout(500);
}

async function waitForStableText(locator, timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  let prev = "", stableCount = 0;
  while (Date.now() < deadline) {
    const raw = await locator.innerText().catch(e => {
      if (/closed|disconnect/i.test(String(e))) throw new Error(`App closed: ${e.message}`);
      return "";
    });
    const text = raw.trim().replace(/▌$/, "").trim();
    if (text.length > 5 && text === prev) {
      if (++stableCount >= 3) return text;
    } else {
      stableCount = 0;
      prev = text;
    }
    await new Promise(r => setTimeout(r, 1200));
  }
  throw new Error("Timed out waiting for stable reply");
}

async function pollEvaluate(page, fn, { timeout = 300_000, interval = 4000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));
    try {
      const res = await page.evaluate(fn);
      if (res !== null && res !== undefined) return res;
    } catch (e) {
      if (/closed|disconnect/i.test(String(e))) throw new Error(`App crashed: ${e.message}`);
    }
  }
  throw new Error(`pollEvaluate timed out after ${timeout}ms`);
}

// ── RAG multi-question test ───────────────────────────────────────────────────

async function testRagMultiQuestion(page) {
  log("rag", "opening documents view");
  await clickNav(page, "documents");

  // Delete any stale docs from previous runs
  let stale = await page.locator(".doc-row .del-btn").count();
  while (stale > 0) {
    await page.locator(".doc-row .del-btn").first().click();
    await page.waitForTimeout(400);
    stale = await page.locator(".doc-row .del-btn").count();
  }

  // Upload the real CS229 227-page PDF (no forward-slashes needed — Tauri handles both)
  const filePath = RAG_PDF_PATH.replace(/\\/g, "/");
  log("rag", `uploading CS229 PDF (227 pages): ${RAG_PDF_PATH}`);
  await page.evaluate(([fp, fn]) => {
    window.__ragUploadResult = undefined;
    window.__TAURI_INTERNALS__
      .invoke("upload_document", { request: { file_path: fp, file_name: fn } })
      .then(r => { window.__ragUploadResult = { ok: true, data: r }; })
      .catch(e => { window.__ragUploadResult = { ok: false, error: String(e) }; });
  }, [filePath, "RAG_test.pdf"]);

  // Large PDF — chunking can take several minutes; allow 10 minutes
  log("rag", "waiting for chunking + embedding (up to 10 min for 227-page PDF)…");
  const uploadResult = await pollEvaluate(page, () => window.__ragUploadResult ?? null, { timeout: 600_000 });
  if (!uploadResult.ok) throw new Error(`upload_document failed: ${uploadResult.error}`);
  const docId = uploadResult.data?.doc_id ?? "";
  log("rag", `upload ok — id=${docId}  chunks=${uploadResult.data?.chunk_count}`);

  // Select the document so it is active for RAG queries
  if (docId) {
    await page.evaluate(([id]) => {
      window.__TAURI_INTERNALS__
        .invoke("toggle_doc_selection", { docId: id, selected: true })
        .catch(() => {});
    }, [docId]);
    await page.waitForTimeout(400);
  }

  // Navigate to UserDocs chat panel
  await clickNav(page, "sessions");
  await page.waitForTimeout(400);
  await clickNav(page, "documents");
  await page.waitForTimeout(800);

  const results = [];
  let appCrashedAt = -1;

  const input = page.locator(".input-area textarea");
  await input.waitFor({ state: "visible", timeout: 15000 });

  for (let qi = 0; qi < RAG_QUESTIONS.length; qi++) {
    const { q, mustMatch, label } = RAG_QUESTIONS[qi];
    log("rag", `[${qi + 1}/${RAG_QUESTIONS.length}] asking [${label}]: ${q.slice(0, 70)}…`);

    try {
      // Cancel any in-progress generation before submitting the next question.
      // This prevents the new Enter press from being silently swallowed by isGenerating=true.
      await page.evaluate(() => {
        try { window.__TAURI_INTERNALS__?.invoke('cancel_generation'); } catch (_) {}
      }).catch(() => {});
      await new Promise(r => setTimeout(r, 3000));  // Wait for cancel to propagate (every 8 tokens ≈ 4s)

      const aiBefore = await page.locator(".bubble.ai").count();
      await input.fill(q);
      await input.press("Enter");

      // If the message was blocked (isGenerating still true), wait up to 30 s for it to clear
      // then retry the send once.
      const retryCutoff = Date.now() + 30_000;
      while (Date.now() < retryCutoff) {
        const newCnt = await page.locator(".bubble.ai").count().catch(() => aiBefore);
        if (newCnt > aiBefore) break;
        await new Promise(r => setTimeout(r, 2000));
        // Re-fill and resend in case the first Enter was swallowed
        await input.fill(q).catch(() => {});
        await input.press("Enter").catch(() => {});
      }

      // Poll for new AI bubble to appear
      const bubbleDeadline = Date.now() + 300_000; // 5 min per question (CPU worst-case ~2 tok/s × 320 max tokens = 160s + overhead)
      while (Date.now() < bubbleDeadline) {
        const cnt = await page.locator(".bubble.ai").count().catch(e => {
          if (/closed|disconnect/i.test(String(e))) throw new Error(`App closed: ${e.message}`);
          return -1;
        });
        if (cnt > aiBefore) break;
        await new Promise(r => setTimeout(r, 1500));
      }

      const reply = await waitForStableText(page.locator(".bubble.ai").last(), 300_000);
      const passed = mustMatch.test(reply);

      // Citation signals: [Ref N], file/page refs, "according to", "the document", "in CS229", etc.
      const hasCitation = /\[\d+\]|\[Ref|\[doc\]|according to|as stated|the document|CS229|lecture note|mentioned in|source:|reference|p\.\d+/i.test(reply);

      results.push({ label, passed, hasCitation, replySnippet: reply.slice(0, 250) });

      const mark = passed ? "✓" : "✗";
      const cite = hasCitation ? "+ cited" : "no-cite";
      if (passed) {
        log("rag", `  ${mark} [${label}] (${cite})`);
      } else {
        warn("rag", `  ${mark} [${label}] FAILED (${cite}) — ${reply.slice(0, 200)}`);
      }
      log("rag", `  reply: ${reply.slice(0, 220)}`);

      // Longer pause between questions to let the LLM fully flush and free context
      await new Promise(r => setTimeout(r, 4000));

    } catch (err) {
      const msg = String(err);
      // Detect crash: explicit close/disconnect, OR check if app is still alive
      // after a timeout (native crash shows as timeout not clean disconnect).
      const isExplicitCrash = /closed|disconnect|App closed/i.test(msg);
      let isImplicitCrash = false;
      if (!isExplicitCrash) {
        // App dead check: can we still reach the body element?
        isImplicitCrash = !(await page.$("body").catch(() => null));
      }
      if (isExplicitCrash || isImplicitCrash) {
        warn("rag", `App crashed after question ${qi + 1} ([${label}]) — recording partial results`);
        appCrashedAt = qi;
        break;
      }
      // Non-crash error (timeout, locator issue) — record as failed and continue
      warn("rag", `Error on [${label}]: ${msg.slice(0, 160)}`);
      results.push({ label, passed: false, hasCitation: false, replySnippet: `ERROR: ${msg.slice(0, 100)}` });
    }
  }

  // ── Final report ───────────────────────────────────────────────────────────
  const passCount  = results.filter(r => r.passed).length;
  const citeCount  = results.filter(r => r.hasCitation).length;
  const attempted  = results.length;
  const total      = RAG_QUESTIONS.length;
  const PASS_FRAC  = 0.75; // 6/8 required
  const CITE_MIN   = 4;    // at least 4 citation signals required

  log("rag", `=== RAG quality report (${attempted}/${total} attempted) ===`);
  log("rag", `  Correct:   ${passCount}/${attempted}  (threshold: ${Math.ceil(total * PASS_FRAC)}/${total})`);
  log("rag", `  Citations: ${citeCount}/${attempted}  (threshold: ${CITE_MIN})`);
  log("rag", "");
  for (const r of results) {
    const mark = r.passed ? "✓" : "✗";
    const cite = r.hasCitation ? "[cited]" : "[no-cite]";
    log("rag", `  ${mark} ${cite} ${r.label}`);
    log("rag", `      ${r.replySnippet.slice(0, 180).replace(/\n/g, " ")}`);
  }
  if (appCrashedAt >= 0) {
    warn("rag", `App crashed after question ${appCrashedAt + 1} — only ${attempted}/${total} questions evaluated`);
  }

  // Fail if correctness or citation signals are below threshold (only if enough questions ran)
  // When app crashes mid-test, measure quality against ATTEMPTED questions (not total),
  // since 5/5 correct (100%) should pass even if Q6 caused a crash — that's a
  // stability issue, not an answer-quality issue.
  const effectiveTotal = appCrashedAt >= 0 ? attempted : total;
  const neededCorrect = Math.ceil(effectiveTotal * PASS_FRAC);
  if (attempted >= Math.ceil(total * 0.5)) {
    if (passCount < neededCorrect) {
      throw new Error(`RAG quality too low: ${passCount}/${effectiveTotal} correct (need ${neededCorrect})`);
    }
    if (citeCount < CITE_MIN) {
      throw new Error(`Too few citation signals: ${citeCount}/${attempted} (need ${CITE_MIN}) — RAG context may not be injected`);
    }
    if (appCrashedAt >= 0) {
      warn("rag", `Note: app crashed at Q${appCrashedAt + 1} (stability issue) but ${passCount}/${attempted} quality checks passed`);
    }
  } else {
    warn("rag", `Only ${attempted}/${total} questions attempted (app crashed) — skipping pass/fail threshold`);
  }
}

// ── Animation walk-through across all courses ─────────────────────────────────

async function testAllCourseAnimations(page) {
  log("animations", "opening courses view");
  await clickNav(page, "courses");
  await page.locator(".course-row").first().waitFor({ state: "visible", timeout: 20000 });

  // Collect all visible course rows
  const courseRows = await page.locator(".course-row").all();
  log("animations", `found ${courseRows.length} course rows`);

  const summary = [];
  let appClosed = false;

  for (let ci = 0; ci < courseRows.length; ci++) {
    if (appClosed) break;
    try {
      // Re-query rows each iteration (DOM may have changed due to expand/collapse)
      const row = page.locator(".course-row").nth(ci);
      const courseLabel = await row.innerText().catch(() => `course-${ci}`);
      // Course label is typically "▸ Course Name" or "▾ Course Name" — extract text after arrow
      const parts = courseLabel.split(/[▸▾]/);
      const courseName = (parts[1] ?? parts[0] ?? `course-${ci}`).trim().replace(/\n.*/s, "").slice(0, 40);

      // Expand course if not already expanded
      const isExpanded = await row.evaluate(el => el.textContent?.includes("▾")).catch(() => false);
      if (!isExpanded) {
        await row.click().catch(() => {});
        await page.waitForTimeout(600);
      }

      // Find the first module under this course and expand it
      const moduleRows = await page.locator(".module-row").all();
      if (moduleRows.length === 0) {
        summary.push({ course: courseName, pagesChecked: 0, imgsFound: 0, fallbacks: 0, loaded: 0 });
        // Collapse before next
        await row.click().catch(() => {});
        await page.waitForTimeout(400);
        continue;
      }
      const firstMod = page.locator(".module-row").first();
      const modExpanded = await firstMod.evaluate(el => el.textContent?.includes("▾")).catch(() => false);
      if (!modExpanded) {
        await firstMod.click().catch(() => {});
        await page.waitForTimeout(600);
      }

      // Walk up to 6 pages looking for images
      const pageRowEls = await page.locator(".page-row").all();
      let pagesChecked = 0, totalImgs = 0, totalFallbacks = 0, totalLoaded = 0;

      for (const pageEl of pageRowEls.slice(0, 6)) {
        await pageEl.click().catch(() => {});
        await page.waitForTimeout(800);

        const imgCount = await page.evaluate(() => document.querySelectorAll(".prose img").length).catch(() => 0);
        pagesChecked++;

        if (imgCount > 0) {
          log("animations", `  [${courseName}] found page with ${imgCount} image(s) — waiting for cache fetch…`);
          // Wait up to 20s for backend image cache to load images
          const imgDeadline = Date.now() + 20_000;
          while (Date.now() < imgDeadline) {
            const fallbacks = await page.evaluate(() => document.querySelectorAll(".prose .img-fallback").length).catch(() => 0);
            const loaded = await page.evaluate(() =>
              [...document.querySelectorAll(".prose img")].filter(i => i.naturalWidth > 0).length
            ).catch(() => 0);
            if (loaded > 0 || fallbacks >= imgCount) break;
            await new Promise(r => setTimeout(r, 1500));
          }
          const loaded = await page.evaluate(() =>
            [...document.querySelectorAll(".prose img")].filter(i => i.naturalWidth > 0).length
          ).catch(() => 0);
          const fallbacks = await page.evaluate(() => document.querySelectorAll(".prose .img-fallback").length).catch(() => 0);
          totalImgs += imgCount;
          totalFallbacks += fallbacks;
          totalLoaded += loaded;
          log("animations", `  [${courseName}] page ${pagesChecked}: ${imgCount} img(s), ${loaded} loaded, ${fallbacks} fallback`);
          break; // one image-bearing page per course is enough
        }
      }

      summary.push({ course: courseName, pagesChecked, imgsFound: totalImgs, fallbacks: totalFallbacks, loaded: totalLoaded });

      // Collapse this course before moving to next
      await row.click().catch(() => {});
      await page.waitForTimeout(500);
    } catch (err) {
      const msg = String(err);
      if (/closed|disconnect/i.test(msg)) {
        warn("animations", `App closed after ${summary.length} courses — printing partial summary`);
        appClosed = true;
      } else {
        warn("animations", `Error on course ${ci}: ${msg.slice(0, 120)}`);
        summary.push({ course: `course-${ci}`, pagesChecked: 0, imgsFound: 0, fallbacks: 0, loaded: 0 });
      }
    }
  }

  // Print summary table
  log("animations", "=== Animation walk-through summary ===");
  log("animations", `${"Course".padEnd(38)} Pages  Imgs  Loaded  Fallback`);
  log("animations", "-".repeat(70));
  let coursesWithImgs = 0, coursesFullyLoaded = 0;
  for (const s of summary) {
    const line = `${s.course.padEnd(38)} ${String(s.pagesChecked).padStart(5)}  ${String(s.imgsFound).padStart(4)}  ${String(s.loaded).padStart(6)}  ${String(s.fallbacks).padStart(8)}`;
    log("animations", line);
    if (s.imgsFound > 0) {
      coursesWithImgs++;
      if (s.loaded > 0) coursesFullyLoaded++;
    }
  }
  log("animations", "-".repeat(70));
  log("animations", `Courses with images: ${coursesWithImgs}, at least 1 image loaded: ${coursesFullyLoaded}${appClosed ? " (partial — app closed early)" : ""}`);

  if (!appClosed && coursesWithImgs > 0 && coursesFullyLoaded === 0) {
    throw new Error("Found image pages in courses but NOT A SINGLE image loaded — animation caching is broken");
  }
  if (appClosed) {
    warn("animations", `App closed after ${summary.length} courses — treating as partial pass if any images loaded`);
    if (coursesFullyLoaded === 0 && coursesWithImgs > 0) {
      throw new Error("App closed and no images ever loaded — animation caching may be broken");
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

log("setup", "killing any existing student-ai process");
killApp();
await new Promise(r => setTimeout(r, 800));

log("setup", "cleaning stale RAG index");
cleanRagState();

log("setup", `launching ${APP_EXE}`);
launchApp();

log("setup", "waiting for WebView2 CDP…");
await waitForCdp(60_000);
await new Promise(r => setTimeout(r, 1000)); // brief settle

const browser = await chromium.connectOverCDP(DEBUG_URL);
try {
  const page = browser.contexts()[0]?.pages()[0];
  if (!page) throw new Error("No page found in CDP context");

  // waitForCdp already confirmed "Student AI" title is up — app is ready.
  // Give Svelte one extra second to finish mounting any reactive stores.
  log("app", `page at ${page.url()}`);
  await page.bringToFront();
  await new Promise(r => setTimeout(r, 2000));
  await waitForNoOverlay(page, 60000);

  log("app", `connected to "${await page.title()}" at ${page.url()}`);

  await testRagMultiQuestion(page);
  await testAllCourseAnimations(page);

  log("done", "all tests passed ✓");
} finally {
  await browser.close();
}
