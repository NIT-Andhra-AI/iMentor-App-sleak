use anyhow::{Context, Result};
use inference::session::{ChatMessage, GenerationParams, LlmEngine};
use std::path::PathBuf;
use std::time::Instant;
use tokio::sync::mpsc;

const CPU_GUARDRAIL: &str = "\
You are Student AI, an offline educational and career placement assistant for BTech/BE engineering students.

Answer ONLY questions about: engineering (all branches), mathematics, data structures and algorithms (DSA), placement interviews, coding rounds, core computer science (OS, DBMS, CN), and personal development.

Politely refuse anything off-topic: politics, current news, religion, adult content, illegal activities, financial speculation. Say: \"I'm here to help with your engineering studies and placement preparation. I can't assist with that, but feel free to ask me a DSA problem or core CS concept!\"

RESPONSE FORMAT (always follow):
1. **Concept / Approach** — define the core idea or algorithm approach concisely.
2. **How it works** — step-by-step logic, time/space complexity, or system architecture.
3. **Implementation / Example** — a code snippet (preferably C++, Java, or Python), diagram, or numerical example.
4. **Interview Pitfalls** — common mistakes, edge cases, and what interviewers look for.

STYLE:
- LaTeX math: $...$ inline, $$...$$ display. Never plain ASCII math ($x^2$ not x^2).
- Fenced code blocks with language tag. Code must be production-ready and optimized.
- Always write COMPLETE responses — never stop mid-explanation.
- Focus heavily on getting the student ready for top-tier tech and engineering placements.
- End every response with a **Practice check:** question (e.g., an edge case or follow-up question an interviewer might ask).
";

fn generate_plan(
    llm: &mut LlmEngine,
    user_prompt: &str,
) -> Result<(String, u128)> {
    let plan_messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: "\
You are a technical outline generator for a BTech engineering tutor.
Given the student's question, output ONLY a numbered list of 3-5 concise section \
headings that together form a complete, non-redundant answer.
Rules:
- Output headings only — no prose, no bullet sub-points, no explanations.
- Each heading must cover a distinct aspect; no overlap between sections.
- Number each heading (1. 2. 3. …).
- If the question has a single clear answer, 3 headings are enough."
                .to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: user_prompt.to_string(),
        },
    ];

    let plan_params = GenerationParams {
        max_tokens: 120,
        temperature: 0.3,
        top_p: 0.9,
        repeat_penalty: 1.0,
        system_prompt: None,
        no_think: true, // skip CoT for outline
    };

    let start = Instant::now();
    let plan = llm.generate_text(&plan_messages, &plan_params)?;
    let duration_ms = start.elapsed().as_millis();
    Ok((plan.trim().to_string(), duration_ms))
}

#[tokio::main]
async fn main() -> Result<()> {
    // Suppress verbose inference logging so our benchmark tables are pristine
    tracing_subscriber::fmt()
        .with_env_filter("inference=warn,model_bench=info")
        .init();

    let args: Vec<String> = std::env::args().collect();
    let gguf_files = if args.len() > 1 {
        args[1..].iter().map(PathBuf::from).collect()
    } else {
        vec![
            PathBuf::from("models/Qwen3-4B-Q4_K_M.gguf"),
            PathBuf::from("models/Qwen_Qwen3.5-4B-Q4_K_M.gguf"),
        ]
    };

    println!("\n=======================================================");
    println!("      STUDENT AI LOCAL INFERENCE BENCHMARK RUNNER      ");
    println!("=======================================================");
    println!("Models to evaluate: {:?}", gguf_files);

    // Multi-turn scenarios with simulated RAG injection on Turns 2 and 3
    let turns = vec![
        (
            "Explain gradient descent in simple words for a 2nd year BTech student.",
            "", // No RAG on greeting
        ),
        (
            "What is overfitting and how does regularization help? Give one practical example.",
            "Relevant course knowledge: Overfitting occurs when a machine learning model learns the training data too well, capturing noise instead of the general pattern. Regularization techniques (like L1 Lasso and L2 Ridge) add a penalty term to the loss function to constrain model weights and prevent overfitting. For example, in Ridge regression, the penalty is proportional to the sum of squared weights.",
        ),
        (
            "Differentiate supervised and unsupervised learning in a short exam-style answer.",
            "Relevant course knowledge: Supervised learning algorithms learn from labeled training datasets where the output mapping is known (e.g. classification, regression). Unsupervised learning algorithms identify hidden structures and patterns in unlabeled data (e.g. clustering with K-Means, dimensionality reduction with PCA).",
        ),
    ];

    for model_path in &gguf_files {
        if !model_path.exists() {
            println!("Skipping missing model: {:?}", model_path);
            continue;
        }

        let model_name = model_path.file_name().unwrap().to_string_lossy();
        println!("\n=======================================================");
        println!("MODEL: {}", model_name);
        println!("=======================================================");

        // Matrix of configurations
        let configs = vec![
            ("Standard, Banned Thinking", true, false), // (label, no_think, use_plan)
            ("Refine, Banned Thinking", true, true),
            ("Standard, Active Thinking", false, false),
            ("Refine, Active Thinking", false, true),
        ];

        for (cfg_label, no_think, use_plan) in configs {
            println!("\n>>> Configuration: {} <<<", cfg_label);

            // Load LLM in blocking task
            let model_path_clone = model_path.clone();
            let mut engine = tokio::task::spawn_blocking(move || {
                LlmEngine::load(&model_path_clone, 0, 4096)
            })
            .await??;

            // Keep track of conversational history
            let mut history: Vec<ChatMessage> = Vec::new();

            for (turn_idx, (user_prompt, rag_context)) in turns.iter().enumerate() {
                let turn_num = turn_idx + 1;
                println!("\n  [Turn {}]", turn_num);
                println!("  User Question: \"{}\"", user_prompt);
                if !rag_context.is_empty() {
                    println!("  RAG Context: Injected (~{} chars)", rag_context.len());
                }

                // ── Stage 1: Outline Generation (Refine Mode) ──────────────────
                let (plan_outline, plan_ms) = if use_plan {
                    print!("  Generating response structure plan... ");
                    let mut engine_temp = engine;
                    let user_prompt_str = user_prompt.to_string();
                    let (res, engine_returned) = tokio::task::spawn_blocking(move || {
                        let res = generate_plan(&mut engine_temp, &user_prompt_str);
                        (res, engine_temp)
                    })
                    .await?;
                    engine = engine_returned;
                    let (plan, ms) = res?;
                    println!("Done ({} ms)", ms);
                    (Some(plan), ms)
                } else {
                    (None, 0)
                };

                // ── Stage 2: Main Response Completion ────────────────────────
                // Build system prompt with guardrail + RAG context
                let mut system_prompt = if rag_context.is_empty() {
                    CPU_GUARDRAIL.to_string()
                } else {
                    format!("{}\n\n{}", CPU_GUARDRAIL, rag_context)
                };

                // Inject Plan outline if present
                if let Some(ref plan) = plan_outline {
                    system_prompt.push_str(&format!(
                        "\n\n## Response structure\n\
                         Follow this outline exactly — cover every section in order:\n\
                         {}\n\
                         Important: each section must contain ONLY new information. \
                         Never repeat or rephrase content already covered in a previous section.",
                        plan
                    ));
                }

                // Suppress thinking blocks if no_think is enabled
                if no_think {
                    system_prompt.push_str("\n/no_think");
                }

                // Compile messages
                let mut messages = vec![ChatMessage {
                    role: "system".to_string(),
                    content: system_prompt,
                }];

                // Add history
                messages.extend(history.clone());

                // Add latest turn
                messages.push(ChatMessage {
                    role: "user".to_string(),
                    content: user_prompt.to_string(),
                });

                // Run generation stream
                let (tx, mut rx) = mpsc::unbounded_channel::<String>();
                let start_time = Instant::now();
                let mut ttft_ms = None;
                let mut generated_tokens = 0;
                let mut full_response = String::new();

                let msgs = messages.clone();
                let params = GenerationParams {
                    max_tokens: 150, // Capped to 150 tokens to keep benchmarking rapid and clean
                    temperature: 0.7,
                    top_p: 0.9,
                    repeat_penalty: 1.1,
                    system_prompt: None,
                    no_think,
                };

                let mut engine_temp2 = engine;
                let engine_result = tokio::task::spawn_blocking(move || {
                    let _ = engine_temp2.generate_stream(&msgs, &params, tx, None);
                    engine_temp2
                });

                print!("  Assistant: ");
                loop {
                    match rx.recv().await {
                        Some(token) if token == "\x00" => break,
                        Some(token) => {
                            if ttft_ms.is_none() {
                                ttft_ms = Some(start_time.elapsed().as_millis());
                            }
                            generated_tokens += 1;
                            full_response.push_str(&token);
                            if generated_tokens <= 12 {
                                print!("{}", token.replace("\n", " "));
                            } else if generated_tokens == 13 {
                                print!("...");
                            }
                        }
                        None => break,
                    }
                }
                println!();

                engine = engine_result.await?;
                let duration_ms = start_time.elapsed().as_millis();
                let ttft = ttft_ms.unwrap_or(0);

                println!(
                    "  Metrics -> Plan: {} ms | TTFT: {} ms | Total: {} ms | Tokens: {}",
                    plan_ms, ttft, duration_ms, generated_tokens
                );

                // Save full response snippet to inspect quality
                let quality_snippet = full_response
                    .trim()
                    .replace("\n", " ")
                    .chars()
                    .take(90)
                    .collect::<String>();
                println!("  Quality Snippet: \"{}...\"", quality_snippet);

                // Append user and assistant to history
                history.push(ChatMessage {
                    role: "user".to_string(),
                    content: user_prompt.to_string(),
                });
                history.push(ChatMessage {
                    role: "assistant".to_string(),
                    content: full_response,
                });
            }
        }
    }

    Ok(())
}
