import type { Submission } from "@gpu-arena/shared";

export interface JudgedResult {
  scores: Record<string, { score: number; rationale: string }>;
  winnerSubmissionId: string;
}

/**
 * Blind AI judge. Answers are scored WITHOUT any GPU/competitor identity attached,
 * so a powerful card gets no advantage — only answer quality matters.
 *
 * Primary judge is a local Ollama model. If Ollama is unreachable/errors, it
 * falls back to a deterministic offline heuristic so battles never get stuck.
 */
export async function judge(prompt: string, submissions: Submission[]): Promise<JudgedResult> {
  if (submissions.length === 0) {
    throw new Error("no submissions to judge");
  }

  try {
    return await judgeWithOllama(prompt, submissions);
  } catch (err) {
    console.warn("[judge] Ollama judge failed, falling back to heuristic:", err);
    return heuristicJudge(submissions);
  }
}

async function judgeWithOllama(prompt: string, submissions: Submission[]): Promise<JudgedResult> {
  const baseUrl = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.JUDGE_MODEL || "llama3.1:8b";

  // Present answers anonymously as A, B, C... — identity is never revealed.
  const labels = submissions.map((_, i) => String.fromCharCode(65 + i));
  const anon = submissions
    .map((s, i) => `Answer ${labels[i]}:\n${s.answer}`)
    .join("\n\n---\n\n");

  const sys =
    "You are an impartial judge in a GPU answer competition. Score each anonymous answer 0-100 for accuracy, coherence, depth, and relevance to the prompt. Do not consider length alone. Respond ONLY with strict JSON: {\"scores\":[{\"label\":\"A\",\"score\":87,\"rationale\":\"...\"}]}.";
  const user = `Prompt:\n${prompt}\n\nAnswers:\n${anon}`;

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: { temperature: 0 },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content;
  if (!content) throw new Error("Ollama returned no content");
  const parsed = JSON.parse(content) as {
    scores: Array<{ label: string; score: number; rationale: string }>;
  };

  const scores: JudgedResult["scores"] = {};
  let best = { id: submissions[0].id, score: -1 };
  for (const item of parsed.scores) {
    const idx = item.label.trim().toUpperCase().charCodeAt(0) - 65;
    const sub = submissions[idx];
    if (!sub) continue;
    scores[sub.id] = { score: clamp(item.score), rationale: item.rationale ?? "" };
    if (scores[sub.id].score > best.score) best = { id: sub.id, score: scores[sub.id].score };
  }
  if (Object.keys(scores).length === 0) throw new Error("Ollama returned no usable scores");
  return { scores, winnerSubmissionId: best.id };
}

/** Deterministic local fallback so the arena works without any API key. */
function heuristicJudge(submissions: Submission[]): JudgedResult {
  const scores: JudgedResult["scores"] = {};
  let best = { id: submissions[0].id, score: -1 };
  for (const s of submissions) {
    const text = s.answer.trim();
    const words = text.split(/\s+/).filter(Boolean);
    const unique = new Set(words.map((w) => w.toLowerCase())).size;
    const sentences = text.split(/[.!?]+/).filter((x) => x.trim().length > 0).length || 1;
    const avgSentLen = words.length / sentences;
    // Reward vocabulary richness + readable sentence length; penalize fluff.
    const richness = Math.min(1, unique / 60);
    const concision = 1 - Math.min(1, Math.abs(avgSentLen - 18) / 18);
    const score = clamp(50 + richness * 35 + concision * 15);
    scores[s.id] = {
      score,
      rationale: `richness ${(richness * 100).toFixed(0)}%, concision ${(concision * 100).toFixed(0)}%`,
    };
    if (score > best.score) best = { id: s.id, score };
  }
  return { scores, winnerSubmissionId: best.id };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
