#!/usr/bin/env node
/**
 * Efficient model × thinking mode test
 * - Build once per model (3 builds)
 * - Each build tests both thinking modes by running 2 prompts
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const MODELS = [
  {
    name: "Qwen3.5-4B",
    slot: 6,
    file: "chat-model-6.gguf",
    source: "Qwen_Qwen3.5-4B-Q4_K_M.gguf",
    size_mb: 2810,
  },
  {
    name: "Qwen3-4B",
    slot: 5,
    file: "chat-model-5.gguf",
    source: "Qwen3-4B-Q4_K_M.gguf",
    size_mb: 2330,
  },
  {
    name: "Phi-4-mini",
    slot: 1,
    file: "chat-model-1.gguf",
    source: "Phi-4-mini-instruct-Q4_K_M.gguf",
    size_mb: 2400,
  },
];

const RESULTS = [];

function updateWorkspaceToml(model_name, no_think) {
  let content = fs.readFileSync("workspace.toml", "utf8");
  
  // Set no_think
  content = content.replace(
    /no_think\s*=\s*(?:true|false)/,
    `no_think     = ${no_think ? "true" : "false"}`
  );
  
  fs.writeFileSync("workspace.toml", content);
}

function build() {
  console.log("  🔨 Building...");
  execSync("python scripts/gen-config.py", { shell: "powershell.exe", stdio: "pipe" });
  execSync(
    `$env:RUSTFLAGS="-C target-cpu=native"; $env:LLAMA_LIB_PROFILE="Release"; cargo tauri build --target x86_64-pc-windows-msvc 2>&1 | Select-String "Finished|error" | Select-Object -Last 3`,
    { shell: "powershell.exe", stdio: "inherit" }
  );
}

function copyModel(source) {
  const models_dir = "C:\\Users\\sriph\\AppData\\Roaming\\com.studentai.app\\models";
  const src = path.join("d:\\app2\\app\\models", source);
  if (fs.existsSync(src)) {
    // Copy to all slots for safety, but only the active one matters
    MODELS.forEach(m => {
      const dest = path.join(models_dir, m.file);
      try {
        execSync(`Copy-Item "${src}" "${dest}" -Force -ErrorAction SilentlyContinue`, {
          shell: "powershell.exe",
          stdio: "pipe",
        });
      } catch {}
    });
  }
}

function install() {
  console.log("  📦 Installing...");
  execSync(
    `$u = "C:\\Users\\sriph\\AppData\\Local\\Student AI\\uninstall.exe"; if (Test-Path $u) { & $u /S; Start-Sleep -Seconds 8 }`,
    { shell: "powershell.exe", stdio: "pipe" }
  );
  execSync(
    `& "d:\\app2\\app\\dist\\windows\\StudentAI-net-setup-x86_64.exe" /S; $t=0; while($t -lt 120) { Start-Sleep 5; $t+=5; if (Test-Path "C:\\Users\\sriph\\AppData\\Local\\Student AI\\student-ai.exe") { break } }`,
    { shell: "powershell.exe", stdio: "pipe" }
  );
}

function runBenchmark(model_name, thinking) {
  console.log(`    ⏱️  Benchmark (${thinking ? "with" : "no"} thinking)...`);
  execSync(
    `node scripts/test-installed-playwright-metrics.mjs 2>&1 | Select-String "prompt|TTFT|saved" | Select-Object -Last 5`,
    { shell: "powershell.exe", stdio: "inherit" }
  );

  const metrics = JSON.parse(fs.readFileSync("reports/installed-playwright-metrics.json", "utf8"));
  const r = metrics.interactions[0];

  return {
    model: model_name,
    thinking,
    ttft_ms: r.latency_ms.first_token,
    total_ms: r.latency_ms.complete_response,
    reply_chars: r.reply_snippet.length,
    ram_mb: Math.round(r.process_metrics.peak_student_ai_working_set_mb),
  };
}

async function main() {
  console.log("=== Model × Thinking Mode Benchmark (Optimized) ===\n");

  const today = new Date().toISOString().split("T")[0];

  for (const model of MODELS) {
    console.log(`\n[${model.name}]`);

    // Step 1: Copy model files
    console.log("  📋 Staging model...");
    copyModel(model.source);

    // Step 2: Build
    build();

    // Step 3: Install
    install();

    // Step 4: Reset license
    execSync(
      `'{"install_date":"${today}","last_active":"${today}","activated":true}' | Set-Content "C:\\Users\\sriph\\AppData\\Roaming\\com.studentai.app\\license.json" -Encoding UTF8`,
      { shell: "powershell.exe", stdio: "pipe" }
    );

    // Step 5: Test WITH thinking (no_think=false)
    console.log("  Testing WITH thinking...");
    updateWorkspaceToml(model.name, false);
    build();
    install();
    const with_thinking = runBenchmark(model.name, true);
    RESULTS.push(with_thinking);

    // Step 6: Test WITHOUT thinking (no_think=true)
    console.log("  Testing WITHOUT thinking...");
    updateWorkspaceToml(model.name, true);
    build();
    install();
    const without_thinking = runBenchmark(model.name, false);
    RESULTS.push(without_thinking);
  }

  // Print results table
  console.log("\n\n╔════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                  MODEL × THINKING MODE PERFORMANCE MATRIX                       ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════════╝\n");

  const table_data = RESULTS.map((r) => ({
    Model: r.model,
    Thinking: r.thinking ? "✓" : "✗",
    "TTFT (ms)": r.ttft_ms,
    "Total (ms)": r.total_ms,
    "Reply (chars)": r.reply_chars,
    "RAM (MB)": r.ram_mb,
  }));

  console.table(table_data);

  // Analysis
  console.log("\n╔════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                            ANALYSIS & INSIGHTS                                 ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════════╝\n");

  const qwen35_with = RESULTS.find((r) => r.model === "Qwen3.5-4B" && r.thinking);
  const qwen35_without = RESULTS.find((r) => r.model === "Qwen3.5-4B" && !r.thinking);
  const qwen3_with = RESULTS.find((r) => r.model === "Qwen3-4B" && r.thinking);
  const qwen3_without = RESULTS.find((r) => r.model === "Qwen3-4B" && !r.thinking);

  if (qwen35_with && qwen35_without) {
    const thinking_overhead = ((qwen35_with.ttft_ms - qwen35_without.ttft_ms) / qwen35_without.ttft_ms * 100).toFixed(0);
    console.log(`Qwen3.5-4B Thinking Overhead: ${thinking_overhead}% (${qwen35_with.ttft_ms}ms vs ${qwen35_without.ttft_ms}ms TTFT)`);
  }

  if (qwen3_with && qwen3_without) {
    const thinking_overhead = ((qwen3_with.ttft_ms - qwen3_without.ttft_ms) / qwen3_without.ttft_ms * 100).toFixed(0);
    console.log(`Qwen3-4B Thinking Overhead: ${thinking_overhead}% (${qwen3_with.ttft_ms}ms vs ${qwen3_without.ttft_ms}ms TTFT)`);
  }

  if (qwen35_without && qwen3_without) {
    const improvement = ((qwen35_without.ttft_ms - qwen3_without.ttft_ms) / qwen35_without.ttft_ms * 100).toFixed(0);
    console.log(`\nQwen3-4B vs Qwen3.5-4B (no-thinking): ${improvement}% faster (${qwen3_without.ttft_ms}ms vs ${qwen35_without.ttft_ms}ms)`);
  }

  // Save results
  fs.writeFileSync(
    "reports/model-thinking-matrix-final.json",
    JSON.stringify({ timestamp: new Date().toISOString(), results: RESULTS }, null, 2)
  );

  console.log("\n✅ Full results saved to: reports/model-thinking-matrix-final.json");
}

main().catch(console.error);
