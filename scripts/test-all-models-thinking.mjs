#!/usr/bin/env node
/**
 * Test all model × thinking mode combinations
 * Measures TTFT and output quality
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const TEST_CONFIGS = [
  {
    name: "Qwen3.5-4B (with thinking)",
    model_slot: 6,
    model_file: "chat-model-6.gguf",
    source: "Qwen_Qwen3.5-4B-Q4_K_M.gguf",
    no_think: false,
  },
  {
    name: "Qwen3.5-4B (instant/no-thinking)",
    model_slot: 6,
    model_file: "chat-model-6.gguf",
    source: "Qwen_Qwen3.5-4B-Q4_K_M.gguf",
    no_think: true,
  },
  {
    name: "Qwen3-4B (with thinking)",
    model_slot: 5,
    model_file: "chat-model-5.gguf",
    source: "Qwen3-4B-Q4_K_M.gguf",
    no_think: false,
  },
  {
    name: "Qwen3-4B (instant/no-thinking)",
    model_slot: 5,
    model_file: "chat-model-5.gguf",
    source: "Qwen3-4B-Q4_K_M.gguf",
    no_think: true,
  },
  {
    name: "Phi-4-mini (with thinking)",
    model_slot: 1,
    model_file: "chat-model-1.gguf",
    source: "Phi-4-mini-instruct-Q4_K_M.gguf",
    no_think: false,
  },
  {
    name: "Phi-4-mini (instant/no-thinking)",
    model_slot: 1,
    model_file: "chat-model-1.gguf",
    source: "Phi-4-mini-instruct-Q4_K_M.gguf",
    no_think: true,
  },
];

const MODELS_DIR = "C:\\Users\\sriph\\AppData\\Roaming\\com.studentai.app\\models";
const RESULTS = [];

async function runBenchmark(config) {
  console.log(`\n[TEST] Starting: ${config.name}`);

  // 1. Copy model to correct slot
  const source_path = path.join("d:\\app2\\app\\models", config.source);
  const dest_path = path.join(MODELS_DIR, config.model_file);

  if (!fs.existsSync(source_path)) {
    console.error(`  ❌ Model not found: ${source_path}`);
    return null;
  }

  console.log(`  📋 Copying model: ${config.source} → ${config.model_file}`);
  execSync(`Copy-Item "${source_path}" "${dest_path}" -Force`, {
    shell: "powershell.exe",
  });

  // 2. Update workspace.toml with thinking mode
  let workspace_content = fs.readFileSync("workspace.toml", "utf8");
  const no_think_str = config.no_think ? "true" : "false";
  workspace_content = workspace_content.replace(
    /no_think\s*=\s*(?:true|false)/,
    `no_think     = ${no_think_str}`
  );
  fs.writeFileSync("workspace.toml", workspace_content);
  console.log(`  ⚙️  Set no_think = ${no_think_str}`);

  // 3. Regenerate configs
  console.log(`  🔨 Regenerating configs...`);
  execSync("python scripts/gen-config.py", { shell: "powershell.exe" });

  // 4. Build
  console.log(`  🔨 Building...`);
  execSync(
    `$env:RUSTFLAGS="-C target-cpu=native"; cargo tauri build --target x86_64-pc-windows-msvc 2>&1 | Select-Object -Last 5`,
    {
      shell: "powershell.exe",
      stdio: "inherit",
    }
  );

  // 5. Install & run benchmark
  console.log(`  📦 Installing...`);
  execSync(
    `$u = "C:\\Users\\sriph\\AppData\\Local\\Student AI\\uninstall.exe"; if (Test-Path $u) { & $u /S; Start-Sleep -Seconds 10 }`,
    { shell: "powershell.exe", stdio: "inherit" }
  );
  execSync(`& "d:\\app2\\app\\dist\\windows\\StudentAI-net-setup-x86_64.exe" /S; Start-Sleep -Seconds 60`, {
    shell: "powershell.exe",
    stdio: "inherit",
  });

  // 6. Reset license
  const today = new Date().toISOString().split("T")[0];
  execSync(
    `'{"install_date":"${today}","last_active":"${today}","activated":true}' | Set-Content "C:\\Users\\sriph\\AppData\\Roaming\\com.studentai.app\\license.json" -Encoding UTF8`,
    { shell: "powershell.exe" }
  );

  // 7. Run benchmark
  console.log(`  ⏱️  Running benchmark (this takes ~15-20 min)...`);
  const result_file = `reports/installed-metrics-${config.name
    .replace(/\s+/g, "-")
    .toLowerCase()}.json`;

  execSync(
    `node scripts/test-installed-playwright-metrics.mjs 2>&1 | Out-Null; Move-Item reports/installed-playwright-metrics.json "${result_file}" -Force`,
    { shell: "powershell.exe", stdio: "inherit" }
  );

  // 8. Read results
  const metrics = JSON.parse(fs.readFileSync(result_file, "utf8"));
  const interaction = metrics.interactions[0];
  const ttft = interaction.latency_ms.first_token;
  const total = interaction.latency_ms.complete_response;
  const reply_len = interaction.reply_snippet.length;

  const result = {
    config: config.name,
    model_slot: config.model_slot,
    thinking: !config.no_think,
    ttft_ms: ttft,
    total_ms: total,
    reply_length_chars: reply_len,
    result_file,
    snippet: interaction.reply_snippet.substring(0, 100),
  };

  RESULTS.push(result);
  console.log(`  ✅ Complete: TTFT=${ttft}ms, Total=${total}ms, Reply=${reply_len} chars`);
  return result;
}

async function main() {
  console.log("=== Model × Thinking Mode Benchmark Matrix ===\n");

  for (const config of TEST_CONFIGS) {
    try {
      await runBenchmark(config);
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
    }
  }

  // Summary table
  console.log("\n\n=== RESULTS SUMMARY ===\n");
  console.table(RESULTS.map(r => ({
    Model: r.config,
    "Thinking": r.thinking ? "✓" : "✗",
    "TTFT (ms)": r.ttft_ms,
    "Total (ms)": r.total_ms,
    "Reply Length": r.reply_length_chars,
  })));

  // Save summary
  fs.writeFileSync(
    "reports/model-thinking-matrix.json",
    JSON.stringify({ timestamp: new Date().toISOString(), results: RESULTS }, null, 2)
  );

  console.log("\n✅ Summary saved to: reports/model-thinking-matrix.json");
}

main().catch(console.error);
