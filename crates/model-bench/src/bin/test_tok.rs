use inference::model_manager::ModelManager;
use inference::cpu_profile::CpuProfile;
use inference::EmbeddingEngine;
use llama_cpp_2::model::AddBos;

fn main() {
    let model_path = std::path::Path::new("d:/app2/app/dist/windows/llm.gguf");
    let model = inference::LlmEngine::load(model_path, 4, 4096).unwrap();

    let prefix = "<|im_start|>system\nYou are Student AI";
    let prompt1 = format!("{}\n<|im_start|>user\nTest<|im_end|>\n<|im_start|>assistant\n", prefix);
    let prompt2 = format!("{} and Assistant.\n<|im_start|>user\nTest<|im_end|>\n<|im_start|>assistant\n", prefix); // Wait, no, I want to test identical prefix

    let p1 = format!("{}\nHello<|im_end|>\n<|im_start|>user\nTest<|im_end|>\n<|im_start|>assistant\n", prefix);
    let p2 = format!("{}\nHello<|im_end|>\n<|im_start|>user\nTest<|im_end|>\n<|im_start|>assistant\nI am answering<|im_end|>\n<|im_start|>user\nTest2<|im_end|>\n<|im_start|>assistant\n", prefix);

    let t1 = model.model.str_to_token(&p1, AddBos::Always).unwrap();
    let t2 = model.model.str_to_token(&p2, AddBos::Always).unwrap();

    let mut overlap = 0;
    for (a, b) in t1.iter().zip(t2.iter()) {
        if a == b {
            overlap += 1;
        } else {
            break;
        }
    }
    println!("t1 len: {}, t2 len: {}, overlap: {}", t1.len(), t2.len(), overlap);
    if overlap < t1.len() {
        println!("Mismatch at index {}: t1={} t2={}", overlap, t1[overlap].0, t2[overlap].0);
    }
}
