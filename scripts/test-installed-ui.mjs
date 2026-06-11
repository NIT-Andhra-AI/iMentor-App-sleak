import { chromium } from "../tests/desktop-e2e/node_modules/playwright/index.mjs";
import path from "node:path";
import fs from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";

const DEBUG_URL = process.env.STUDENT_AI_CDP_URL ?? "http://127.0.0.1:9222";
const APP_EXE   = process.env.STUDENT_AI_EXE
  ?? path.join(process.env.LOCALAPPDATA ?? "", "Student AI", "student-ai.exe");
const APP_DATA  = path.join(process.env.APPDATA ?? "", "com.studentai.app");

function log(step, message) {
  console.log(`[${step}] ${message}`);
}

async function clickIfVisible(page, selector, timeout = 1500) {
  const locator = page.locator(selector).first();
  if (await locator.isVisible({ timeout }).catch(() => false)) {
    await locator.click();
    return true;
  }
  return false;
}

async function dismissModals(page) {
  // Wait up to 8s for any overlay to appear, then dismiss it
  const overlaySelectors = [
    'button:has-text("I Agree")',
    'button.btn-primary:has-text("I Agree")',
    'button:has-text("Accept")',
    'button:has-text("Continue anyway")',
    'button:has-text("Skip")',
    'button:has-text("Later")',
    'button:has-text("Close")',
  ];
  // Try each selector with force:true to pierce any overlay backdrop
  for (const sel of overlaySelectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
      await loc.click({ force: true }).catch(() => {});
      await page.waitForTimeout(600);
    }
  }
  // Wait for all overlays to disappear before returning
  await waitForNoOverlay(page);
}

async function waitForNoOverlay(page, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hasOverlay = await page.evaluate(
      () => !!document.querySelector('.overlay')
    ).catch(() => false);
    if (!hasOverlay) return;
    // If a button is available on the overlay, click it
    for (const text of ['I Agree', 'Accept & Continue', 'Accept', 'Skip', 'Close']) {
      const btn = page.locator(`.overlay button:has-text("${text}")`).first();
      if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(600);
        break;
      }
    }
    await new Promise(r => setTimeout(r, 800));
  }
  throw new Error('Timed out waiting for overlay to close');
}

async function waitForStableText(locator, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  let prev = "";
  let stableCount = 0;
  while (Date.now() < deadline) {
    // Strip the streaming cursor glyph before comparing
    const raw = await locator.innerText().catch(e => {
      if (/closed|disconnect/i.test(String(e))) throw new Error(`App closed while waiting for reply: ${e.message}`);
      return "";
    });
    const text = raw.trim().replace(/▌$/, "").trim();
    if (text.length > 5 && text === prev) {
      stableCount += 1;
      if (stableCount >= 3) return text;
    } else {
      stableCount = 0;
      prev = text;
    }
    // Use setTimeout (not page.waitForTimeout) so a closed page doesn't throw here
    await new Promise(r => setTimeout(r, 1200));
  }
  throw new Error("Timed out waiting for stable reply text");
}

/** Poll `page.evaluate(fn)` every `intervalMs` until it returns a truthy value
 *  or timeout expires.  Throws on page-close (app crash). */
async function pollEvaluate(page, fn, { timeout = 300_000, interval = 3000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));
    let res;
    try {
      res = await page.evaluate(fn);
    } catch (e) {
      if (/closed|disconnect/i.test(String(e))) {
        throw new Error(`App crashed during background operation: ${e.message}`);
      }
      continue; // transient CDP hiccup
    }
    if (res !== null && res !== undefined) return res;
  }
  throw new Error(`pollEvaluate timed out after ${timeout}ms`);
}

async function clickNav(page, title) {
  // Ensure no overlay is blocking before clicking nav
  await waitForNoOverlay(page, 5000).catch(() => {});
  await page.locator(`.nav-btn[title="${title}"]`).click();
  await page.waitForTimeout(500);
}

async function askChat(page, question, validRe, label) {
  const input = page.locator(".input-area textarea");
  await input.waitFor({ state: "visible", timeout: 15000 });
  const aiBefore = await page.locator(".bubble.ai").count();
  await input.fill(question);
  await input.press("Enter");
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const cnt = await page.locator(".bubble.ai").count().catch(e => {
      if (/closed|disconnect/i.test(String(e))) throw new Error(`App closed during ${label}: ${e.message}`);
      return -1;
    });
    if (cnt > aiBefore) break;
    await new Promise(r => setTimeout(r, 1500));
  }
  const reply = await waitForStableText(page.locator(".bubble.ai").last(), 180000);
  if (!validRe.test(reply)) {
    throw new Error(`[${label}] reply did not pass quality check:\n${reply.slice(0, 300)}`);
  }
  log("chat", `[${label}] ok: ${reply.slice(0, 130)}`);
  await new Promise(r => setTimeout(r, 3000)); // let model go idle
  return reply;
}

async function testGeneralChat(page) {
  log("chat", "opening sessions view");
  await clickNav(page, "sessions");

  await askChat(page,
    "What is gradient descent? Explain with the role of learning rate.",
    /gradient|loss|optim|minimiz|learning rate/i,
    "ML-gradient-descent"
  );

  await askChat(page,
    "What is a deadlock in operating systems? State all four Coffman conditions.",
    /deadlock|mutual exclusion|hold|wait|circular|coffman|preempt/i,
    "OS-deadlock"
  );

  await askChat(page,
    "Explain TCP vs UDP with examples relevant to networking in a BTech syllabus.",
    /TCP|UDP|reliable|connection|datagram|stream|packet/i,
    "CN-tcp-udp"
  );

  await askChat(page,
    "What is the time complexity of quicksort in best, average, and worst cases? Why?",
    /quicksort|O\(n log n\)|O\(n\^?2\)|pivot|partition|average|worst/i,
    "DSA-quicksort"
  );
}

async function testCourses(page) {
  log("courses", "opening courses view");
  await clickNav(page, "courses");
  await page.locator(".course-row").first().waitFor({ state: "visible", timeout: 15000 });

  // Expand first available course (algorithms, artificial-intelligence, or data-structures)
  const mlRow = page.locator(".course-row").first();
  await mlRow.waitFor({ state: "visible", timeout: 10000 });
  const mlText = await mlRow.innerText();
  if (!mlText.includes("▾")) {
    await mlRow.click();
    await page.waitForTimeout(500);
  }

  // Expand first module if not already expanded
  const firstMod = page.locator(".module-row").first();
  await firstMod.waitFor({ state: "visible", timeout: 10000 });
  const modText = await firstMod.innerText();
  if (!modText.includes("▾")) {
    await firstMod.click();
    await page.waitForTimeout(500);
  }

  // Click the first page-row to load wiki content and activate studyContext
  const pageRow = page.locator(".page-row").first();
  await pageRow.waitFor({ state: "visible", timeout: 10000 });
  await pageRow.click();
  await page.waitForTimeout(800);

  // Verify wiki content loaded
  const wiki = page.locator(".wiki-pane, .page-content, .prose").first();
  await wiki.waitFor({ state: "visible", timeout: 15000 });
  const wikiText = (await wiki.innerText()).trim();
  if (wikiText.length < 80) {
    throw new Error("Course wiki content did not render enough text");
  }

  // Floating chat: open if showing FAB button, expand if minimized, else already open
  const fabVisible = await page.locator(".floating-btn").isVisible({ timeout: 2000 }).catch(() => false);
  if (fabVisible) {
    await page.locator(".floating-btn").click();
    await page.waitForTimeout(400);
  }
  // If minimized, expand it
  const fcMinimized = await page.locator(".floating-chat.minimized").isVisible({ timeout: 1000 }).catch(() => false);
  if (fcMinimized) {
    await page.locator(".floating-chat .header-btn").click();
    await page.waitForTimeout(300);
  }

  // Wait for textarea to be visible
  const floatingTextarea = page.locator(".floating-chat .chat-input-area textarea");
  await floatingTextarea.waitFor({ state: "visible", timeout: 10000 });

  // Count existing AI message bubbles BEFORE sending (only non-user messages)
  const aiSelector = ".floating-chat .message:not(.user) .message-bubble";
  const aiBefore = await page.locator(aiSelector).count();

  await floatingTextarea.fill("What does this page cover in one line?");
  await floatingTextarea.press("Enter");

  // Poll for new AI bubble — use setTimeout so page-close doesn't silently swallow the error
  const fcDeadline = Date.now() + 180000;
  while (Date.now() < fcDeadline) {
    const cnt = await page.locator(aiSelector).count().catch(e => {
      if (/closed|disconnect/i.test(String(e))) throw new Error(`App closed while waiting for floating chat reply: ${e.message}`);
      return -1;
    });
    if (cnt > aiBefore) break;
    await new Promise(r => setTimeout(r, 1500));
  }

  const reply = await waitForStableText(page.locator(aiSelector).last(), 180000);
  if (reply.length < 10) {
    throw new Error(`Course floating chat reply was too short: "${reply}"`);
  }
  log("courses", `page and floating chat ok: ${reply.slice(0, 120)}`);

  // ── Animation / image test ─────────────────────────────────────────────────
  // Navigate through pages until we find one that has an <img> tag (a page
  // with animations/diagrams).  The backend fetch_image_cached command should
  // download the image and the WikiViewer should swap the src to a local asset://
  // URL — meaning no img-fallback divs should survive after ~15 s.
  log("animations", "searching for a wiki page that contains images…");
  let foundImgPage = false;
  const pageRows = await page.locator(".page-row").all();
  for (const row of pageRows.slice(0, 8)) {
    await row.click().catch(() => {});
    await page.waitForTimeout(1200);
    const imgCount = await page.evaluate(
      () => document.querySelectorAll(".prose img").length
    );
    if (imgCount > 0) {
      foundImgPage = true;
      log("animations", `found page with ${imgCount} image(s) — waiting for cache fetch…`);
      break;
    }
  }

  if (foundImgPage) {
    // Give the backend up to 30 s to download and cache each image.
    // Then count how many img-fallback placeholders remain.
    const deadline = Date.now() + 30_000;
    let fallbacks = Infinity;
    while (Date.now() < deadline) {
      fallbacks = await page.evaluate(
        () => document.querySelectorAll(".prose .img-fallback").length
      );
      const imgs = await page.evaluate(
        () => document.querySelectorAll(".prose img").length
      );
      if (imgs > 0 && fallbacks === 0) break;
      await new Promise(r => setTimeout(r, 2000));
    }
    const totalImgs = await page.evaluate(
      () => document.querySelectorAll(".prose img").length
    );
    if (fallbacks > 0 && totalImgs === 0) {
      throw new Error(`All ${fallbacks} image(s) still showing fallback — backend image cache failed`);
    }
    const loaded = totalImgs;
    log("animations", `images ok — ${loaded} loaded, ${fallbacks} still showing fallback (may be genuinely 404)`);
  } else {
    log("animations", "no page with images found in first 8 pages — skipping animation check");
  }
}

async function testRag(page) {
  log("rag", "opening documents view");
  await clickNav(page, "documents");

  // Clear any stale doc rows from previous runs.
  let staleCount = await page.locator(".doc-row .del-btn").count();
  while (staleCount > 0) {
    await page.locator(".doc-row .del-btn").first().click();
    await page.waitForTimeout(400);
    staleCount = await page.locator(".doc-row .del-btn").count();
  }

  // Use a plain-text sample that is always present next to the script.
  // Falls back to RAG_test.pdf if the txt doesn't exist.
  let sampleFile = path.resolve("RAG_test.txt");
  if (!fs.existsSync(sampleFile)) {
    sampleFile = path.resolve("RAG_test.pdf");
  }
  if (!fs.existsSync(sampleFile)) {
    // Create a minimal sample on-the-fly so the test is self-contained.
    sampleFile = path.resolve("RAG_test.txt");
    fs.writeFileSync(sampleFile,
      "Gradient descent is an iterative optimisation algorithm used to minimise a " +
      "loss function in machine learning by adjusting parameters in the direction " +
      "opposite to the gradient. The learning rate controls step size."
    );
  }
  const fileName = path.basename(sampleFile);
  // Normalise to forward slashes – Rust/Windows both accept them.
  const filePath = sampleFile.replace(/\\/g, "/");

  // ── Upload via direct Tauri IPC – fire-and-forget so CDP returns immediately
  log("rag", `uploading ${fileName} via Tauri IPC`);
  await page.evaluate(
    ([fp, fn]) => {
      window.__ragUploadResult = undefined;
      window.__TAURI_INTERNALS__
        .invoke("upload_document", { request: { file_path: fp, file_name: fn } })
        .then(r => { window.__ragUploadResult = { ok: true, data: r }; })
        .catch(e => { window.__ragUploadResult = { ok: false, error: String(e) }; });
    },
    [filePath, fileName]
  );

  // Poll from Node.js side (no CDP long-hold → survives slow model load)
  log("rag", "waiting for embedding model + upload (up to 5 min)…");
  const uploadResult = await pollEvaluate(
    page,
    () => window.__ragUploadResult ?? null,
    { timeout: 300_000, interval: 4000 }
  );

  if (!uploadResult.ok) {
    throw new Error(`upload_document IPC failed: ${uploadResult.error}`);
  }
  const docId = uploadResult.data?.doc_id ?? "";
  log("rag", `upload ok – id=${docId} chunks=${uploadResult.data?.chunk_count}`);

  // ── Select the document so it is included in RAG queries ─────────────────
  if (docId) {
    await page.evaluate(
      ([id]) => {
        window.__TAURI_INTERNALS__
          .invoke("toggle_doc_selection", { docId: id, selected: true })
          .catch(() => {});
      },
      [docId]
    );
    await page.waitForTimeout(400);
  }

  // ── Navigate away and back to trigger onMount → listDocuments refresh ─────
  await clickNav(page, "sessions");
  await page.waitForTimeout(600);
  await clickNav(page, "documents");

  // ── Verify document row appears in the sidebar ────────────────────────────
  const docRow = page.locator(".doc-row").first();
  await docRow.waitFor({ state: "visible", timeout: 60000 });
  const docMeta = (await docRow.innerText()).trim().replace(/\s+/g, " ");
  log("rag", `doc row: ${docMeta.slice(0, 160)}`);

  // ── Ask a question in the user_docs ChatPanel ─────────────────────────────
  const input = page.locator(".input-area textarea");
  await input.waitFor({ state: "visible", timeout: 15000 });
  const aiCountBefore = await page.locator(".bubble.ai").count();
  await input.fill("What does the uploaded document say about gradient descent?");
  await input.press("Enter");

  // Poll for new AI bubble (RAG chat)
  const ragChatDeadline = Date.now() + 300000;
  while (Date.now() < ragChatDeadline) {
    const cnt = await page.locator(".bubble.ai").count().catch(e => {
      if (/closed|disconnect/i.test(String(e))) throw new Error(`App closed during RAG chat: ${e.message}`);
      return -1;
    });
    if (cnt > aiCountBefore) break;
    await new Promise(r => setTimeout(r, 1500));
  }
  const reply = await waitForStableText(page.locator(".bubble.ai").last(), 300000);
  if (!/gradient|loss|optim|minimiz|learning|document/i.test(reply)) {
    throw new Error(`RAG reply did not look grounded: ${reply}`);
  }
  log("rag", `upload and reply ok: ${reply.slice(0, 120)}`);
}

async function testAgents(page) {
  log("agents", "opening agents view");
  await clickNav(page, "agents");

  // Wait for spawn buttons to appear
  const spawnDevBtn = page.locator(".spawn-btns button").filter({ hasText: /Dev Agent/i }).first();
  await spawnDevBtn.waitFor({ state: "visible", timeout: 15000 });

  log("agents", "spawning Dev Agent");
  await spawnDevBtn.click();
  await page.waitForTimeout(800);

  // Agent uses a plain <input> (not textarea)
  const agentInput = page.locator(".input-row input");
  await agentInput.waitFor({ state: "visible", timeout: 15000 });

  // Helper: send one message to agent, wait for reply
  async function askAgent(question, validRe, label) {
    const aiBefore = await page.locator(".msg.ai").count();
    await agentInput.fill(question);
    await agentInput.press("Enter");
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const cnt = await page.locator(".msg.ai").count().catch(e => {
        if (/closed|disconnect/i.test(String(e))) throw new Error(`App closed during agent ${label}: ${e.message}`);
        return -1;
      });
      if (cnt > aiBefore) break;
      await new Promise(r => setTimeout(r, 1500));
    }
    const reply = await waitForStableText(page.locator(".msg.ai").last(), 180000);
    if (!validRe.test(reply)) {
      throw new Error(`[agent-${label}] reply failed quality check:\n${reply.slice(0, 300)}`);
    }
    log("agents", `[${label}] ok: ${reply.slice(0, 130)}`);
    await new Promise(r => setTimeout(r, 3000));
    return reply;
  }

  await askAgent(
    "Write a C function for binary search on a sorted integer array. State its time complexity.",
    /binary|search|O\(log|int|arr|mid|return|while|if/i,
    "binary-search"
  );

  await askAgent(
    "Implement a stack using a singly linked list in C++. Show push, pop, and peek.",
    /stack|push|pop|peek|linked list|node|top|nullptr|struct|class/i,
    "stack-linked-list"
  );

  await askAgent(
    "What is the difference between process and thread? When would you use threads in an OS context?",
    /process|thread|memory|shared|context|switch|concurren|lightweight/i,
    "process-vs-thread"
  );
}

// ── App lifecycle helpers ─────────────────────────────────────────────────────

function psExec(cmd) {
  return spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", cmd], {
    encoding: "utf8", timeout: 120_000,
  });
}

function killApp() {
  psExec('Get-Process -Name "student-ai" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue');
}

function cleanRagState() {
  // Remove stale rag_index.bin so the fresh app starts with an empty HNSW index.
  const ragIndex = path.join(APP_DATA, "rag_index.bin");
  try { fs.rmSync(ragIndex); log("setup", `removed stale ${ragIndex}`); }
  catch (_) { /* not present – fine */ }
}

function launchApp() {
  if (!fs.existsSync(APP_EXE)) {
    throw new Error(`Installed app not found: ${APP_EXE}\nRun the NSIS installer first.`);
  }
  const env = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9222" };
  spawnSync("powershell", [
    "-NoProfile", "-NonInteractive", "-Command",
    `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'; Start-Process '${APP_EXE.replace(/'/g, "''")}'`
  ], { encoding: "utf8", timeout: 15_000 });
}

async function waitForCdp(maxWaitMs = 60_000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${DEBUG_URL}/json/list`);
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

// ── Main ──────────────────────────────────────────────────────────────────────

log("setup", "killing any existing student-ai process");
killApp();
await new Promise(r => setTimeout(r, 800));

log("setup", "cleaning stale RAG index");
cleanRagState();

log("setup", `launching ${APP_EXE}`);
launchApp();

log("setup", "waiting for WebView2 CDP…");
await waitForCdp(40_000);
await new Promise(r => setTimeout(r, 1000));

const browser = await chromium.connectOverCDP(DEBUG_URL);
try {
  const page = browser.contexts()[0]?.pages()[0];
  if (!page) throw new Error("No page found in CDP context");

  log("app", `page ready at: ${page.url()}`);
  await page.bringToFront();
  await new Promise(r => setTimeout(r, 2000));
  await dismissModals(page);

  log("app", `connected to ${await page.title()} at ${page.url()}`);
  await testGeneralChat(page);
  await testCourses(page);
  await testRag(page);
  await testAgents(page);
  log("done", "installed UI validation passed");
} finally {
  await browser.close();
}