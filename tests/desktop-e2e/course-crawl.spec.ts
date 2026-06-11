import { test, expect } from "@playwright/test";
import { mkdir, writeFile, rm, readFile, readdir } from "node:fs/promises";
import path from "node:path";

interface ConsoleLogEntry {
  ts: string;
  type: string;
  text: string;
  location?: string;
}

interface CourseResult {
  index: number;
  title: string;
  modulesVisible: number;
  pagesVisible: number;
  clickedPageTitle?: string;
  pagesScanned: number;
  overviewLinkChecks: Array<{
    fromPage: string;
    linkText: string;
    href: string;
    afterUrl: string;
    navigatedToMdUrl: boolean;
  }>;
  screenshots: string[];
  errorBanners: string[];
}

interface MockDataset {
  courses: Array<{
    id: string;
    title: string;
    description: string;
    wiki_page_count: number;
    version: string;
    is_downloaded: boolean;
    removed: boolean;
  }>;
  manifests: Record<string, any>;
  wikiPages: Record<string, string>;
}

function sanitizeFileName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

async function ensureNoBlockingModals(page: any): Promise<void> {
  const consentAccept = page.getByRole("button", { name: /I Agree|Accept/i });
  if (await consentAccept.isVisible().catch(() => false)) {
    await consentAccept.click({ timeout: 5000 }).catch(async () => {
      const consentDecline = page.getByRole("button", { name: /Decline/i });
      if (await consentDecline.isVisible().catch(() => false)) {
        await consentDecline.click({ timeout: 5000 });
      }
    });
  }

  const prereqSkip = page.getByRole("button", { name: /Continue anyway/i });
  if (await prereqSkip.isVisible().catch(() => false)) {
    await prereqSkip.click({ timeout: 5000 }).catch(() => {});
  }
}

async function screenshot(page: any, filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage: true });
}

async function loadMockDataset(repoRoot: string): Promise<MockDataset> {
  const coursesDir = path.join(repoRoot, "assets", "courses");
  const entries = await readdir(coursesDir, { withFileTypes: true });
  const courseDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

  const courses: MockDataset["courses"] = [];
  const manifests: Record<string, any> = {};
  const wikiPages: Record<string, string> = {};

  for (const courseId of courseDirs) {
    const manifestPath = path.join(coursesDir, courseId, "manifest.json");
    try {
      const manifestRaw = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestRaw);
      manifests[courseId] = manifest;

      courses.push({
        id: manifest.id ?? courseId,
        title: manifest.title ?? courseId,
        description: manifest.description ?? "",
        wiki_page_count: Number(manifest.wiki_page_count ?? 0),
        version: manifest.version ?? "1.0.0",
        is_downloaded: false,
        removed: false,
      });

      const wikiDir = path.join(coursesDir, courseId, "wiki");
      const wikiFiles = await readdir(wikiDir, { withFileTypes: true }).catch(() => []);
      for (const wf of wikiFiles) {
        if (!wf.isFile() || !wf.name.endsWith(".md")) continue;
        const slug = wf.name.slice(0, -3);
        const mdPath = path.join(wikiDir, wf.name);
        const content = await readFile(mdPath, "utf-8");
        wikiPages[`${courseId}:${slug}`] = content;
      }
    } catch {
      // Ignore malformed course folders and continue crawling remaining ones.
    }
  }

  return { courses, manifests, wikiPages };
}

test("crawl all courses deeply, scan all pages, and validate overview links", async ({ page }, testInfo) => {
  test.setTimeout(30 * 60 * 1000);

  const repoRoot = path.resolve(testInfo.config.rootDir, "..", "..");
  const dataset = await loadMockDataset(repoRoot);
  const artifactsRoot = path.join(repoRoot, "tests", "desktop-e2e", "artifacts");
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(artifactsRoot, runId);
  const latestDir = path.join(artifactsRoot, "latest");

  await mkdir(runDir, { recursive: true });

  const consoleLogs: ConsoleLogEntry[] = [];
  const pageErrors: ConsoleLogEntry[] = [];
  const requestFailures: ConsoleLogEntry[] = [];

  page.on("console", (msg: any) => {
    const loc = msg.location?.();
    const location = loc?.url ? `${loc.url}:${loc.lineNumber ?? 0}` : undefined;
    consoleLogs.push({
      ts: new Date().toISOString(),
      type: msg.type(),
      text: msg.text(),
      location,
    });
  });

  page.on("pageerror", (err: Error) => {
    pageErrors.push({
      ts: new Date().toISOString(),
      type: "pageerror",
      text: err.message,
    });
  });

  page.on("requestfailed", (req: any) => {
    requestFailures.push({
      ts: new Date().toISOString(),
      type: "requestfailed",
      text: `${req.method()} ${req.url()} => ${req.failure()?.errorText ?? "unknown"}`,
    });
  });

  await page.addInitScript((mock: MockDataset) => {
    const fallbackWiki = "# Missing Page\n\nContent not found in mock dataset.";
    const sessionId = "e2e-session-1";

    const invoke = async (cmd: string, args: Record<string, any> = {}) => {
      switch (cmd) {
        case "get_consent_status":
          return { consent_given: true };
        case "accept_consent":
        case "decline_consent":
          return null;

        case "get_model_status":
          return {
            llm_loaded: true,
            llm_exists: true,
            embedding_exists: true,
            available_ram_mb: 16384,
            vcredist_ok: true,
            gpu_enabled: false,
          };

        case "list_courses":
          return mock.courses;
        case "get_course_manifest":
          return mock.manifests[args.courseId] ?? null;
        case "get_wiki_page": {
          const key = `${args.courseId}:${args.pageSlug}`;
          return mock.wikiPages[key] ?? fallbackWiki;
        }
        case "list_wiki_pages": {
          const prefix = `${args.courseId}:`;
          return Object.keys(mock.wikiPages)
            .filter((k) => k.startsWith(prefix))
            .map((k) => k.slice(prefix.length));
        }

        case "list_chat_sessions":
          return [{
            id: sessionId,
            title: "E2E Session",
            mode: "general",
            updated_at: new Date().toISOString(),
          }];
        case "create_chat_session":
          return sessionId;
        case "delete_chat_session":
        case "rename_chat_session":
          return null;
        case "get_session_messages":
          return [];

        case "open_url":
          return null;

        default:
          return null;
      }
    };

    (window as any).__TAURI_INTERNALS__ = { invoke };
    (window as any).__TAURI__ = { invoke };
  }, dataset);

  const startedAt = new Date().toISOString();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await ensureNoBlockingModals(page);

  // Switch to courses tab in the left icon nav.
  await page.locator('.nav-btn[title="courses"]').click({ timeout: 10000 });
  await expect(page.locator(".tree-list")).toBeVisible({ timeout: 15000 });

  const courseRows = page.locator(".tree-list .course-row");
  const courseCount = await courseRows.count();
  expect(courseCount).toBeGreaterThan(0);

  const courseResults: CourseResult[] = [];

  for (let i = 0; i < courseCount; i++) {
    const row = page.locator(".tree-list .course-row").nth(i);
    await row.scrollIntoViewIfNeeded();

    const title = (await row.locator(".course-name").innerText().catch(() => `course-${i + 1}`)).trim();
    const slug = sanitizeFileName(`${String(i + 1).padStart(2, "0")}-${title}`);

    await row.click({ timeout: 10000 });
    await page.waitForTimeout(400);

    const sidebarShot = path.join(runDir, `${slug}-sidebar-expanded.png`);
    await screenshot(page, sidebarShot);

    const moduleRows = page.locator(".module-row");
    const moduleCount = await moduleRows.count();

    let pagesCount = 0;
    let clickedPageTitle: string | undefined;
    let pagesScanned = 0;
    const overviewLinkChecks: CourseResult["overviewLinkChecks"] = [];
    const screenshots: string[] = [path.basename(sidebarShot)];

    if (moduleCount > 0) {
      // Expand every module once so all page rows are visible for deep crawl.
      for (let m = 0; m < moduleCount; m++) {
        const modRow = page.locator(".module-row").nth(m);
        await modRow.scrollIntoViewIfNeeded();
        const caret = (await modRow.locator(".caret-sm").innerText().catch(() => "")).trim();
        if (caret === "▸") {
          await modRow.click({ timeout: 8000 });
          await page.waitForTimeout(120);
        }
      }

      const pageRows = page.locator(".page-row");
      pagesCount = await pageRows.count();

      for (let p = 0; p < pagesCount; p++) {
        const pageRow = page.locator(".page-row").nth(p);
        await pageRow.scrollIntoViewIfNeeded();
        const pageTitle = (await pageRow.innerText().catch(() => `page-${p + 1}`)).trim();
        if (!clickedPageTitle) clickedPageTitle = pageTitle;

        try {
          await pageRow.click({ timeout: 8000 });
        } catch {
          // Fallback for occasional hit-target instability while the sidebar re-renders.
          await pageRow.dispatchEvent("click");
        }
        await page.waitForTimeout(700);
        pagesScanned += 1;

        const pageArea = page.locator(".page-area");
        if (await pageArea.count()) {
          await pageArea.evaluate((el: HTMLElement) => {
            el.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
          });
          await page.waitForTimeout(100);

          // Only one screenshot per page to keep artifact size manageable.
          const pageShot = path.join(runDir, `${slug}-page-${String(p + 1).padStart(3, "0")}-${sanitizeFileName(pageTitle)}.png`);
          await screenshot(page, pageShot);
          screenshots.push(path.basename(pageShot));
        }

        // Validate overview flow-card links open inside WikiViewer, not browser-level .md URLs.
        const flowLinks = page.locator(".flow-card a[data-wiki-slug]");
        const flowCount = await flowLinks.count();
        if (flowCount > 0) {
          const flowLink = flowLinks.first();
          const linkText = (await flowLink.innerText().catch(() => "")).trim() || "unknown-link";
          const href = (await flowLink.getAttribute("href").catch(() => "")) ?? "";

          await flowLink.click({ timeout: 8000 });
          await page.waitForTimeout(500);

          const afterUrl = page.url();
          let navigatedToMdUrl = false;
          try {
            navigatedToMdUrl = new URL(afterUrl).pathname.endsWith(".md");
          } catch {
            navigatedToMdUrl = /\.md($|\?)/.test(afterUrl);
          }

          overviewLinkChecks.push({
            fromPage: pageTitle,
            linkText,
            href,
            afterUrl,
            navigatedToMdUrl,
          });
        }
      }
    }

    const errorBanners = await page.locator(".error-banner").allTextContents();
    courseResults.push({
      index: i + 1,
      title,
      modulesVisible: moduleCount,
      pagesVisible: pagesCount,
      clickedPageTitle,
      pagesScanned,
      overviewLinkChecks,
      screenshots,
      errorBanners,
    });
  }

  const endedAt = new Date().toISOString();
  const report = {
    startedAt,
    endedAt,
    durationSeconds: Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000),
    baseUrl: testInfo.config.use?.baseURL,
    courseCount,
    scannedCourses: courseResults.length,
    courses: courseResults,
    consoleLogCount: consoleLogs.length,
    pageErrorCount: pageErrors.length,
    requestFailureCount: requestFailures.length,
    pageErrors,
    requestFailures,
  };

  const reportPath = path.join(runDir, "course-crawl-report.json");
  const logsPath = path.join(runDir, "browser-console.log");

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  await writeFile(
    logsPath,
    `${consoleLogs
      .map((l) => `[${l.ts}] [${l.type}] ${l.location ? `(${l.location}) ` : ""}${l.text}`)
      .join("\n")}\n`,
    "utf-8",
  );

  // Maintain a stable "latest" folder for quick inspection.
  await rm(latestDir, { recursive: true, force: true });
  await mkdir(latestDir, { recursive: true });
  await writeFile(path.join(latestDir, "README.txt"), `Latest run: ${runId}\nSee: ../${runId}\n`, "utf-8");

  await testInfo.attach("course-crawl-report", {
    path: reportPath,
    contentType: "application/json",
  });

  // Soft-checks so the test still produces full report even when errors exist.
  expect.soft(report.scannedCourses).toBe(courseCount);
  for (const course of courseResults) {
    for (const check of course.overviewLinkChecks) {
      expect.soft(
        check.navigatedToMdUrl,
        `Overview link navigated outside WikiViewer in course='${course.title}', page='${check.fromPage}', link='${check.linkText}', href='${check.href}', afterUrl='${check.afterUrl}'`,
      ).toBe(false);
    }
  }
});
