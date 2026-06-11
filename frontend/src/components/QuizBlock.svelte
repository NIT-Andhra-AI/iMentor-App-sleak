<script lang="ts">
  /**
   * Interactive MCQ quiz block.
   * Parses the raw quiz text (from :::quiz ... ::: blocks) into questions
   * and renders them with click-to-reveal answers and a score counter.
   *
   * Expected input format (one or more questions):
   *   **Q1:** Question text
   *   - A) Option
   *   - B) Option
   *   - C) Option
   *   - D) Option
   *   *Answer: B — explanation*
   */
  export let raw: string = "";

  interface Option  { letter: string; text: string; }
  interface Question {
    number: string;
    text:   string;
    options: Option[];
    answer: string;       // correct letter
    explanation: string;
  }

  function parseQuiz(src: string): Question[] {
    const questions: Question[] = [];
    // Split on **Q\d+:** markers
    const qBlocks = src.split(/(?=\*\*Q\d+[:.])/).filter(b => b.trim());

    for (const block of qBlocks) {
      const lines = block.trim().split("\n").map(l => l.trim()).filter(Boolean);
      if (!lines.length) continue;

      // Question header: **Q1:** text OR **Q1.** text
      const headerMatch = lines[0].match(/^\*\*Q(\d+)[:.]\*\*\s*(.*)/);
      if (!headerMatch) continue;
      const number = headerMatch[1];
      const text   = headerMatch[2].trim();

      const options: Option[] = [];
      let answer = "";
      let explanation = "";

      for (const line of lines.slice(1)) {
        // Option lines: - A) text  or  A) text
        const optMatch = line.match(/^[-*]?\s*([A-D])\)\s*(.*)/);
        if (optMatch) {
          options.push({ letter: optMatch[1], text: optMatch[2].trim() });
          continue;
        }
        // Answer line: *Answer: B — explanation*  or  > B — explanation
        const ansMatch = line.match(/\*?Answer:\s*([A-D])[—\-–]\s*(.*?)\*?$/i)
                      || line.match(/^>\s*([A-D])[—\-–]\s*(.*)/);
        if (ansMatch) {
          answer      = ansMatch[1].toUpperCase();
          explanation = ansMatch[2].trim();
        }
      }
      if (text && options.length) questions.push({ number, text, options, answer, explanation });
    }
    return questions;
  }

  $: questions = parseQuiz(raw);

  // per-question state
  let selected:  Record<string, string>  = {};   // qNum → chosen letter
  let revealed:  Record<string, boolean> = {};   // qNum → show answer

  function choose(qNum: string, letter: string) {
    if (revealed[qNum]) return;
    selected  = { ...selected,  [qNum]: letter };
    revealed  = { ...revealed,  [qNum]: true   };
  }

  $: score = questions.filter(q => selected[q.number] === q.answer).length;
  $: answered = questions.filter(q => revealed[q.number]).length;

  function reset() {
    selected = {};
    revealed = {};
  }
</script>

{#if questions.length}
<div class="quiz-block">
  <div class="quiz-header">
    <span class="quiz-label">📝 Quiz</span>
    {#if answered > 0}
      <span class="score">{score}/{answered} correct</span>
      <button class="reset-btn" on:click={reset}>↺ Reset</button>
    {/if}
  </div>

  {#each questions as q (q.number)}
    <div class="question" class:done={!!revealed[q.number]}>
      <div class="q-text"><strong>Q{q.number}.</strong> {q.text}</div>

      <div class="options">
        {#each q.options as opt}
          <button
            class="option"
            class:chosen={selected[q.number] === opt.letter}
            class:correct={revealed[q.number] && opt.letter === q.answer}
            class:wrong={revealed[q.number] && selected[q.number] === opt.letter && opt.letter !== q.answer}
            disabled={!!revealed[q.number]}
            on:click={() => choose(q.number, opt.letter)}
          >
            <span class="opt-letter">{opt.letter}</span>
            <span class="opt-text">{opt.text}</span>
          </button>
        {/each}
      </div>

      {#if revealed[q.number]}
        <div class="explanation" class:correct-bg={selected[q.number] === q.answer}>
          {#if selected[q.number] === q.answer}
            ✅ Correct!
          {:else}
            ❌ Incorrect — correct answer: <strong>{q.answer}</strong>
          {/if}
          {#if q.explanation}
            <span class="exp-text"> — {q.explanation}</span>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>
{/if}

<style>
  .quiz-block {
    background: #0f1117;
    border: 1px solid #2d2f36;
    border-left: 3px solid #6366f1;
    border-radius: 8px;
    padding: 14px 16px;
    margin: 16px 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .quiz-header {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    font-weight: 600;
    color: #a5b4fc;
  }
  .quiz-label { font-size: 13px; }
  .score { color: #34d399; margin-left: auto; }
  .reset-btn {
    background: none; border: 1px solid #2d2f36; color: #9ca3af;
    border-radius: 4px; padding: 1px 7px; cursor: pointer; font-size: 11px;
  }
  .reset-btn:hover { color: #e5e7eb; border-color: #4b5563; }

  .question { display: flex; flex-direction: column; gap: 8px; }
  .q-text { font-size: 13px; color: #e5e7eb; line-height: 1.5; }

  .options { display: flex; flex-direction: column; gap: 5px; }
  .option {
    display: flex; align-items: center; gap: 10px;
    background: #1a1b1f; border: 1px solid #2d2f36; border-radius: 6px;
    padding: 7px 12px; cursor: pointer; text-align: left;
    transition: background 0.15s, border-color 0.15s;
    width: 100%;
  }
  .option:hover:not(:disabled) { background: #222430; border-color: #6366f1; }
  .option:disabled { cursor: default; }
  .option.correct  { background: rgba(52,211,153,.12); border-color: #34d399; }
  .option.wrong    { background: rgba(239,68,68,.12);  border-color: #ef4444; }
  .option.chosen:not(.correct):not(.wrong) { border-color: #6366f1; }

  .opt-letter {
    width: 22px; height: 22px; border-radius: 50%; background: #2d2f36;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: #9ca3af; flex-shrink: 0;
  }
  .option.correct .opt-letter { background: #34d399; color: #022c22; }
  .option.wrong   .opt-letter { background: #ef4444; color: #fff; }
  .opt-text { font-size: 12px; color: #d1d5db; }

  .explanation {
    font-size: 12px; color: #9ca3af;
    background: #141517; border-radius: 5px; padding: 8px 12px;
    border-left: 3px solid #ef4444;
    animation: fadein 0.2s ease;
  }
  .explanation.correct-bg { border-left-color: #34d399; }
  .exp-text { color: #d1d5db; }

  @keyframes fadein { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:none; } }
</style>
