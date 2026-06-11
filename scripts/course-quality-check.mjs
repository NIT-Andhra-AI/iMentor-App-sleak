/**
 * Course Quality Check — Student AI
 *
 * Opens the installed app via CDP, walks every page of every course
 * (scrolling top-to-bottom on each), and checks that all content types
 * render correctly: text, images, GIFs, animations, equations, tables,
 * Mermaid diagrams, code blocks, and interactive demo frames.
 *
 * Produces:
 *   reports/course-quality-<timestamp>.json   — machine-readable detail
 *   reports/course-quality-<timestamp>.txt    — human-readable summary
 *   reports/course-quality-screenshots/       — full-page screenshot per page
 *
 * Usage:
 *   node scripts/course-quality-check.mjs
 *
 * Environment overrides:
 *   STUDENT_AI_CDP_URL   CDP endpoint  (default: http://127.0.0.1:9222)
 *   STUDENT_AI_EXE       Path to exe   (default: %LOCALAPPDATA%\Student AI\student-ai.exe)
 *   SKIP_SCREENSHOTS=1   Disable per-page screenshots (faster)
 *   COURSE_ID=algorithms  Limit to a single course (for quick spot-checks)
 */

import { chromium } from "../tests/desktop-e2e/node_modules/playwright/index.mjs";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ── Config ────────────────────────────────────────────────────────────────────

const DEBUG_URL     = process.env.STUDENT_AI_CDP_URL ?? "http://127.0.0.1:9222";
const APP_EXE       = process.env.STUDENT_AI_EXE
  ?? path.join(process.env.LOCALAPPDATA ?? "", "Student AI", "student-ai.exe");
const SKIP_SHOTS    = process.env.SKIP_SCREENSHOTS === "1";
const ONLY_COURSE   = process.env.COURSE_ID ?? null;

const REPO_ROOT     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS_DIR   = path.join(REPO_ROOT, "reports");
const SHOT_DIR      = path.join(REPORTS_DIR, "course-quality-screenshots");

const TIMESTAMP     = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const REPORT_JSON   = path.join(REPORTS_DIR, `course-quality-${TIMESTAMP}.json`);
const REPORT_TXT    = path.join(REPORTS_DIR, `course-quality-${TIMESTAMP}.txt`);

// Severity levels for issues
const SEV = { ERROR: "ERROR", WARN: "WARN", INFO: "INFO" };

// ── Source markdown checks (static) ─────────────────────────────────────────

function scanMarkdownDemoFenceIssues() {
  const issues = [];
  const coursesDir = path.join(REPO_ROOT, "assets", "courses");
  if (!fs.existsSync(coursesDir)) return issues;

  const courseDirs = fs.readdirSync(coursesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const courseId of courseDirs) {
    if (ONLY_COURSE && !courseId.toLowerCase().includes(ONLY_COURSE.toLowerCase())) continue;

    const wikiDir = path.join(coursesDir, courseId, "wiki");
    if (!fs.existsSync(wikiDir)) continue;

    const mdFiles = fs.readdirSync(wikiDir)
      .filter(f => f.toLowerCase().endsWith(".md"));

    for (const fileName of mdFiles) {
      const filePath = path.join(wikiDir, fileName);
      const raw = fs.readFileSync(filePath, "utf-8");
      const lines = raw.split(/\r?\n/);
      let inDemo = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (/^:::demo\s*$/.test(line)) {
          if (inDemo) {
            issues.push({
              severity: SEV.ERROR,
              category: "demo-source",
              course: courseId,
              file: path.relative(REPO_ROOT, filePath),
              line: i + 1,
              message: "Found :::demo inside an open demo block (likely used as a closing fence instead of :::)",
            });
          }
          inDemo = true;
          continue;
        }

        if (/^:::\s*$/.test(line) && inDemo) {
          inDemo = false;
        }
      }

      if (inDemo) {
        issues.push({
          severity: SEV.ERROR,
          category: "demo-source",
          course: courseId,
          file: path.relative(REPO_ROOT, filePath),
          line: lines.length,
          message: "Unclosed :::demo block at end of file",
        });
      }
    }
  }

  return issues;
}

// ── Logging ───────────────────────────────────────────────────────────────────

function log(step, message) {
  process.stdout.write(`[${step}] ${message}\n`);
}

// ── App launch helpers ────────────────────────────────────────────────────────

function killApp() {
  spawnSync("powershell", [
    "-NoProfile", "-NonInteractive", "-Command",
    'Get-Process -Name "student-ai" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue',
  ], { encoding: "utf8", timeout: 30_000 });
}

function launchApp() {
  if (!fs.existsSync(APP_EXE)) {
    throw new Error(`Installed app not found at: ${APP_EXE}\nRun the NSIS installer first, or set STUDENT_AI_EXE.`);
  }
  spawnSync("powershell", [
    "-NoProfile", "-NonInteractive", "-Command",
    `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'; Start-Process '${APP_EXE.replace(/'/g, "''")}'`,
  ], { encoding: "utf8", timeout: 15_000 });
}

async function waitForCdp(maxWaitMs = 60_000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const r   = await fetch(`${DEBUG_URL}/json/list`);
      const tgts = await r.json();
      const hit  = tgts.find(t =>
        (t.title && t.title.toLowerCase().includes("student ai")) ||
        (t.url   && t.url.includes("tauri.localhost"))
      );
      if (hit) return;
    } catch (_) { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error("Timed out waiting for WebView2 CDP — Student AI title not found");
}

// ── Modal dismissal ───────────────────────────────────────────────────────────

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
      await page.waitForTimeout(500);
    }
  }
  // Wait for any overlay to clear
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const hasOverlay = await page.evaluate(
      () => !!document.querySelector(".overlay")
    ).catch(() => false);
    if (!hasOverlay) break;
    for (const text of ["I Agree", "Accept & Continue", "Accept", "Skip", "Close"]) {
      const btn = page.locator(`.overlay button:has-text("${text}")`).first();
      if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(500);
        break;
      }
    }
    await new Promise(r => setTimeout(r, 800));
  }
}

// ── Scroll helper ─────────────────────────────────────────────────────────────

async function scrollTopToBottom(page) {
  // Scroll the .page-area (the WikiViewer scroll container) from top to bottom
  // in increments so lazy-loaded content can render.
  await page.evaluate(async () => {
    const area = document.querySelector(".page-area");
    if (!area) return;
    area.scrollTo({ top: 0, behavior: "instant" });
    await new Promise(r => setTimeout(r, 100));

    const step       = Math.max(200, area.clientHeight * 0.6);
    const totalHeight = area.scrollHeight;
    let pos = 0;
    while (pos < totalHeight) {
      pos = Math.min(pos + step, totalHeight);
      area.scrollTo({ top: pos, behavior: "smooth" });
      // Yield to allow paint / image decode / mermaid render
      await new Promise(r => setTimeout(r, 280));
    }
    // Pause at bottom to let any deferred images finish
    await new Promise(r => setTimeout(r, 800));
    area.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(400);
}

// ── Demo interaction helper ─────────────────────────────────────────────────

async function expandInteractiveDemos(page) {
  return await page.evaluate(async () => {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    const wraps = Array.from(document.querySelectorAll(".demo-wrap"));

    const result = {
      totalDemoWraps: wraps.length,
      collapsedBefore: 0,
      expandedFrames: 0,
      stillCollapsed: 0,
      invalidFrameSrc: 0,
    };

    // Expand all collapsed demo previews.
    for (const wrap of wraps) {
      const hasFrame = !!wrap.querySelector("iframe.demo-frame");
      const preview = wrap.querySelector(".demo-preview");
      if (!hasFrame && preview) {
        result.collapsedBefore++;
        preview.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await delay(120);
      }
    }

    // Give Svelte time to mount iframe elements.
    await delay(350);

    for (const wrap of wraps) {
      const frame = wrap.querySelector("iframe.demo-frame");
      const preview = wrap.querySelector(".demo-preview");
      if (frame) {
        result.expandedFrames++;
        const src = frame.getAttribute("src") || "";
        if (!src.startsWith("data:text/html")) result.invalidFrameSrc++;
      } else if (preview) {
        result.stillCollapsed++;
      }
    }

    return result;
  }).catch(() => null);
}

// ── Screenshot helper ─────────────────────────────────────────────────────────

async function takeScreenshot(page, filePath) {
  if (SKIP_SHOTS) return null;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage: true }).catch(e => {
    log("screenshot", `Failed: ${e.message}`);
  });
  return filePath;
}

// ── DOM quality analysis (runs inside the browser) ───────────────────────────

const DOM_AUDIT_FN = () => {
  const result = {
    // ── Page structure
    hasErrorBanner:       false,
    errorBannerText:      "",
    hasLoadingState:      false,
    pageContentExists:    false,
    breadcrumbText:       "",

    // ── Text / prose
    proseBlockCount:      0,
    proseTextLength:      0,
    rawMarkdownLeaks:     [],   // list of snippet strings that look like unrendered markdown

    // ── Images / GIFs / animations
    totalImages:          0,
    loadedImages:         0,
    brokenImages:         0,    // naturalWidth === 0 and complete (truly broken)
    fallbackDivCount:     0,    // .img-fallback elements still showing
    imageUrls:            [],   // list of src values

    // ── Mermaid diagrams
    mermaidBlockCount:    0,
    mermaidRendered:      0,    // contains <svg>
    mermaidErrors:        0,    // shows error message
    mermaidStuck:         0,    // still showing "Rendering diagram…"
    mermaidErrorDetails:  [],   // per-block info

    // ── Tables
    tableCount:           0,
    tablesWithRows:       0,

    // ── Code blocks
    codeBlockCount:       0,

    // ── Demo frames
    demoWrapCount:        0,

    // ── Equations (raw LaTeX not processed by KaTeX in WikiViewer)
    rawEquationPatterns:  [],   // snippets containing unrendered $...$ or \[...\]

    // ── Console noise (collected separately but mirrored here)
    // (populated by Node.js page.on listeners, not inside evaluate)
  };

  // ── Error banner ─────────────────────────────────────────────────────────
  const errBanner = document.querySelector(".error-banner");
  if (errBanner) {
    result.hasErrorBanner  = true;
    result.errorBannerText = (errBanner.textContent ?? "").trim().slice(0, 200);
  }

  // ── Loading spinner still visible ────────────────────────────────────────
  result.hasLoadingState = !!document.querySelector(".loading-state");

  // ── Page content container ────────────────────────────────────────────────
  result.pageContentExists = !!document.querySelector(".page-content");

  // ── Breadcrumb ────────────────────────────────────────────────────────────
  const bc = document.querySelector(".breadcrumb");
  result.breadcrumbText = bc ? (bc.textContent ?? "").replace(/\s+/g, " ").trim() : "";

  // ── Prose blocks (rendered HTML) ─────────────────────────────────────────
  const proseEls = document.querySelectorAll(".prose");
  result.proseBlockCount = proseEls.length;

  const RAW_MD_PATTERNS = [
    // Headings not parsed → showing "## Some heading" as plain text
    { re: /^#{1,6} \S/m,   label: "raw-heading" },
    // Bold/italic markers
    { re: /\*\*[^*]+\*\*/,  label: "raw-bold" },
    { re: /\b__[^_]+__\b/,  label: "raw-underline-bold" },
    // Horizontal rule
    { re: /^---+$/m,        label: "raw-hr" },
    // Unordered list items (but only if they appear as a naked "- " at the start of a text node)
    { re: /^- \S/m,         label: "raw-list-item" },
    // Block-quote
    { re: /^> \S/m,         label: "raw-blockquote" },
    // Inline code
    { re: /`[^`]+`/,        label: "raw-inline-code" },
    // Triple backtick fence
    { re: /^```/m,          label: "raw-code-fence" },
  ];

  for (const el of Array.from(proseEls)) {
    // Use textContent of non-HTML child text nodes only (avoids counting rendered elements)
    const text = el.textContent ?? "";
    result.proseTextLength += text.length;

    // Walk direct text nodes and check for markdown patterns
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const raw = node.textContent ?? "";
      for (const { re, label } of RAW_MD_PATTERNS) {
        if (re.test(raw)) {
          const snippet = raw.slice(0, 120).replace(/\s+/g, " ").trim();
          if (!result.rawMarkdownLeaks.find(l => l.label === label && l.snippet === snippet)) {
            result.rawMarkdownLeaks.push({ label, snippet });
          }
        }
      }
    }
  }

  // ── Images / GIFs / animations ────────────────────────────────────────────
  const imgs = document.querySelectorAll(".prose img, .page-content img");
  result.totalImages = imgs.length;
  for (const img of Array.from(imgs)) {
    const isLoaded  = img.complete && img.naturalWidth > 0;
    const isBroken  = img.complete && img.naturalWidth === 0 && !img.dataset.cacheRetried;
    if (isLoaded)  result.loadedImages++;
    if (isBroken)  result.brokenImages++;
    const src = img.src || img.dataset.originalSrc || "";
    if (src) result.imageUrls.push(src.slice(0, 200));
  }
  const fallbacks = document.querySelectorAll(".img-fallback");
  result.fallbackDivCount = fallbacks.length;

  // ── Mermaid diagrams ──────────────────────────────────────────────────────
  const mmdWraps = document.querySelectorAll(".mermaid-wrap");
  result.mermaidBlockCount = mmdWraps.length;
  for (const wrap of Array.from(mmdWraps)) {
    const html        = wrap.innerHTML ?? "";
    const hasSvg      = !!wrap.querySelector("svg");
    const hasLoading  = (wrap.textContent ?? "").includes("Rendering diagram");
    const hasError    = (wrap.textContent ?? "").includes("syntax error") ||
                        (wrap.textContent ?? "").includes("Diagram syntax error");

    if (hasSvg) {
      result.mermaidRendered++;
      result.mermaidErrorDetails.push({ status: "ok" });
    } else if (hasError) {
      result.mermaidErrors++;
      const snippet = (wrap.textContent ?? "").slice(0, 200).replace(/\s+/g, " ").trim();
      result.mermaidErrorDetails.push({ status: "error", snippet });
    } else if (hasLoading) {
      result.mermaidStuck++;
      result.mermaidErrorDetails.push({ status: "stuck-loading" });
    } else {
      result.mermaidErrors++;
      result.mermaidErrorDetails.push({ status: "unknown-no-svg", html: html.slice(0, 200) });
    }
  }

  // ── Tables ────────────────────────────────────────────────────────────────
  const tables = document.querySelectorAll(".prose table");
  result.tableCount = tables.length;
  for (const tbl of Array.from(tables)) {
    if (tbl.querySelectorAll("tr").length > 0) result.tablesWithRows++;
  }

  // ── Code blocks ──────────────────────────────────────────────────────────
  result.codeBlockCount = document.querySelectorAll(".code-block").length;

  // ── Demo frames ──────────────────────────────────────────────────────────
  result.demoWrapCount = document.querySelectorAll(".demo-wrap").length;

  // ── Raw equation check in prose text ─────────────────────────────────────
  // WikiViewer uses `marked` without KaTeX — raw $...$ or \[...\] will show
  // as plain text in prose, which is a content rendering gap worth flagging.
  const EQ_RE = [
    { re: /\$\$[\s\S]{2,80}\$\$/,    label: "display-math-$$"    },
    { re: /\$[^$\n]{2,60}\$/,        label: "inline-math-$"      },
    { re: /\\\[[\s\S]{2,80}\\\]/,    label: "display-math-\\[\\]" },
    { re: /\\\([^)]{2,60}\\\)/,      label: "inline-math-\\(\\)"  },
  ];
  for (const el of Array.from(proseEls)) {
    const text = el.textContent ?? "";
    for (const { re, label } of EQ_RE) {
      const m = re.exec(text);
      if (m) {
        const snippet = m[0].slice(0, 80).replace(/\s+/g, " ").trim();
        if (!result.rawEquationPatterns.find(p => p.label === label && p.snippet === snippet)) {
          result.rawEquationPatterns.push({ label, snippet });
        }
      }
    }
  }

  return result;
};

// ── Issue builder ─────────────────────────────────────────────────────────────

function buildIssues(audit, consoleErrors, demoInteraction = null) {
  const issues = [];

  const add = (sev, category, message, detail = null) =>
    issues.push({ severity: sev, category, message, ...(detail ? { detail } : {}) });

  // Error banner = page failed to load
  if (audit.hasErrorBanner) {
    add(SEV.ERROR, "load", `Page failed to load: ${audit.errorBannerText}`);
  }

  // Loading spinner still visible
  if (audit.hasLoadingState) {
    add(SEV.WARN, "load", "Page still in loading state — content may be incomplete");
  }

  // No page content at all
  if (!audit.pageContentExists && !audit.hasErrorBanner) {
    add(SEV.ERROR, "text", "No .page-content element found — page did not render");
  }

  // Empty prose
  if (audit.pageContentExists && audit.proseBlockCount === 0 && audit.codeBlockCount === 0 && audit.demoWrapCount === 0 && audit.mermaidBlockCount === 0) {
    add(SEV.WARN, "text", "Page content container is empty (no prose, code, demo, or mermaid blocks)");
  }

  if (audit.proseBlockCount > 0 && audit.proseTextLength < 60) {
    add(SEV.WARN, "text", `Prose text very short (${audit.proseTextLength} chars) — possible render failure`);
  }

  // Raw markdown leaks
  for (const leak of audit.rawMarkdownLeaks) {
    add(SEV.WARN, "text", `Unrendered markdown detected (${leak.label})`, leak.snippet);
  }

  // Broken images
  if (audit.fallbackDivCount > 0) {
    add(SEV.WARN, "image", `${audit.fallbackDivCount} image(s) failed to load — showing fallback placeholder`);
  }
  if (audit.brokenImages > 0) {
    add(SEV.WARN, "image", `${audit.brokenImages} image(s) have naturalWidth=0 (broken but no fallback shown yet)`);
  }

  // Mermaid errors
  if (audit.mermaidErrors > 0) {
    for (const d of audit.mermaidErrorDetails.filter(d => d.status !== "ok")) {
      const msg = d.status === "error"
        ? `Mermaid render error: ${d.snippet ?? ""}`
        : d.status === "stuck-loading"
          ? "Mermaid diagram stuck in 'Rendering diagram…' state"
          : `Mermaid block has no SVG (status=${d.status}): ${d.html ?? ""}`;
      add(SEV.ERROR, "mermaid", msg);
    }
  }
  if (audit.mermaidStuck > 0 && audit.mermaidErrors === 0) {
    add(SEV.WARN, "mermaid", `${audit.mermaidStuck} Mermaid diagram(s) still loading after scroll-wait`);
  }

  // Tables with no rows (possible rendering failure)
  if (audit.tableCount > 0 && audit.tablesWithRows === 0) {
    add(SEV.WARN, "table", `Found ${audit.tableCount} <table> element(s) but none contain rows — tables may not have rendered`);
  }

  // Raw equation patterns in prose
  for (const eq of audit.rawEquationPatterns) {
    add(SEV.INFO, "equation", `Raw LaTeX/math notation visible as plain text (${eq.label}) — WikiViewer does not render KaTeX in pages`, eq.snippet);
  }

  // Demo interaction checks (visual intuition expands and mounts iframe)
  if (demoInteraction && demoInteraction.totalDemoWraps > 0) {
    if (demoInteraction.stillCollapsed > 0) {
      add(
        SEV.ERROR,
        "demo",
        `${demoInteraction.stillCollapsed} interactive demo(s) stayed collapsed after click-to-start`
      );
    }
    if (demoInteraction.expandedFrames === 0) {
      add(SEV.ERROR, "demo", "No demo iframe was mounted after attempting to expand interactive demos");
    }
    if (demoInteraction.invalidFrameSrc > 0) {
      add(SEV.WARN, "demo", `${demoInteraction.invalidFrameSrc} demo iframe(s) mounted with non data:text/html src`);
    }
  }

  // JS console errors
  for (const err of consoleErrors) {
    // Skip noisy but harmless Tauri/WebView2 noise
    if (/favicon|sourceMap|DevTools/i.test(err.text)) continue;
    add(SEV.ERROR, "js-error", `JS error: ${err.text.slice(0, 300)}`, err.location);
  }

  return issues;
}

// ── Main quality-check loop ───────────────────────────────────────────────────

async function runQualityCheck(page) {
  const sourceDemoFenceIssues = scanMarkdownDemoFenceIssues();

  const report = {
    startedAt:    new Date().toISOString(),
    endedAt:      "",
    durationSeconds: 0,
    appUrl:       page.url(),
    courses:      [],
    totalPages:   0,
    totalIssues:  { ERROR: 0, WARN: 0, INFO: 0 },
    sourceChecks: {
      demoFenceIssues: sourceDemoFenceIssues,
    },
  };

  // Source fence issues are hard failures because they break demo parsing.
  report.totalIssues.ERROR += sourceDemoFenceIssues.length;
  log("source", `Demo fence issues found in markdown: ${sourceDemoFenceIssues.length}`);

  // ── Navigate to Courses tab ───────────────────────────────────────────────
  log("nav", "Opening Courses tab");
  await page.locator('.nav-btn[title="courses"]').click({ timeout: 15_000 });
  await page.locator(".tree-list").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(600);

  // ── Collect course rows ───────────────────────────────────────────────────
  const courseRows = page.locator(".tree-list .course-row");
  const courseCount = await courseRows.count();
  log("courses", `Found ${courseCount} course row(s)`);

  if (courseCount === 0) {
    throw new Error("No .course-row elements found — is the Courses tab loaded?");
  }

  // ── Per-course loop ───────────────────────────────────────────────────────
  for (let ci = 0; ci < courseCount; ci++) {
    const courseRow = page.locator(".tree-list .course-row").nth(ci);
    await courseRow.scrollIntoViewIfNeeded();
    const courseTitle = (await courseRow.locator(".course-name").innerText().catch(() => `course-${ci + 1}`)).trim();

    if (ONLY_COURSE && !courseTitle.toLowerCase().includes(ONLY_COURSE.toLowerCase())) {
      log("skip", `Skipping course: ${courseTitle}`);
      continue;
    }

    log("course", `▶ [${ci + 1}/${courseCount}] ${courseTitle}`);

    // Expand the course
    await courseRow.click({ timeout: 10_000 });
    await page.waitForTimeout(500);

    // Expand ALL module rows
    const moduleRows = page.locator(".module-row");
    const moduleCount = await moduleRows.count();
    for (let mi = 0; mi < moduleCount; mi++) {
      const modRow = page.locator(".module-row").nth(mi);
      await modRow.scrollIntoViewIfNeeded().catch(() => {});
      const caretText = (await modRow.locator(".caret-sm").innerText().catch(() => "")).trim();
      if (caretText === "▸") {
        await modRow.click({ timeout: 8_000 }).catch(() => {});
        await page.waitForTimeout(120);
      }
    }

    const pageRows = page.locator(".page-row");
    const pageCount = await pageRows.count();
    log("course", `  ${moduleCount} module(s), ${pageCount} page(s)`);

    const courseResult = {
      title:          courseTitle,
      index:          ci + 1,
      moduleCount,
      pageCount,
      pages:          [],
      issuesSummary:  { ERROR: 0, WARN: 0, INFO: 0 },
    };

    // ── Per-page loop ─────────────────────────────────────────────────────
    for (let pi = 0; pi < pageCount; pi++) {
      const pageRow = page.locator(".page-row").nth(pi);
      await pageRow.scrollIntoViewIfNeeded().catch(() => {});
      const rawTitle = (await pageRow.innerText().catch(() => `page-${pi + 1}`)).trim();
      const pageTitle = rawTitle.replace(/\s+/g, " ").slice(0, 80);

      log("page", `  [${pi + 1}/${pageCount}] ${pageTitle}`);

      // ── Console error collector (per page) ───────────────────────────
      const consoleErrors = [];
      const jsErrors      = [];

      const consoleHandler = (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") {
          const loc = msg.location?.();
          consoleErrors.push({
            type:     msg.type(),
            text:     msg.text(),
            location: loc?.url ? `${loc.url}:${loc.lineNumber ?? 0}` : undefined,
          });
        }
      };
      const errorHandler = (err) => {
        jsErrors.push({ type: "pageerror", text: err.message });
      };

      page.on("console",   consoleHandler);
      page.on("pageerror", errorHandler);

      // ── Click page row ────────────────────────────────────────────────
      try {
        await pageRow.click({ timeout: 8_000 });
      } catch {
        await pageRow.dispatchEvent("click");
      }
      await page.waitForTimeout(900);

      // ── Wait for page content to appear ──────────────────────────────
      // Either .page-content or .error-banner must exist
      await page.waitForFunction(
        () => document.querySelector(".page-content") ||
              document.querySelector(".error-banner")  ||
              document.querySelector(".loading-state"),
        { timeout: 15_000 }
      ).catch(() => {}); // Tolerate timeout — audit will catch empty state

      // Give mermaid.render() and image cache time to start
      await page.waitForTimeout(600);

      // ── Scroll top → bottom to trigger lazy loading ───────────────────
      await scrollTopToBottom(page);

      // ── Extra wait for mermaid (renderMermaid is async) ──────────────
      await page.waitForTimeout(1_200);

      // ── Expand interactive demos and validate iframe mount ────────────
      const demoInteraction = await expandInteractiveDemos(page);
      await page.waitForTimeout(250);

      // ── DOM audit ─────────────────────────────────────────────────────
      const audit = await page.evaluate(DOM_AUDIT_FN).catch(e => {
        log("audit", `evaluate error on "${pageTitle}": ${e.message}`);
        return null;
      });

      // ── Remove per-page listeners ─────────────────────────────────────
      page.removeListener("console",   consoleHandler);
      page.removeListener("pageerror", errorHandler);

      const allConsoleErrs = [...consoleErrors, ...jsErrors];

      // ── Screenshot ────────────────────────────────────────────────────
      const courseSlug = courseTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      const pageSlug   = pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
      const shotFile   = path.join(SHOT_DIR, courseSlug, `${String(pi + 1).padStart(3, "0")}-${pageSlug}.png`);
      const shotPath   = await takeScreenshot(page, shotFile);

      // ── Build issues ───────────────────────────────────────────────────
      const issues = audit ? buildIssues(audit, allConsoleErrs, demoInteraction) : [
        { severity: SEV.ERROR, category: "audit", message: "DOM audit failed (evaluate threw)" },
      ];

      const issueCounts = { ERROR: 0, WARN: 0, INFO: 0 };
      for (const iss of issues) issueCounts[iss.severity]++;

      // ── Log per-page summary ──────────────────────────────────────────
      const summaryParts = [];
      if (audit) {
        summaryParts.push(`prose=${audit.proseBlockCount}blk/${audit.proseTextLength}ch`);
        summaryParts.push(`img=${audit.loadedImages}/${audit.totalImages}`);
        if (audit.mermaidBlockCount)
          summaryParts.push(`mermaid=${audit.mermaidRendered}ok/${audit.mermaidBlockCount}`);
        if (audit.tableCount)
          summaryParts.push(`tables=${audit.tableCount}`);
        if (audit.codeBlockCount)
          summaryParts.push(`code=${audit.codeBlockCount}`);
        if (audit.demoWrapCount)
          summaryParts.push(`demo=${audit.demoWrapCount}`);
        if (demoInteraction && demoInteraction.totalDemoWraps > 0)
          summaryParts.push(`demo-open=${demoInteraction.expandedFrames}/${demoInteraction.totalDemoWraps}`);
      }
      const issueSuffix = issues.length
        ? ` | issues: ${issueCounts.ERROR}E ${issueCounts.WARN}W ${issueCounts.INFO}I`
        : " | ✓ clean";
      log("check", `  ${summaryParts.join(" | ")}${issueSuffix}`);

      for (const iss of issues.filter(i => i.severity === SEV.ERROR)) {
        log("ERROR", `    ✗ [${iss.category}] ${iss.message}`);
      }
      for (const iss of issues.filter(i => i.severity === SEV.WARN)) {
        log("WARN",  `    ⚠ [${iss.category}] ${iss.message}`);
      }

      courseResult.pages.push({
        index:      pi + 1,
        title:      pageTitle,
        screenshot: shotPath ? path.relative(REPO_ROOT, shotPath) : null,
        audit,
        demoInteraction,
        consoleErrors: allConsoleErrs,
        issues,
        issueCounts,
      });

      for (const sev of Object.keys(issueCounts)) {
        courseResult.issuesSummary[sev] += issueCounts[sev];
        report.totalIssues[sev]          += issueCounts[sev];
      }

      report.totalPages++;
    } // end page loop

    report.courses.push(courseResult);

    const cs = courseResult.issuesSummary;
    log("course", `  Done: ${courseResult.pages.length} pages | ${cs.ERROR}E ${cs.WARN}W ${cs.INFO}I issues`);
  } // end course loop

  report.endedAt       = new Date().toISOString();
  report.durationSeconds = Math.round((Date.parse(report.endedAt) - Date.parse(report.startedAt)) / 1000);
  return report;
}

// ── Text report generator ─────────────────────────────────────────────────────

function generateTextReport(report) {
  const lines = [];
  const hr = "═".repeat(72);
  const hr2 = "─".repeat(72);

  lines.push(hr);
  lines.push("  STUDENT AI — COURSE QUALITY CHECK REPORT");
  lines.push(hr);
  lines.push(`  Started : ${report.startedAt}`);
  lines.push(`  Ended   : ${report.endedAt}`);
  lines.push(`  Duration: ${report.durationSeconds}s`);
  lines.push(`  App URL : ${report.appUrl}`);
  lines.push(`  Courses : ${report.courses.length}`);
  lines.push(`  Pages   : ${report.totalPages}`);
  lines.push(`  Issues  : ${report.totalIssues.ERROR} ERROR  ${report.totalIssues.WARN} WARN  ${report.totalIssues.INFO} INFO`);
  lines.push(hr);
  lines.push("");

  for (const course of report.courses) {
    const cs = course.issuesSummary;
    const status = cs.ERROR > 0 ? "✗ FAIL" : cs.WARN > 0 ? "⚠ WARN" : "✓ PASS";
    lines.push(`${status}  ${course.title}  (${course.pageCount} pages | ${cs.ERROR}E ${cs.WARN}W ${cs.INFO}I)`);
    lines.push(hr2);

    for (const pg of course.pages) {
      const pc = pg.issueCounts;
      const pgStatus = pc.ERROR > 0 ? "✗" : pc.WARN > 0 ? "⚠" : "✓";
      lines.push(`  ${pgStatus} [${String(pg.index).padStart(2, " ")}] ${pg.title}`);

      if (pg.audit) {
        const a = pg.audit;
        const parts = [
          `prose:${a.proseBlockCount}blk/${a.proseTextLength}ch`,
          `img:${a.loadedImages}ok/${a.totalImages}total${a.fallbackDivCount > 0 ? `/${a.fallbackDivCount}fallback` : ""}`,
        ];
        if (a.mermaidBlockCount) parts.push(`mermaid:${a.mermaidRendered}ok/${a.mermaidBlockCount}`);
        if (a.tableCount)        parts.push(`tables:${a.tableCount}`);
        if (a.codeBlockCount)    parts.push(`code:${a.codeBlockCount}`);
        if (a.demoWrapCount)     parts.push(`demo:${a.demoWrapCount}`);
        lines.push(`       ${parts.join("  ")}`);
      }

      for (const iss of pg.issues) {
        const marker = iss.severity === SEV.ERROR ? "      ✗ ERROR" :
                       iss.severity === SEV.WARN  ? "      ⚠ WARN " : "      ℹ INFO ";
        lines.push(`${marker}  [${iss.category}] ${iss.message}`);
        if (iss.detail) lines.push(`             detail: ${String(iss.detail).slice(0, 120)}`);
      }
    }
    lines.push("");
  }

  // ── Issues-only summary ───────────────────────────────────────────────────
  const allIssues = report.courses.flatMap(c => c.pages.flatMap(p =>
    p.issues.map(i => ({ course: c.title, page: p.title, ...i }))
  ));

  const srcDemoIssues = report.sourceChecks?.demoFenceIssues ?? [];
  if (srcDemoIssues.length > 0) {
    lines.push(hr);
    lines.push("  SOURCE CHECKS");
    lines.push(hr);
    lines.push(`  ✗ Demo fence issues: ${srcDemoIssues.length}`);

    const byCourse = new Map();
    for (const iss of srcDemoIssues) {
      byCourse.set(iss.course, (byCourse.get(iss.course) ?? 0) + 1);
    }
    for (const [course, count] of byCourse.entries()) {
      lines.push(`    - ${course}: ${count}`);
    }

    const sample = srcDemoIssues.slice(0, 25);
    lines.push("  Sample issues:");
    for (const iss of sample) {
      lines.push(`    [${iss.course}] ${iss.file}:${iss.line}`);
      lines.push(`      ${iss.message}`);
    }
    if (srcDemoIssues.length > sample.length) {
      lines.push(`    ... ${srcDemoIssues.length - sample.length} more (see JSON report)`);
    }
    lines.push("");
  }

  if (allIssues.length > 0) {
    lines.push(hr);
    lines.push("  ISSUES SUMMARY");
    lines.push(hr);
    for (const sev of [SEV.ERROR, SEV.WARN, SEV.INFO]) {
      const group = allIssues.filter(i => i.severity === sev);
      if (!group.length) continue;
      lines.push(`\n  ── ${sev} (${group.length}) ──`);
      for (const iss of group) {
        lines.push(`  [${iss.course}] ${iss.page}`);
        lines.push(`    ${iss.category}: ${iss.message}`);
        if (iss.detail) lines.push(`    detail: ${String(iss.detail).slice(0, 120)}`);
      }
    }
    lines.push("");
  }

  lines.push(hr);
  const overall = report.totalIssues.ERROR === 0 && report.totalIssues.WARN === 0
    ? "OVERALL RESULT: ✓ ALL PAGES PASS — no rendering issues detected"
    : report.totalIssues.ERROR === 0
      ? `OVERALL RESULT: ⚠ WARNINGS ONLY — ${report.totalIssues.WARN} rendering warning(s), no hard errors`
      : `OVERALL RESULT: ✗ FAILURES DETECTED — ${report.totalIssues.ERROR} error(s), ${report.totalIssues.WARN} warning(s)`;
  lines.push(`  ${overall}`);
  lines.push(hr);
  return lines.join("\n");
}

// ── Entry point ───────────────────────────────────────────────────────────────

log("setup", "Killing any existing student-ai process");
killApp();
await new Promise(r => setTimeout(r, 800));

log("setup", `Launching ${APP_EXE}`);
launchApp();

log("setup", "Waiting for WebView2 CDP…");
await waitForCdp(60_000);
await new Promise(r => setTimeout(r, 2_000));

const browser = await chromium.connectOverCDP(DEBUG_URL);
let report;

try {
  const ctx  = browser.contexts()[0];
  const page = ctx?.pages()[0];
  if (!page) throw new Error("No page found in CDP context — is the app running?");

  log("app", `Page ready at: ${page.url()}`);
  await page.bringToFront();
  await new Promise(r => setTimeout(r, 2_000));
  await dismissModals(page);

  log("app", `Connected to: ${await page.title()} — ${page.url()}`);

  report = await runQualityCheck(page);
} finally {
  await browser.close().catch(() => {});
}

// ── Write reports ─────────────────────────────────────────────────────────────

fs.mkdirSync(REPORTS_DIR, { recursive: true });
fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + "\n", "utf-8");

const textReport = generateTextReport(report);
fs.writeFileSync(REPORT_TXT, textReport + "\n", "utf-8");

// Print the text report to console
process.stdout.write("\n" + textReport + "\n");

log("done", `JSON report: ${path.relative(REPO_ROOT, REPORT_JSON)}`);
log("done", `Text report: ${path.relative(REPO_ROOT, REPORT_TXT)}`);
if (!SKIP_SHOTS) log("done", `Screenshots: ${path.relative(REPO_ROOT, SHOT_DIR)}`);

// Exit with non-zero code if there are ERRORs
process.exit(report.totalIssues.ERROR > 0 ? 1 : 0);
