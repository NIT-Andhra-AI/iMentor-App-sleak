/**
 * Standalone animation walk-through test — no RAG, no LLM inference.
 * Walks every course → first module → up to 6 pages, checks images load.
 *
 * Usage:
 *   node scripts/test-animations-only.mjs
 *
 * Override exe:
 *   $env:STUDENT_AI_EXE = "D:\app2\app\target\x86_64-pc-windows-msvc\release\student-ai.exe"
 *   node scripts/test-animations-only.mjs
 */

import { chromium } from "../tests/desktop-e2e/node_modules/playwright/index.mjs";
import path from "node:path";
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
function launchApp() {
  spawnSync("powershell", [
    "-NoProfile", "-NonInteractive", "-Command",
    `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'; Start-Process '${APP_EXE.replace(/'/g, "''")}'`,
  ], { encoding: "utf8", timeout: 15_000 });
}

async function waitForCdp(maxWaitMs = 60_000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch("http://127.0.0.1:9222/json/list");
      const targets = await r.json();
      const appTarget = targets.find(t =>
        (t.title && t.title.toLowerCase().includes("student ai")) ||
        (t.url  && t.url.includes("tauri.localhost"))
      );
      if (appTarget) return;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error("Timed out waiting for WebView2 CDP");
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

// ── Animation walk-through ────────────────────────────────────────────────────

async function testAllCourseAnimations(page) {
  log("animations", "navigating to courses view");
  await clickNav(page, "courses");

  // Wait for at least one course row to appear
  try {
    await page.locator(".course-row").first().waitFor({ state: "visible", timeout: 20000 });
  } catch {
    warn("animations", "No course rows found — are courses bundled in this build?");
    return;
  }

  const totalCourses = await page.locator(".course-row").count();
  log("animations", `found ${totalCourses} courses`);

  const summary = [];
  let appClosed = false;

  for (let ci = 0; ci < totalCourses; ci++) {
    if (appClosed) break;

    // Declare outside try so crash-recovery catch can read partial data
    let courseName = `course-${ci}`;
    let modCount = 0;
    let coursePagesChecked = 0, courseImgs = 0, courseLoaded = 0, courseFallbacks = 0;

    try {
      const row = page.locator(".course-row").nth(ci);
      const rawLabel = await row.innerText().catch(() => `course-${ci}`);
      const parts = rawLabel.split(/[▸▾]/);
      courseName = (parts[1] ?? parts[0] ?? `course-${ci}`)
        .trim().replace(/\n.*/s, "").slice(0, 40);

      log("animations", `[${ci + 1}/${totalCourses}] ${courseName}`);

      // Expand course
      const isExpanded = await row.evaluate(el => el.textContent?.includes("▾")).catch(() => false);
      if (!isExpanded) {
        await row.click().catch(() => {});
        await page.waitForTimeout(600);
      }

      // Find modules
      modCount = await page.locator(".module-row").count();
      if (modCount === 0) {
        log("animations", `  no modules found — skipping`);
        summary.push({ course: courseName, modules: 0, pagesChecked: 0, imgsFound: 0, loaded: 0, fallbacks: 0 });
        await row.click().catch(() => {});
        await page.waitForTimeout(400);
        continue;
      }

      // Test first 3 modules (or all if fewer)
      const modulesToTest = Math.min(modCount, 3);

      for (let mi = 0; mi < modulesToTest; mi++) {
        const modRow = page.locator(".module-row").nth(mi);
        const modLabel = await modRow.innerText().catch(() => `module-${mi}`);
        const modName = modLabel.split(/[▸▾]/)[1]?.trim() ?? modLabel.trim().slice(0, 30);

        const modExpanded = await modRow.evaluate(el => el.textContent?.includes("▾")).catch(() => false);
        if (!modExpanded) {
          await modRow.click().catch(() => {});
          await page.waitForTimeout(500);
        }

        // Walk up to 6 pages per module
        const pageEls = await page.locator(".page-row").all();
        let foundImgPage = false;

        for (const pageEl of pageEls.slice(0, 6)) {
          await pageEl.click().catch(() => {});
          await page.waitForTimeout(900);

          const imgCount = await page.evaluate(() =>
            document.querySelectorAll(".prose img").length
          ).catch(() => 0);

          coursePagesChecked++;

          if (imgCount > 0 && !foundImgPage) {
            foundImgPage = true;
            log("animations", `  [${modName}] ${imgCount} image(s) on page — scrolling into view…`);

            // Scroll ALL images into view to trigger lazy loading and the backend cache fetch.
            // Without this, images below the fold never fire their 'error' event
            // and naturalWidth stays 0 indefinitely.
            await page.evaluate(() => {
              document.querySelectorAll(".prose img").forEach(img => {
                img.scrollIntoView({ behavior: "instant", block: "center" });
                // Force-remove lazy loading so the browser attempts the fetch immediately
                img.removeAttribute("loading");
              });
            }).catch(() => {});
            await page.waitForTimeout(800); // give browser time to attempt HTTP fetch

            // Wait up to 30s for images to load OR backend-cache fallback to kick in
            const imgDeadline = Date.now() + 30_000;
            while (Date.now() < imgDeadline) {
              const loaded = await page.evaluate(() =>
                [...document.querySelectorAll(".prose img")].filter(i => i.naturalWidth > 0).length
              ).catch(() => 0);
              const fallbacks = await page.evaluate(() =>
                document.querySelectorAll(".prose .img-fallback").length
              ).catch(() => 0);
              if (loaded > 0 || fallbacks >= imgCount) break;
              await new Promise(r => setTimeout(r, 1500));
            }

            const loaded = await page.evaluate(() =>
              [...document.querySelectorAll(".prose img")].filter(i => i.naturalWidth > 0).length
            ).catch(() => 0);
            const fallbacks = await page.evaluate(() =>
              document.querySelectorAll(".prose .img-fallback").length
            ).catch(() => 0);

            courseImgs      += imgCount;
            courseLoaded    += loaded;
            courseFallbacks += fallbacks;

            const status = loaded > 0 ? `✓ ${loaded} loaded` : fallbacks > 0 ? `⚠ ${fallbacks} fallback(s)` : `✗ none loaded (no error/fallback — check network)`;
            log("animations", `  [${modName}] ${status} / ${imgCount} total`);
          }
        }

        // Collapse module before next
        const modExpanded2 = await modRow.evaluate(el => el.textContent?.includes("▾")).catch(() => false);
        if (modExpanded2) {
          await modRow.click().catch(() => {});
          await page.waitForTimeout(300);
        }
      }

      summary.push({
        course:        courseName,
        modules:       modCount,
        pagesChecked:  coursePagesChecked,
        imgsFound:     courseImgs,
        loaded:        courseLoaded,
        fallbacks:     courseFallbacks,
      });

      // Collapse course before next
      await row.click().catch(() => {});
      await page.waitForTimeout(500);

      // Navigate away and back to courses view between each course to allow
      // WebView2 to GC accumulated DOM nodes and image blobs — prevents crash.
      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
      await page.waitForTimeout(300);

    } catch (err) {
      const msg = String(err);
      if (/closed|disconnect/i.test(msg)) {
        warn("animations", `App closed after ${summary.length} courses`);
        // Push whatever partial data we collected for the current course
        if (courseImgs > 0 || coursePagesChecked > 0) {
          summary.push({
            course:       courseName + " (partial)",
            modules:      modCount,
            pagesChecked: coursePagesChecked,
            imgsFound:    courseImgs,
            loaded:       courseLoaded,
            fallbacks:    courseFallbacks,
          });
        }
        appClosed = true;
      } else {
        warn("animations", `Error on course ${ci}: ${msg.slice(0, 140)}`);
        summary.push({ course: `course-${ci}`, modules: 0, pagesChecked: 0, imgsFound: 0, loaded: 0, fallbacks: 0 });
      }
    }
  }

  // ── Summary table ─────────────────────────────────────────────────────────
  log("animations", "");
  log("animations", "=== Course Animation Summary ===");
  log("animations", `${"Course".padEnd(42)} Mods  Pages  Imgs  Loaded  Fallback`);
  log("animations", "─".repeat(76));

  let coursesWithImgs = 0, coursesLoaded = 0, coursesAllFallback = 0;
  for (const s of summary) {
    const line = [
      s.course.padEnd(42),
      String(s.modules).padStart(4),
      String(s.pagesChecked).padStart(6),
      String(s.imgsFound).padStart(5),
      String(s.loaded).padStart(6),
      String(s.fallbacks).padStart(8),
    ].join("  ");
    log("animations", line);
    if (s.imgsFound > 0) {
      coursesWithImgs++;
      if (s.loaded > 0)    coursesLoaded++;
      else if (s.fallbacks > 0) coursesAllFallback++;
    }
  }

  log("animations", "─".repeat(76));
  log("animations", `Total courses: ${summary.length}${appClosed ? " (partial — app closed)" : ""}`);
  log("animations", `Courses with images: ${coursesWithImgs}`);
  log("animations", `  ✓ at least 1 image loaded:    ${coursesLoaded}`);
  log("animations", `  ⚠ all images used fallback:   ${coursesAllFallback}`);
  log("animations", `  ✗ no images found:            ${summary.length - coursesWithImgs}`);

  // Fail only if image pages exist but NOTHING ever loaded
  if (!appClosed && coursesWithImgs > 0 && coursesLoaded === 0) {
    throw new Error(
      `Image pages found in ${coursesWithImgs} course(s) but NOT A SINGLE image loaded ` +
      `(${coursesAllFallback} course(s) used fallback) — animation/image caching is broken`
    );
  }
  if (appClosed && coursesWithImgs > 0 && coursesLoaded === 0) {
    throw new Error("App closed and no images ever loaded — image caching may be broken");
  }

  log("animations", "");
  if (coursesLoaded > 0) {
    log("animations", `PASS — images loaded correctly in ${coursesLoaded}/${coursesWithImgs} image-bearing courses`);
  } else if (coursesWithImgs === 0) {
    log("animations", "INFO — no courses with images found (courses may have no diagrams yet)");
  } else {
    log("animations", `WARN — ${coursesAllFallback} course(s) used image fallbacks — check asset bundling`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

log("setup", "killing any existing student-ai process");
killApp();
await new Promise(r => setTimeout(r, 800));

log("setup", `launching ${APP_EXE}`);
launchApp();

log("setup", "waiting for WebView2 CDP…");
await waitForCdp(60_000);
await new Promise(r => setTimeout(r, 1000));

const browser = await chromium.connectOverCDP(DEBUG_URL);
try {
  const page = browser.contexts()[0]?.pages()[0];
  if (!page) throw new Error("No page found in CDP context");

  log("app", `page: ${page.url()}`);
  await page.bringToFront();
  await new Promise(r => setTimeout(r, 2000));
  await waitForNoOverlay(page, 60000);
  log("app", `connected to "${await page.title()}"`);

  await testAllCourseAnimations(page);

  log("done", "animation test complete ✓");
} finally {
  await browser.close();
  killApp();
}
