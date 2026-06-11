import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: ".",
  outputDir: "test-results/artifacts",
  // Individual test timeout – 90s covers mock-backed tests with room to spare.
  // Latency multi-turn tests call test.setTimeout() themselves.
  timeout: 90_000,
  // Retry once on CI to tolerate flaky timing
  retries: process.env.CI ? 1 : 0,
  // Sequential – avoids port/model/metric-file contention
  workers: 1,
  reporter: [
    ["line"],
    ["json", { outputFile: "test-results/playwright-results.json" }],
    ["html", { outputFolder: "test-results/html", open: "never" }],
  ],
  use: {
    baseURL: BASE_URL,
    // Capture screenshot + trace on failure for debugging
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    // Viewport – simulate a 1280×800 student laptop screen
    viewport: { width: 1280, height: 800 },
  },
  // Named test suites so you can run them individually
  projects: [
    {
      name: "smoke",
      testMatch: "smoke.spec.ts",
    },
    {
      name: "general-chat",
      testMatch: "general-chat.spec.ts",
      dependencies: ["smoke"],
    },
    {
      name: "course-chat",
      testMatch: "course-chat.spec.ts",
      dependencies: ["smoke"],
    },
    {
      name: "rag-documents",
      testMatch: "rag-documents.spec.ts",
      dependencies: ["smoke"],
    },
    {
      name: "agents",
      testMatch: "agents.spec.ts",
      dependencies: ["smoke"],
    },
    {
      name: "visualizations",
      testMatch: "visualizations.spec.ts",
      dependencies: ["smoke"],
    },
    {
      name: "course-crawl",
      testMatch: "course-crawl.spec.ts",
      dependencies: ["smoke"],
    },
    {
      name: "stress",
      testMatch: "stress.spec.ts",
      dependencies: ["smoke"],
    },
    {
      // Dedicated latency & quality benchmark — depends on smoke only
      name: "latency-quality",
      testMatch: "latency-quality.spec.ts",
      dependencies: ["smoke"],
    },
  ],
});
