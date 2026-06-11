use anyhow::Result;
use chrono::Utc;
use inference::{
    cpu_profile::CpuProfile,
    session::{ChatMessage, GenerationParams, LlmEngine},
};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use tokio::sync::mpsc;
use tracing::{info, warn};

// ─── Question bank ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Question {
    id: u32,
    subject: String,
    question: String,
    keywords: Vec<String>, // Expected keywords for quality scoring
}

fn btech_questions() -> Vec<Question> {
    vec![
        // ── Operating Systems (10) ──────────────────────────────────────────
        Question { id: 1, subject: "OS".into(), question: "What is a process and how does it differ from a program?".into(), keywords: vec!["execution".into(), "memory".into(), "program counter".into(), "state".into()] },
        Question { id: 2, subject: "OS".into(), question: "Explain the difference between preemptive and non-preemptive scheduling.".into(), keywords: vec!["interrupt".into(), "CPU".into(), "voluntary".into(), "forced".into()] },
        Question { id: 3, subject: "OS".into(), question: "What is deadlock? List the four necessary conditions for deadlock.".into(), keywords: vec!["mutual exclusion".into(), "hold and wait".into(), "no preemption".into(), "circular wait".into()] },
        Question { id: 4, subject: "OS".into(), question: "Explain virtual memory and how paging works.".into(), keywords: vec!["page table".into(), "page fault".into(), "physical".into(), "virtual address".into()] },
        Question { id: 5, subject: "OS".into(), question: "What is a semaphore and how is it used for process synchronization?".into(), keywords: vec!["wait".into(), "signal".into(), "mutex".into(), "critical section".into()] },
        Question { id: 6, subject: "OS".into(), question: "Describe the round-robin CPU scheduling algorithm.".into(), keywords: vec!["time quantum".into(), "context switch".into(), "queue".into(), "fair".into()] },
        Question { id: 7, subject: "OS".into(), question: "What is thrashing in the context of virtual memory?".into(), keywords: vec!["page fault".into(), "working set".into(), "swap".into(), "CPU utilization".into()] },
        Question { id: 8, subject: "OS".into(), question: "Explain the concept of a thread and how it differs from a process.".into(), keywords: vec!["lightweight".into(), "shared memory".into(), "concurrent".into(), "process".into()] },
        Question { id: 9, subject: "OS".into(), question: "What is the banker's algorithm and when is it used?".into(), keywords: vec!["deadlock avoidance".into(), "safe state".into(), "resource allocation".into()] },
        Question { id: 10, subject: "OS".into(), question: "Describe the differences between internal and external fragmentation.".into(), keywords: vec!["memory".into(), "compaction".into(), "partition".into(), "waste".into()] },

        // ── DBMS (10) ───────────────────────────────────────────────────────
        Question { id: 11, subject: "DBMS".into(), question: "What is normalization? Explain 1NF, 2NF, and 3NF.".into(), keywords: vec!["functional dependency".into(), "redundancy".into(), "atomic".into(), "transitive".into()] },
        Question { id: 12, subject: "DBMS".into(), question: "Explain ACID properties in database transactions.".into(), keywords: vec!["atomicity".into(), "consistency".into(), "isolation".into(), "durability".into()] },
        Question { id: 13, subject: "DBMS".into(), question: "What is a SQL JOIN? Explain INNER JOIN and LEFT JOIN with examples.".into(), keywords: vec!["inner join".into(), "left join".into(), "match".into(), "NULL".into()] },
        Question { id: 14, subject: "DBMS".into(), question: "What is indexing in databases and what are its types?".into(), keywords: vec!["B-tree".into(), "clustered".into(), "non-clustered".into(), "performance".into()] },
        Question { id: 15, subject: "DBMS".into(), question: "Explain the difference between a primary key and a foreign key.".into(), keywords: vec!["unique".into(), "reference".into(), "constraint".into(), "relationship".into()] },
        Question { id: 16, subject: "DBMS".into(), question: "What is a transaction? Describe concurrency control mechanisms.".into(), keywords: vec!["lock".into(), "schedule".into(), "serializable".into(), "rollback".into()] },
        Question { id: 17, subject: "DBMS".into(), question: "What is an ER diagram? Explain entities, attributes, and relationships.".into(), keywords: vec!["entity".into(), "attribute".into(), "cardinality".into(), "relationship".into()] },
        Question { id: 18, subject: "DBMS".into(), question: "What is a stored procedure and what are its advantages?".into(), keywords: vec!["precompiled".into(), "performance".into(), "reusable".into(), "server".into()] },
        Question { id: 19, subject: "DBMS".into(), question: "Explain the difference between DELETE, TRUNCATE, and DROP in SQL.".into(), keywords: vec!["rollback".into(), "DDL".into(), "DML".into(), "table".into()] },
        Question { id: 20, subject: "DBMS".into(), question: "What is denormalization and when would you use it?".into(), keywords: vec!["performance".into(), "redundancy".into(), "read".into(), "join".into()] },

        // ── Computer Networks (10) ───────────────────────────────────────────
        Question { id: 21, subject: "CN".into(), question: "Explain the OSI model and its seven layers.".into(), keywords: vec!["physical".into(), "data link".into(), "network".into(), "transport".into(), "application".into()] },
        Question { id: 22, subject: "CN".into(), question: "What is the difference between TCP and UDP?".into(), keywords: vec!["reliable".into(), "connection".into(), "handshake".into(), "stateless".into()] },
        Question { id: 23, subject: "CN".into(), question: "Explain how IP addressing works and what is subnetting?".into(), keywords: vec!["subnet mask".into(), "CIDR".into(), "host".into(), "network".into()] },
        Question { id: 24, subject: "CN".into(), question: "What is the purpose of the DNS and how does it work?".into(), keywords: vec!["domain name".into(), "IP address".into(), "resolver".into(), "recursive".into()] },
        Question { id: 25, subject: "CN".into(), question: "Explain the three-way handshake in TCP connection establishment.".into(), keywords: vec!["SYN".into(), "SYN-ACK".into(), "ACK".into(), "connection".into()] },
        Question { id: 26, subject: "CN".into(), question: "What is ARP and why is it used in networking?".into(), keywords: vec!["MAC address".into(), "IP".into(), "broadcast".into(), "mapping".into()] },
        Question { id: 27, subject: "CN".into(), question: "Describe the difference between a hub, switch, and router.".into(), keywords: vec!["MAC".into(), "IP".into(), "broadcast domain".into(), "collision".into()] },
        Question { id: 28, subject: "CN".into(), question: "What is HTTPS and how does SSL/TLS provide security?".into(), keywords: vec!["encryption".into(), "certificate".into(), "handshake".into(), "public key".into()] },
        Question { id: 29, subject: "CN".into(), question: "Explain the concept of congestion control in TCP.".into(), keywords: vec!["slow start".into(), "window".into(), "AIMD".into(), "threshold".into()] },
        Question { id: 30, subject: "CN".into(), question: "What is NAT and what problem does it solve?".into(), keywords: vec!["private IP".into(), "public IP".into(), "translation".into(), "IPv4".into()] },

        // ── Data Structures (10) ─────────────────────────────────────────────
        Question { id: 31, subject: "DS".into(), question: "Explain the differences between stack and queue data structures.".into(), keywords: vec!["LIFO".into(), "FIFO".into(), "push".into(), "enqueue".into()] },
        Question { id: 32, subject: "DS".into(), question: "What is a binary search tree? Describe insertion and deletion.".into(), keywords: vec!["left".into(), "right".into(), "inorder".into(), "balanced".into()] },
        Question { id: 33, subject: "DS".into(), question: "Explain graph representation using adjacency matrix and adjacency list.".into(), keywords: vec!["vertex".into(), "edge".into(), "space".into(), "sparse".into()] },
        Question { id: 34, subject: "DS".into(), question: "What is a hash table? How are collisions resolved?".into(), keywords: vec!["hash function".into(), "chaining".into(), "open addressing".into(), "load factor".into()] },
        Question { id: 35, subject: "DS".into(), question: "Describe the heap data structure and its applications.".into(), keywords: vec!["max-heap".into(), "min-heap".into(), "heapify".into(), "priority queue".into()] },
        Question { id: 36, subject: "DS".into(), question: "What is a linked list? Compare singly and doubly linked lists.".into(), keywords: vec!["node".into(), "pointer".into(), "head".into(), "traversal".into()] },
        Question { id: 37, subject: "DS".into(), question: "Explain depth-first search (DFS) and breadth-first search (BFS).".into(), keywords: vec!["stack".into(), "queue".into(), "visited".into(), "traversal".into()] },
        Question { id: 38, subject: "DS".into(), question: "What is an AVL tree and why is it important?".into(), keywords: vec!["balanced".into(), "rotation".into(), "height".into(), "O(log n)".into()] },
        Question { id: 39, subject: "DS".into(), question: "Describe dynamic programming with an example.".into(), keywords: vec!["memoization".into(), "overlapping".into(), "optimal".into(), "subproblem".into()] },
        Question { id: 40, subject: "DS".into(), question: "What is the time complexity of common sorting algorithms?".into(), keywords: vec!["O(n log n)".into(), "quicksort".into(), "merge sort".into(), "bubble sort".into()] },

        // ── Algorithms (10) ─────────────────────────────────────────────────
        Question { id: 41, subject: "Algorithms".into(), question: "Explain Dijkstra's shortest path algorithm.".into(), keywords: vec!["priority queue".into(), "weighted".into(), "greedy".into(), "distance".into()] },
        Question { id: 42, subject: "Algorithms".into(), question: "What is the difference between greedy algorithms and dynamic programming?".into(), keywords: vec!["locally optimal".into(), "globally".into(), "subproblem".into(), "choice".into()] },
        Question { id: 43, subject: "Algorithms".into(), question: "Describe merge sort and analyze its time complexity.".into(), keywords: vec!["divide".into(), "conquer".into(), "O(n log n)".into(), "merge".into()] },
        Question { id: 44, subject: "Algorithms".into(), question: "What is Big-O notation and why is it used?".into(), keywords: vec!["asymptotic".into(), "worst case".into(), "growth".into(), "complexity".into()] },
        Question { id: 45, subject: "Algorithms".into(), question: "Explain the knapsack problem and how to solve it with DP.".into(), keywords: vec!["weight".into(), "value".into(), "capacity".into(), "optimal".into()] },
        Question { id: 46, subject: "Algorithms".into(), question: "What is binary search and what is its time complexity?".into(), keywords: vec!["sorted".into(), "O(log n)".into(), "mid".into(), "halve".into()] },
        Question { id: 47, subject: "Algorithms".into(), question: "Describe Kruskal's algorithm for finding a minimum spanning tree.".into(), keywords: vec!["edge".into(), "sort".into(), "cycle".into(), "union-find".into()] },
        Question { id: 48, subject: "Algorithms".into(), question: "What is backtracking and give an example of its application?".into(), keywords: vec!["N-queens".into(), "prune".into(), "explore".into(), "candidate".into()] },
        Question { id: 49, subject: "Algorithms".into(), question: "Explain the concept of NP-completeness.".into(), keywords: vec!["polynomial".into(), "reduction".into(), "nondeterministic".into(), "intractable".into()] },
        Question { id: 50, subject: "Algorithms".into(), question: "What is the Bellman-Ford algorithm and how does it differ from Dijkstra's?".into(), keywords: vec!["negative weight".into(), "relaxation".into(), "iteration".into(), "O(VE)".into()] },

        // ── Digital Logic (10) ───────────────────────────────────────────────
        Question { id: 51, subject: "DLD".into(), question: "What are the basic logic gates? Describe AND, OR, NOT, NAND, NOR.".into(), keywords: vec!["truth table".into(), "gate".into(), "Boolean".into(), "output".into()] },
        Question { id: 52, subject: "DLD".into(), question: "Explain Boolean algebra and De Morgan's theorems.".into(), keywords: vec!["complement".into(), "AND".into(), "OR".into(), "simplify".into()] },
        Question { id: 53, subject: "DLD".into(), question: "What is a Karnaugh map and how is it used to simplify Boolean expressions?".into(), keywords: vec!["grouping".into(), "SOP".into(), "minimize".into(), "cell".into()] },
        Question { id: 54, subject: "DLD".into(), question: "Describe the difference between combinational and sequential circuits.".into(), keywords: vec!["memory".into(), "flip-flop".into(), "state".into(), "output".into()] },
        Question { id: 55, subject: "DLD".into(), question: "What is a flip-flop? Explain the D flip-flop operation.".into(), keywords: vec!["clock".into(), "D input".into(), "Q output".into(), "edge".into()] },
        Question { id: 56, subject: "DLD".into(), question: "Explain binary addition and how a half adder works.".into(), keywords: vec!["sum".into(), "carry".into(), "XOR".into(), "AND gate".into()] },
        Question { id: 57, subject: "DLD".into(), question: "What is a multiplexer and how does it work?".into(), keywords: vec!["select".into(), "data input".into(), "output".into(), "2^n".into()] },
        Question { id: 58, subject: "DLD".into(), question: "Describe number systems: binary, octal, hexadecimal conversions.".into(), keywords: vec!["base".into(), "conversion".into(), "hexadecimal".into(), "binary".into()] },
        Question { id: 59, subject: "DLD".into(), question: "What is a finite state machine? Explain with an example.".into(), keywords: vec!["state".into(), "transition".into(), "Mealy".into(), "Moore".into()] },
        Question { id: 60, subject: "DLD".into(), question: "What is a decoder and how does it differ from an encoder?".into(), keywords: vec!["n-to-2^n".into(), "enable".into(), "output line".into(), "priority".into()] },

        // ── OOP (10) ─────────────────────────────────────────────────────────
        Question { id: 61, subject: "OOP".into(), question: "Explain the four pillars of object-oriented programming.".into(), keywords: vec!["encapsulation".into(), "inheritance".into(), "polymorphism".into(), "abstraction".into()] },
        Question { id: 62, subject: "OOP".into(), question: "What is polymorphism? Explain compile-time and runtime polymorphism.".into(), keywords: vec!["overloading".into(), "overriding".into(), "virtual".into(), "method".into()] },
        Question { id: 63, subject: "OOP".into(), question: "What is the difference between an abstract class and an interface?".into(), keywords: vec!["implement".into(), "extend".into(), "method body".into(), "multiple inheritance".into()] },
        Question { id: 64, subject: "OOP".into(), question: "Describe inheritance and the concept of method overriding.".into(), keywords: vec!["parent".into(), "child".into(), "super".into(), "override".into()] },
        Question { id: 65, subject: "OOP".into(), question: "What is encapsulation and how do access modifiers support it?".into(), keywords: vec!["private".into(), "public".into(), "getter".into(), "setter".into()] },
        Question { id: 66, subject: "OOP".into(), question: "Explain the concept of constructors and destructors.".into(), keywords: vec!["initialization".into(), "object".into(), "new".into(), "cleanup".into()] },
        Question { id: 67, subject: "OOP".into(), question: "What is the SOLID principle in OOP?".into(), keywords: vec!["single responsibility".into(), "open/closed".into(), "Liskov".into(), "dependency".into()] },
        Question { id: 68, subject: "OOP".into(), question: "What are design patterns? Explain the Singleton pattern.".into(), keywords: vec!["creational".into(), "instance".into(), "private constructor".into(), "global".into()] },
        Question { id: 69, subject: "OOP".into(), question: "Explain exception handling in OOP languages.".into(), keywords: vec!["try".into(), "catch".into(), "throw".into(), "finally".into()] },
        Question { id: 70, subject: "OOP".into(), question: "What is composition vs inheritance? When would you prefer each?".into(), keywords: vec!["has-a".into(), "is-a".into(), "flexibility".into(), "coupling".into()] },

        // ── Compiler Design (10) ─────────────────────────────────────────────
        Question { id: 71, subject: "CD".into(), question: "Describe the phases of a compiler.".into(), keywords: vec!["lexical".into(), "parsing".into(), "semantic".into(), "code generation".into()] },
        Question { id: 72, subject: "CD".into(), question: "What is lexical analysis and what does a lexer produce?".into(), keywords: vec!["token".into(), "lexeme".into(), "pattern".into(), "scanner".into()] },
        Question { id: 73, subject: "CD".into(), question: "Explain context-free grammars and parse trees.".into(), keywords: vec!["production rule".into(), "terminal".into(), "non-terminal".into(), "derivation".into()] },
        Question { id: 74, subject: "CD".into(), question: "What is the difference between LL and LR parsing?".into(), keywords: vec!["top-down".into(), "bottom-up".into(), "lookahead".into(), "reduce".into()] },
        Question { id: 75, subject: "CD".into(), question: "Describe the role of a symbol table in compilation.".into(), keywords: vec!["identifier".into(), "type".into(), "scope".into(), "lookup".into()] },
        Question { id: 76, subject: "CD".into(), question: "What is intermediate code generation and why is it used?".into(), keywords: vec!["three-address code".into(), "portable".into(), "optimization".into(), "IR".into()] },
        Question { id: 77, subject: "CD".into(), question: "Explain the concept of semantic analysis in a compiler.".into(), keywords: vec!["type checking".into(), "scope".into(), "declaration".into(), "error".into()] },
        Question { id: 78, subject: "CD".into(), question: "What is register allocation in compiler optimization?".into(), keywords: vec!["variable".into(), "spill".into(), "graph coloring".into(), "CPU register".into()] },
        Question { id: 79, subject: "CD".into(), question: "Describe the difference between an interpreter and a compiler.".into(), keywords: vec!["source code".into(), "execute".into(), "translate".into(), "bytecode".into()] },
        Question { id: 80, subject: "CD".into(), question: "What is a regular expression and how does it relate to finite automata?".into(), keywords: vec!["pattern".into(), "NFA".into(), "DFA".into(), "language".into()] },

        // ── Computer Organization (10) ────────────────────────────────────────
        Question { id: 81, subject: "COA".into(), question: "Explain the fetch-decode-execute cycle of a CPU.".into(), keywords: vec!["program counter".into(), "instruction register".into(), "ALU".into(), "memory".into()] },
        Question { id: 82, subject: "COA".into(), question: "What is pipelining in computer architecture?".into(), keywords: vec!["stage".into(), "hazard".into(), "throughput".into(), "fetch".into()] },
        Question { id: 83, subject: "COA".into(), question: "Describe cache memory and how it improves CPU performance.".into(), keywords: vec!["L1".into(), "L2".into(), "hit".into(), "miss".into()] },
        Question { id: 84, subject: "COA".into(), question: "What is RISC vs CISC architecture?".into(), keywords: vec!["reduced".into(), "complex".into(), "instruction set".into(), "pipeline".into()] },
        Question { id: 85, subject: "COA".into(), question: "Explain different types of memory: RAM, ROM, cache, registers.".into(), keywords: vec!["volatile".into(), "hierarchy".into(), "speed".into(), "capacity".into()] },
        Question { id: 86, subject: "COA".into(), question: "What is DMA (Direct Memory Access) and what is its purpose?".into(), keywords: vec!["I/O".into(), "CPU bypass".into(), "transfer".into(), "controller".into()] },
        Question { id: 87, subject: "COA".into(), question: "Describe the concept of instruction-level parallelism.".into(), keywords: vec!["superscalar".into(), "out-of-order".into(), "IPC".into(), "pipeline".into()] },
        Question { id: 88, subject: "COA".into(), question: "What is the purpose of the ALU in a CPU?".into(), keywords: vec!["arithmetic".into(), "logic".into(), "addition".into(), "operand".into()] },
        Question { id: 89, subject: "COA".into(), question: "Explain the concept of interrupts in computer architecture.".into(), keywords: vec!["ISR".into(), "hardware".into(), "software".into(), "handler".into()] },
        Question { id: 90, subject: "COA".into(), question: "What is bus architecture and describe the types of buses in a computer?".into(), keywords: vec!["data bus".into(), "address bus".into(), "control bus".into(), "bandwidth".into()] },

        // ── Engineering Mathematics (10) ──────────────────────────────────────
        Question { id: 91, subject: "Math".into(), question: "What is a probability distribution? Explain normal distribution.".into(), keywords: vec!["mean".into(), "variance".into(), "bell curve".into(), "standard deviation".into()] },
        Question { id: 92, subject: "Math".into(), question: "Explain eigenvalues and eigenvectors with an application.".into(), keywords: vec!["matrix".into(), "transformation".into(), "characteristic".into(), "PCA".into()] },
        Question { id: 93, subject: "Math".into(), question: "What is a Fourier transform and why is it useful?".into(), keywords: vec!["frequency".into(), "signal".into(), "sinusoidal".into(), "decompose".into()] },
        Question { id: 94, subject: "Math".into(), question: "Describe the concept of numerical integration (trapezoidal rule, Simpson's rule).".into(), keywords: vec!["area".into(), "trapezoid".into(), "approximation".into(), "interval".into()] },
        Question { id: 95, subject: "Math".into(), question: "What is a graph in discrete mathematics? Define trees and spanning trees.".into(), keywords: vec!["vertex".into(), "edge".into(), "acyclic".into(), "connected".into()] },
        Question { id: 96, subject: "Math".into(), question: "Explain the concept of limits and continuity in calculus.".into(), keywords: vec!["approaching".into(), "function".into(), "epsilon-delta".into(), "continuous".into()] },
        Question { id: 97, subject: "Math".into(), question: "What is Bayes' theorem and give an application example?".into(), keywords: vec!["prior".into(), "posterior".into(), "conditional probability".into(), "evidence".into()] },
        Question { id: 98, subject: "Math".into(), question: "Describe matrix multiplication and its properties.".into(), keywords: vec!["rows".into(), "columns".into(), "associative".into(), "identity matrix".into()] },
        Question { id: 99, subject: "Math".into(), question: "What is a differential equation and how is it solved?".into(), keywords: vec!["derivative".into(), "order".into(), "general solution".into(), "initial condition".into()] },
        Question { id: 100, subject: "Math".into(), question: "Explain the pigeonhole principle and its application in computer science.".into(), keywords: vec!["pigeonhole".into(), "collision".into(), "hash".into(), "distribution".into()] },
    ]
}

// ─── Benchmark types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct QuestionResult {
    id: u32,
    subject: String,
    question: String,
    response: String,
    thinking_mode: bool,       // Was /think mode active?
    ttft_ms: u64,              // Time to first token of ANY kind (ms)
    think_end_ms: Option<u64>, // Time when </think> block closed (ms)
    answer_ttft_ms: Option<u64>, // Time to first actual answer token after </think>
    total_ms: u64,             // Total response time (ms)
    tokens_generated: u32,     // Total tokens including think block
    think_tokens: u32,         // Tokens inside <think>...</think>
    answer_tokens: u32,        // Tokens after </think> (the actual answer)
    tokens_per_sec: f64,       // Overall tok/s
    answer_tokens_per_sec: f64, // tok/s for answer portion only
    keyword_hits: u32,
    keyword_total: u32,
    quality_score: f64,        // keyword_hits / keyword_total (against answer only)
}

#[derive(Debug, Serialize, Deserialize)]
struct ModelBenchResult {
    model_name: String,
    model_path: String,
    timestamp: String,
    thinking_mode: bool,
    questions: Vec<QuestionResult>,
    // Aggregates
    avg_ttft_ms: f64,
    avg_think_end_ms: Option<f64>,
    avg_answer_ttft_ms: Option<f64>,
    avg_total_ms: f64,
    avg_tokens_per_sec: f64,
    avg_think_tokens: f64,
    avg_quality_score: f64,
    per_subject: Vec<SubjectSummary>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SubjectSummary {
    subject: String,
    avg_ttft_ms: f64,
    avg_total_ms: f64,
    avg_quality_score: f64,
    question_count: u32,
}

// ─── Core benchmark runner ────────────────────────────────────────────────────

/// Whether a model supports the /think / /no_think switching.
/// Qwen3 and Qwen3.5 models use this mechanism.
fn model_supports_thinking(model_name: &str) -> bool {
    let n = model_name.to_lowercase();
    n.contains("qwen3") || n.contains("qwen3.5")
}

/// Build the user content for a question, optionally appending the think directive.
fn user_content(question: &str, thinking: bool, supports_thinking: bool) -> String {
    if supports_thinking {
        // Qwen3/3.5 thinking protocol: append /think or /no_think
        if thinking {
            format!("{}\n/think", question)
        } else {
            format!("{}\n/no_think", question)
        }
    } else {
        question.to_string()
    }
}

/// Extract the answer portion from a response that may contain a <think> block.
/// Returns (think_text, answer_text, think_token_count).
fn split_think_answer(response: &str) -> (String, String, u32) {
    if let (Some(start), Some(end)) = (response.find("<think>"), response.find("</think>")) {
        let think_text = response[start + 7..end].to_string();
        let answer_text = response[end + 8..].trim_start().to_string();
        // Rough token count: words / 0.75
        let think_tokens = (think_text.split_whitespace().count() as f64 / 0.75).round() as u32;
        (think_text, answer_text, think_tokens)
    } else {
        (String::new(), response.to_string(), 0)
    }
}

async fn bench_model(
    model_name: &str,
    model_path: &Path,
    questions: &[Question],
    n_threads: u32,
    thinking: bool,
) -> Result<ModelBenchResult> {
    info!(
        "Loading model: {} ({} threads, thinking={})",
        model_name, n_threads, thinking
    );

    let path_owned = model_path.to_path_buf();
    let mut engine = tokio::task::spawn_blocking(move || {
        LlmEngine::load(&path_owned, n_threads, 0)
    })
    .await??;

    info!("Model loaded, starting {} questions", questions.len());

    let supports_thinking = model_supports_thinking(model_name);
    let mut results: Vec<QuestionResult> = Vec::with_capacity(questions.len());

    for q in questions {
        info!(
            "Q{:03} [{}] {}  (think={})",
            q.id,
            q.subject,
            &q.question[..q.question.len().min(55)],
            thinking
        );

        let content = user_content(&q.question, thinking, supports_thinking);
        let messages = vec![
            ChatMessage {
                role: "system".into(),
                content: "You are a helpful tutor for BTech engineering students. Answer questions clearly and concisely.".into(),
            },
            ChatMessage {
                role: "user".into(),
                content,
            },
        ];

        let max_tokens = if thinking { 600 } else { 300 };
        let params = GenerationParams {
            max_tokens,
            temperature: 0.3,
            top_p: 0.9,
            repeat_penalty: 1.1,
            system_prompt: None,
            no_think: false,
        };

        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        let start = Instant::now();
        let mut ttft: Option<Duration> = None;
        let mut think_end: Option<Duration> = None;
        let mut answer_ttft: Option<Duration> = None;
        let mut full_response = String::new();
        let mut tokens_generated: u32 = 0;
        let mut in_think_block = false;

        let result = tokio::task::spawn_blocking(move || {
            engine.generate_stream(&messages, &params, tx, None)?;
            Ok::<LlmEngine, anyhow::Error>(engine)
        });

        loop {
            match rx.recv().await {
                Some(token) if token == "\x00" => break,
                Some(token) => {
                    let elapsed = start.elapsed();

                    if ttft.is_none() {
                        ttft = Some(elapsed);
                    }

                    full_response.push_str(&token);
                    tokens_generated += 1;

                    // Track think block boundaries
                    if full_response.contains("<think>") && !in_think_block
                        && !full_response.contains("</think>")
                    {
                        in_think_block = true;
                    }
                    if in_think_block && full_response.contains("</think>") {
                        in_think_block = false;
                        if think_end.is_none() {
                            think_end = Some(elapsed);
                        }
                    }
                    // First answer token = first token after </think> closes
                    if think_end.is_some() && answer_ttft.is_none() && !in_think_block {
                        let trimmed_after = full_response
                            .split("</think>")
                            .nth(1)
                            .unwrap_or("")
                            .trim_start();
                        if !trimmed_after.is_empty() {
                            answer_ttft = Some(elapsed);
                        }
                    }
                }
                None => break,
            }
        }

        let total = start.elapsed();
        engine = result.await??;

        let ttft_ms = ttft.map(|d| d.as_millis() as u64).unwrap_or(0);
        let think_end_ms = think_end.map(|d| d.as_millis() as u64);
        let answer_ttft_ms = if thinking && supports_thinking {
            answer_ttft.map(|d| d.as_millis() as u64)
        } else {
            None
        };
        let total_ms = total.as_millis() as u64;

        let (_, answer_text, think_tokens) = split_think_answer(&full_response);
        let answer_tokens = if think_tokens > 0 {
            tokens_generated.saturating_sub(think_tokens)
        } else {
            tokens_generated
        };

        let tokens_per_sec = if total_ms > 0 {
            tokens_generated as f64 / (total_ms as f64 / 1000.0)
        } else {
            0.0
        };
        let answer_duration_ms = total_ms.saturating_sub(think_end_ms.unwrap_or(0));
        let answer_tokens_per_sec = if answer_duration_ms > 0 && answer_tokens > 0 {
            answer_tokens as f64 / (answer_duration_ms as f64 / 1000.0)
        } else {
            tokens_per_sec
        };

        // Score quality against the answer portion only (ignore think block)
        let score_text = answer_text.to_lowercase();
        let keyword_hits = q
            .keywords
            .iter()
            .filter(|kw| score_text.contains(&kw.to_lowercase()))
            .count() as u32;
        let keyword_total = q.keywords.len() as u32;
        let quality_score = if keyword_total > 0 {
            keyword_hits as f64 / keyword_total as f64
        } else {
            0.0
        };

        info!(
            "  TTFT: {}ms | ThinkEnd: {}ms | AnsFirst: {}ms | Total: {}ms | {:.1} tok/s | ThinkTok: {} | Quality: {}/{} keywords",
            ttft_ms,
            think_end_ms.map(|v| v.to_string()).unwrap_or_else(|| "-".into()),
            answer_ttft_ms.map(|v| v.to_string()).unwrap_or_else(|| "-".into()),
            total_ms,
            tokens_per_sec,
            think_tokens,
            keyword_hits,
            keyword_total
        );

        results.push(QuestionResult {
            id: q.id,
            subject: q.subject.clone(),
            question: q.question.clone(),
            response: full_response,
            thinking_mode: thinking && supports_thinking,
            ttft_ms,
            think_end_ms,
            answer_ttft_ms,
            total_ms,
            tokens_generated,
            think_tokens,
            answer_tokens,
            tokens_per_sec,
            answer_tokens_per_sec,
            keyword_hits,
            keyword_total,
            quality_score,
        });
    }

    // Compute aggregates
    let n = results.len() as f64;
    let avg_ttft_ms = results.iter().map(|r| r.ttft_ms as f64).sum::<f64>() / n;
    let avg_total_ms = results.iter().map(|r| r.total_ms as f64).sum::<f64>() / n;
    let avg_tokens_per_sec = results.iter().map(|r| r.tokens_per_sec).sum::<f64>() / n;
    let avg_quality_score = results.iter().map(|r| r.quality_score).sum::<f64>() / n;
    let avg_think_tokens = results.iter().map(|r| r.think_tokens as f64).sum::<f64>() / n;

    let think_ends: Vec<f64> = results.iter().filter_map(|r| r.think_end_ms.map(|v| v as f64)).collect();
    let avg_think_end_ms = if think_ends.is_empty() {
        None
    } else {
        Some(think_ends.iter().sum::<f64>() / think_ends.len() as f64)
    };

    let answer_ttfts: Vec<f64> = results.iter().filter_map(|r| r.answer_ttft_ms.map(|v| v as f64)).collect();
    let avg_answer_ttft_ms = if answer_ttfts.is_empty() {
        None
    } else {
        Some(answer_ttfts.iter().sum::<f64>() / answer_ttfts.len() as f64)
    };

    // Per-subject summaries
    let subjects = ["OS", "DBMS", "CN", "DS", "Algorithms", "DLD", "OOP", "CD", "COA", "Math"];
    let per_subject: Vec<SubjectSummary> = subjects
        .iter()
        .map(|&subj| {
            let subj_results: Vec<&QuestionResult> =
                results.iter().filter(|r| r.subject == subj).collect();
            let sn = subj_results.len() as f64;
            SubjectSummary {
                subject: subj.into(),
                avg_ttft_ms: subj_results.iter().map(|r| r.ttft_ms as f64).sum::<f64>() / sn,
                avg_total_ms: subj_results.iter().map(|r| r.total_ms as f64).sum::<f64>() / sn,
                avg_quality_score: subj_results.iter().map(|r| r.quality_score).sum::<f64>() / sn,
                question_count: subj_results.len() as u32,
            }
        })
        .collect();

    Ok(ModelBenchResult {
        model_name: model_name.into(),
        model_path: model_path.display().to_string(),
        timestamp: Utc::now().to_rfc3339(),
        thinking_mode: thinking,
        questions: results,
        avg_ttft_ms,
        avg_think_end_ms,
        avg_answer_ttft_ms,
        avg_total_ms,
        avg_tokens_per_sec,
        avg_think_tokens,
        avg_quality_score,
        per_subject,
    })
}

#[allow(dead_code)]
fn num_cpus() -> u32 {
    CpuProfile::detect().recommended_threads
}

// ─── Report printer ──────────────────────────────────────────────────────────

fn print_comparison(standard: &[ModelBenchResult], thinking: &[ModelBenchResult]) {
    let sep = "━".repeat(90);
    println!("\n{sep}");
    println!("MODEL BENCHMARK — BTech 100 Questions (Standard / No-Think Mode)");
    println!("{sep}");
    println!(
        "{:<20} {:>10} {:>12} {:>10} {:>10}",
        "Model", "Avg TTFT", "Avg Total", "Tok/sec", "Quality %"
    );
    println!("{}", "─".repeat(66));
    for r in standard {
        println!(
            "{:<20} {:>9.0}ms {:>11.1}s {:>10.1} {:>10.1}%",
            r.model_name,
            r.avg_ttft_ms,
            r.avg_total_ms / 1000.0,
            r.avg_tokens_per_sec,
            r.avg_quality_score * 100.0
        );
    }
    println!("{}", "━".repeat(66));

    if !thinking.is_empty() {
        println!("\n{sep}");
        println!("THINKING MODE — 20 Questions (/think enabled, Qwen models only)");
        println!("{sep}");
        println!(
            "{:<20} {:>10} {:>12} {:>14} {:>14} {:>12} {:>10}",
            "Model", "TTFT", "ThinkEnd", "AnsFirstTok", "Total", "ThinkToks", "Quality %"
        );
        println!("{}", "─".repeat(94));
        for r in thinking {
            println!(
                "{:<20} {:>9.0}ms {:>11} {:>13} {:>13.1}s {:>12.0} {:>10.1}%",
                r.model_name,
                r.avg_ttft_ms,
                r.avg_think_end_ms
                    .map(|v| format!("{:.0}ms", v))
                    .unwrap_or_else(|| "-".into()),
                r.avg_answer_ttft_ms
                    .map(|v| format!("{:.0}ms", v))
                    .unwrap_or_else(|| "-".into()),
                r.avg_total_ms / 1000.0,
                r.avg_think_tokens,
                r.avg_quality_score * 100.0
            );
        }
        println!("{}", "━".repeat(94));

        // Comparison table: standard vs thinking quality
        println!("\nQUALITY GAIN: Standard vs Thinking (%)");
        println!("{}", "─".repeat(50));
        for s in standard {
            if let Some(t) = thinking.iter().find(|t| t.model_name == s.model_name) {
                let delta = (t.avg_quality_score - s.avg_quality_score) * 100.0;
                let sign = if delta >= 0.0 { "+" } else { "" };
                println!(
                    "{:<20} std={:.1}%  think={:.1}%  Δ={}{:.1}%",
                    s.model_name,
                    s.avg_quality_score * 100.0,
                    t.avg_quality_score * 100.0,
                    sign,
                    delta
                );
            }
        }
    }

    // Per-subject table
    println!("\nPER-SUBJECT QUALITY SCORES — Standard (%)");
    println!("{}", "─".repeat(66));
    let model_names: Vec<&str> = standard.iter().map(|r| r.model_name.as_str()).collect();
    print!("{:<14}", "Subject");
    for name in &model_names {
        print!("{:>16}", name);
    }
    println!();
    println!("{}", "─".repeat(14 + 16 * model_names.len()));

    let subjects = ["OS", "DBMS", "CN", "DS", "Algorithms", "DLD", "OOP", "CD", "COA", "Math"];
    for subj in &subjects {
        print!("{:<14}", subj);
        for r in standard {
            let score = r
                .per_subject
                .iter()
                .find(|s| s.subject == *subj)
                .map(|s| s.avg_quality_score * 100.0)
                .unwrap_or(0.0);
            print!("{:>15.1}%", score);
        }
        println!();
    }
    println!("{}", "━".repeat(14 + 16 * model_names.len()));
}

// ─── Entry point ─────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("model_bench=info".parse()?)
                .add_directive("inference=info".parse()?),
        )
        .init();

    let models_dir = dirs_model_dir();
    let questions = btech_questions();
    assert_eq!(questions.len(), 100, "Expected 100 questions");

    // First 2 questions from each of the 10 subjects = 20 representative questions for thinking
    let thinking_questions: Vec<Question> = questions
        .chunks(10)
        .flat_map(|chunk| chunk.iter().take(2).cloned())
        .collect();
    assert_eq!(thinking_questions.len(), 20);

    let cpu = CpuProfile::detect();
    info!(
        "CPU: {} | {}P+{}E-cores | {} | RAM {:.0}/{:.0} GiB",
        cpu.model_name,
        cpu.physical_p_cores,
        cpu.physical_e_cores,
        if cpu.is_laptop { "laptop" } else { "desktop" },
        cpu.available_ram_gib,
        cpu.total_ram_gib,
    );
    info!(
        "Recommended threads: {} — {}",
        cpu.recommended_threads, cpu.recommendation_reason
    );
    let n_threads = cpu.recommended_threads;

    // Model list — uses stable on-disk names (chat-model.gguf = active LLM from models.toml)
    // Add extra models here if you want to benchmark alternatives alongside the active one.
    let models: Vec<(&str, PathBuf)> = vec![
        ("Active LLM",  models_dir.join("chat-model.gguf")),
        ("Gemma-4-E4B", models_dir.join("gemma-4-e4b-q4_k_m.gguf")),
        ("Qwen3.5-4B",  models_dir.join("qwen3.5-4b-q4_k_m.gguf")),
    ];

    let available: Vec<(&str, PathBuf)> = models
        .into_iter()
        .filter(|(name, path)| {
            if path.exists() {
                info!("✓ Found: {} at {}", name, path.display());
                true
            } else {
                warn!("✗ Missing: {} at {}", name, path.display());
                false
            }
        })
        .collect();

    if available.is_empty() {
        anyhow::bail!(
            "No benchmark models found in {}. Run download script first.",
            models_dir.display()
        );
    }

    let out_dir = PathBuf::from("bench-results");
    std::fs::create_dir_all(&out_dir)?;

    let mut standard_results: Vec<ModelBenchResult> = Vec::new();
    let mut thinking_results: Vec<ModelBenchResult> = Vec::new();

    for (name, path) in &available {
        // ── Standard (no-think) pass: 100 questions ──────────────────────────
        let std_path = out_dir.join(format!(
            "{}_standard.json",
            name.to_lowercase().replace(['-', '.'], "_")
        ));

        let std_result = if std_path.exists() {
            info!("Skipping {} standard — results already exist", name);
            let json = std::fs::read_to_string(&std_path)?;
            serde_json::from_str::<ModelBenchResult>(&json)?
        } else {
            let r = bench_model(name, path, &questions, n_threads, false).await?;
            std::fs::write(&std_path, serde_json::to_string_pretty(&r)?)?;
            info!("Standard results saved: {}", std_path.display());
            r
        };
        standard_results.push(std_result);

        // ── Thinking pass: 20 representative questions (only if supported) ───
        if model_supports_thinking(name) {
            let think_path = out_dir.join(format!(
                "{}_thinking.json",
                name.to_lowercase().replace(['-', '.'], "_")
            ));

            let think_result = if think_path.exists() {
                info!("Skipping {} thinking — results already exist", name);
                let json = std::fs::read_to_string(&think_path)?;
                serde_json::from_str::<ModelBenchResult>(&json)?
            } else {
                info!("Running {} in THINKING mode (20 questions)…", name);
                let r = bench_model(name, path, &thinking_questions, n_threads, true).await?;
                std::fs::write(&think_path, serde_json::to_string_pretty(&r)?)?;
                info!("Thinking results saved: {}", think_path.display());
                r
            };
            thinking_results.push(think_result);
        }
    }

    print_comparison(&standard_results, &thinking_results);

    // Save combined
    let combined = serde_json::json!({
        "standard": &standard_results,
        "thinking": &thinking_results,
    });
    let combined_path = out_dir.join("combined_v2.json");
    std::fs::write(&combined_path, serde_json::to_string_pretty(&combined)?)?;
    println!("\nFull results saved to: {}", combined_path.display());

    Ok(())
}

fn dirs_model_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.studentai.app")
        .join("models")
}

