/**
 * metrics.ts — Latency & Quality Measurement Utilities
 *
 * Provides:
 *   - TimedReply: wall-clock TTFT + total-response-time capture
 *   - QualityScore: keyword / length / structure scoring rubric
 *   - MetricsCollector: in-memory store → JSON / Markdown report
 *
 * Usage:
 *   import { metrics, timedReply, scoreReply } from "./metrics.js";
 *
 *   const result = await timedReply(page, async () => {
 *     await sendChatMessage(page, "...");
 *   });
 *   metrics.record({ suite, test, ...result, quality: scoreReply(result.text, keywords) });
 */

import { type Page, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MetricEntry {
  suite: string;
  test: string;
  timestamp: string;
  ttft_ms: number | null;        // time-to-first-token (ms)
  total_ms: number | null;       // time until streaming finished (ms)
  char_count: number;
  word_count: number;
  quality_score: number;         // 0-100
  quality_notes: string[];
  text_snippet: string;          // first 120 chars of reply
  passed: boolean;
  error?: string;
}

export interface TimedReplyResult {
  text: string;
  ttft_ms: number;
  total_ms: number;
}

// ── Timing helpers ────────────────────────────────────────────────────────────

/**
 * Sends a message and measures:
 *   ttft_ms  = time from send until first token appears in the last AI bubble
 *   total_ms = time until streaming is fully stable (no more text changes)
 */
export async function timedChatReply(
  page: Page,
  sendFn: () => Promise<void>,
  opts: { firstTokenTimeout?: number; stableTimeout?: number } = {}
): Promise<TimedReplyResult> {
  const firstTokenTimeout = opts.firstTokenTimeout ?? 45_000;
  const stableTimeout = opts.stableTimeout ?? 120_000;

  const t0 = performance.now();

  await sendFn();

  // Wait for the first AI bubble
  const aiBubbles = page.locator(".bubble.ai");
  await aiBubbles.first().waitFor({ state: "visible", timeout: firstTokenTimeout });
  const ttft_ms = Math.round(performance.now() - t0);

  // Poll until text is stable (streaming complete)
  let prev = "";
  await expect
    .poll(
      async () => {
        const n = await aiBubbles.count();
        if (n === 0) return false;
        const text = (await aiBubbles.nth(n - 1).innerText()).trim();
        const stable = text.length > 0 && text === prev;
        prev = text;
        return stable;
      },
      { timeout: stableTimeout, intervals: [200, 400, 600, 1000] }
    )
    .toBeTruthy();

  const total_ms = Math.round(performance.now() - t0);
  const count = await aiBubbles.count();
  const text = (await aiBubbles.nth(count - 1).innerText()).trim();

  return { text, ttft_ms, total_ms };
}

/**
 * Same as timedChatReply but for the floating course chat panel.
 */
export async function timedFloatingReply(
  page: Page,
  sendFn: () => Promise<void>,
  opts: { firstTokenTimeout?: number; stableTimeout?: number } = {}
): Promise<TimedReplyResult> {
  const firstTokenTimeout = opts.firstTokenTimeout ?? 45_000;
  const stableTimeout = opts.stableTimeout ?? 120_000;

  const t0 = performance.now();
  await sendFn();

  // Floating chat: wait for cursor (streaming indicator)
  await page
    .locator(".floating-chat .cursor")
    .first()
    .waitFor({ state: "visible", timeout: firstTokenTimeout });
  const ttft_ms = Math.round(performance.now() - t0);

  await page
    .locator(".floating-chat .cursor")
    .last()
    .waitFor({ state: "detached", timeout: stableTimeout });
  const total_ms = Math.round(performance.now() - t0);

  const msgs = page.locator(".floating-chat .message:not(.user) .message-bubble");
  const n = await msgs.count();
  const text = n > 0 ? (await msgs.nth(n - 1).innerText()).trim() : "";

  return { text, ttft_ms, total_ms };
}

/**
 * Timed reply for agent chat.
 */
export async function timedAgentReply(
  page: Page,
  sendFn: () => Promise<void>,
  opts: { firstTokenTimeout?: number; stableTimeout?: number } = {}
): Promise<TimedReplyResult> {
  const firstTokenTimeout = opts.firstTokenTimeout ?? 45_000;
  const stableTimeout = opts.stableTimeout ?? 120_000;

  const t0 = performance.now();
  await sendFn();

  const aiMsgs = page.locator(".messages .msg.ai");
  await aiMsgs.first().waitFor({ state: "visible", timeout: firstTokenTimeout });
  const ttft_ms = Math.round(performance.now() - t0);

  let prev = "";
  await expect
    .poll(
      async () => {
        const n = await aiMsgs.count();
        if (n === 0) return false;
        const text = (await aiMsgs.nth(n - 1).innerText()).replace(/▋/g, "").trim();
        const stable = text.length > 0 && text === prev;
        prev = text;
        return stable;
      },
      { timeout: stableTimeout, intervals: [200, 400, 600, 1000] }
    )
    .toBeTruthy();

  const total_ms = Math.round(performance.now() - t0);
  const n = await aiMsgs.count();
  const text = (await aiMsgs.nth(n - 1).innerText()).replace(/▋/g, "").trim();

  return { text, ttft_ms, total_ms };
}

// ── Quality scoring ───────────────────────────────────────────────────────────

export interface QualityResult {
  score: number;        // 0-100
  notes: string[];
}

/**
 * Score a reply on a 0-100 rubric.
 *
 * Scoring breakdown:
 *   30 pts — keyword coverage (keywords matched / total)
 *   20 pts — length adequacy (≥30 chars=10, ≥100=20)
 *   15 pts — no error signals
 *   10 pts — structured output (markdown, code, list, table)
 *   10 pts — sentence completeness (ends with . ? !)
 *   15 pts — no hallucination markers (random gibberish / lorem ipsum)
 */
export function scoreReply(
  text: string,
  expectedKeywords: string[] = [],
  opts: {
    minLength?: number;
    requireStructure?: boolean;
  } = {}
): QualityResult {
  const notes: string[] = [];
  let score = 0;
  const lower = text.toLowerCase();

  // 1. Keyword coverage (30 pts)
  if (expectedKeywords.length > 0) {
    const matched = expectedKeywords.filter((kw) => lower.includes(kw.toLowerCase()));
    const kwScore = Math.round((matched.length / expectedKeywords.length) * 30);
    score += kwScore;
    if (matched.length === expectedKeywords.length) {
      notes.push(`✅ All ${matched.length} keywords found`);
    } else {
      notes.push(`⚠️ Keywords matched: ${matched.join(", ")} | Missing: ${expectedKeywords.filter(k => !lower.includes(k.toLowerCase())).join(", ")}`);
    }
  } else {
    score += 30; // no keyword requirement — full credit
    notes.push("ℹ️ No keyword requirements");
  }

  // 2. Length adequacy (20 pts)
  const minLen = opts.minLength ?? 30;
  if (text.length >= 200) {
    score += 20;
    notes.push(`✅ Rich response (${text.length} chars)`);
  } else if (text.length >= 100) {
    score += 15;
    notes.push(`✅ Adequate length (${text.length} chars)`);
  } else if (text.length >= minLen) {
    score += 10;
    notes.push(`⚠️ Short but present (${text.length} chars)`);
  } else {
    notes.push(`❌ Response too short (${text.length} chars)`);
  }

  // 3. No error signals (15 pts)
  const errorPatterns = [/⚠️ Error/i, /IPC error/i, /model not loaded/i, /not implemented/i, /panic/i, /thread.*main/i];
  const hasError = errorPatterns.some((re) => re.test(text));
  if (!hasError) {
    score += 15;
    notes.push("✅ No error signals");
  } else {
    notes.push("❌ Error signal detected in reply");
  }

  // 4. Structured output (10 pts)
  const hasCode = /```[\s\S]+```/.test(text);
  const hasList = /^[-*•]\s/m.test(text);
  const hasTable = /\|.+\|/.test(text) || /<table/i.test(text);
  const hasHeading = /^#{1,3}\s/m.test(text) || /<h[1-3]/i.test(text);
  const hasMath = /\$\$/.test(text) || /\\theta|\\nabla|\\frac/.test(text);
  if (opts.requireStructure) {
    if (hasCode || hasList || hasTable || hasHeading || hasMath) {
      score += 10;
      notes.push(`✅ Structured output (code=${hasCode}, list=${hasList}, table=${hasTable}, math=${hasMath})`);
    } else {
      notes.push("⚠️ No structured output (code/list/table/math) when expected");
    }
  } else {
    if (hasCode || hasList || hasTable || hasHeading || hasMath) {
      score += 10;
      notes.push(`✅ Structured formatting present`);
    } else {
      score += 5; // plain prose is fine
      notes.push("ℹ️ Plain prose (no markdown structure)");
    }
  }

  // 5. Sentence completeness (10 pts)
  const lastChar = text.trimEnd().slice(-1);
  if (['.', '!', '?', '`', ')'].includes(lastChar)) {
    score += 10;
    notes.push("✅ Complete sentence");
  } else {
    notes.push(`⚠️ Reply may be truncated (ends with '${lastChar}')`);
  }

  // 6. No hallucination markers (15 pts)
  const gibberish = /lorem ipsum|asdf{4,}|aaaa{4,}|zzz{4,}/i.test(text);
  const repetition = /([\w ]{10,})\1{3,}/.test(text);
  if (!gibberish && !repetition) {
    score += 15;
    notes.push("✅ No hallucination/repetition markers");
  } else {
    notes.push("❌ Possible hallucination/repetition detected");
  }

  return { score: Math.min(100, score), notes };
}

// ── Metrics Collector (singleton) ─────────────────────────────────────────────

class MetricsCollector {
  private entries: MetricEntry[] = [];
  private outputDir: string;

  constructor() {
    this.outputDir = path.resolve(__dirname, "test-results");
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  record(entry: MetricEntry): void {
    this.entries.push(entry);
    // Eagerly flush after each record so partial results survive crashes
    this.flush();
  }

  flush(): void {
    const jsonPath = path.join(this.outputDir, "latency-quality-report.json");
    const mdPath = path.join(this.outputDir, "latency-quality-report.md");
    fs.writeFileSync(jsonPath, JSON.stringify({ generated_at: new Date().toISOString(), entries: this.entries }, null, 2));
    fs.writeFileSync(mdPath, this.toMarkdown());
  }

  private toMarkdown(): string {
    const now = new Date().toISOString();
    const lines: string[] = [
      "# Student AI — Playwright Latency & Quality Report",
      "",
      `> Generated: ${now}  `,
      `> Total tests recorded: ${this.entries.length}`,
      "",
      "## Summary Table",
      "",
      "| Suite | Test | TTFT (ms) | Total (ms) | Quality | Words | Pass |",
      "|-------|------|----------:|----------:|--------:|------:|------|",
    ];

    for (const e of this.entries) {
      const ttft = e.ttft_ms != null ? e.ttft_ms.toString() : "—";
      const total = e.total_ms != null ? e.total_ms.toString() : "—";
      const qual = e.quality_score.toString() + "/100";
      const words = e.word_count.toString();
      const pass = e.passed ? "✅" : "❌";
      lines.push(`| ${e.suite} | ${e.test} | ${ttft} | ${total} | ${qual} | ${words} | ${pass} |`);
    }

    lines.push("", "## Detailed Results", "");

    for (const e of this.entries) {
      lines.push(`### ${e.suite} / ${e.test}`);
      lines.push("");
      lines.push(`- **TTFT**: ${e.ttft_ms != null ? e.ttft_ms + " ms" : "N/A"}`);
      lines.push(`- **Total**: ${e.total_ms != null ? e.total_ms + " ms" : "N/A"}`);
      lines.push(`- **Quality**: ${e.quality_score}/100`);
      lines.push(`- **Words**: ${e.word_count} | **Chars**: ${e.char_count}`);
      lines.push(`- **Passed**: ${e.passed ? "Yes" : "No"}`);
      if (e.error) lines.push(`- **Error**: ${e.error}`);
      lines.push(`- **Quality Notes**:`);
      for (const n of e.quality_notes) lines.push(`  - ${n}`);
      lines.push(`- **Reply snippet**: \`${e.text_snippet.replace(/`/g, "'")}\``);
      lines.push("");
    }

    // Aggregate stats
    const passed = this.entries.filter((e) => e.passed);
    const failed = this.entries.filter((e) => !e.passed);
    const withTtft = this.entries.filter((e) => e.ttft_ms != null);
    const avgTtft = withTtft.length > 0 ? Math.round(withTtft.reduce((s, e) => s + (e.ttft_ms ?? 0), 0) / withTtft.length) : null;
    const avgQuality = this.entries.length > 0 ? Math.round(this.entries.reduce((s, e) => s + e.quality_score, 0) / this.entries.length) : null;

    lines.push("## Aggregate Statistics", "");
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total tests | ${this.entries.length} |`);
    lines.push(`| Passed | ${passed.length} |`);
    lines.push(`| Failed | ${failed.length} |`);
    lines.push(`| Avg TTFT | ${avgTtft != null ? avgTtft + " ms" : "N/A"} |`);
    lines.push(`| Avg Quality | ${avgQuality != null ? avgQuality + "/100" : "N/A"} |`);
    lines.push("");

    return lines.join("\n");
  }

  getEntries(): MetricEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

// Export singleton
export const metrics = new MetricsCollector();

// ── Convenience factory ───────────────────────────────────────────────────────

/**
 * Build a MetricEntry from a timed reply result + quality score.
 */
export function buildEntry(
  opts: {
    suite: string;
    test: string;
    result: TimedReplyResult;
    quality: QualityResult;
    passed: boolean;
    error?: string;
  }
): MetricEntry {
  const words = opts.result.text.trim().split(/\s+/).filter(Boolean);
  return {
    suite: opts.suite,
    test: opts.test,
    timestamp: new Date().toISOString(),
    ttft_ms: opts.result.ttft_ms,
    total_ms: opts.result.total_ms,
    char_count: opts.result.text.length,
    word_count: words.length,
    quality_score: opts.quality.score,
    quality_notes: opts.quality.notes,
    text_snippet: opts.result.text.slice(0, 120),
    passed: opts.passed,
    error: opts.error,
  };
}
