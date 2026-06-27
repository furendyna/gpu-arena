import type { OutputType, Submission } from "@gpu-arena/shared";

export interface JudgedResult {
  scores: Record<string, { score: number; rationale: string }>;
  winnerSubmissionId: string;
}

/**
 * Blind AI judge. Answers are scored WITHOUT any GPU/competitor identity attached,
 * so a powerful card gets no advantage — only answer quality matters.
 *
 * Primary judge is a local Ollama model (text LLM for text bounties, a vision
 * model for image bounties). If Ollama is unreachable/errors, it falls back to a
 * deterministic offline heuristic so battles never get stuck.
 */
export async function judge(
  prompt: string,
  submissions: Submission[],
  outputType: OutputType = "text",
): Promise<JudgedResult> {
  if (submissions.length === 0) {
    throw new Error("no submissions to judge");
  }

  if (outputType === "image") {
    try {
      return await judgeImagesWithOllama(prompt, submissions);
    } catch (err) {
      console.warn("[judge] Ollama vision judge failed, falling back:", err);
      return imageFallbackJudge(submissions);
    }
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

/**
 * Score generated images with an Ollama vision model. Each image is scored
 * independently (0-100) for how well it matches the prompt — identity-blind.
 */
async function judgeImagesWithOllama(prompt: string, submissions: Submission[]): Promise<JudgedResult> {
  const baseUrl = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.VISION_JUDGE_MODEL || "llama3.2-vision";

  const scores: JudgedResult["scores"] = {};
  let best = { id: submissions[0].id, score: -1 };
  let scored = 0;

  for (const s of submissions) {
    if (!s.imageBase64) {
      scores[s.id] = { score: 0, rationale: "no image submitted" };
      continue;
    }
    const sys =
      "You are an impartial judge in an image-generation competition. Score the image 0-100 for how well it matches the prompt, plus quality and coherence. Respond ONLY with strict JSON: {\"score\":87,\"rationale\":\"...\"}.";
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
          { role: "user", content: `Prompt: ${prompt}`, images: [s.imageBase64] },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content;
    if (!content) throw new Error("Ollama vision returned no content");
    const parsed = JSON.parse(content) as { score: number; rationale?: string };
    scores[s.id] = { score: clamp(parsed.score), rationale: parsed.rationale ?? "" };
    scored += 1;
    if (scores[s.id].score > best.score) best = { id: s.id, score: scores[s.id].score };
  }

  if (scored === 0) throw new Error("no images to judge");
  return { scores, winnerSubmissionId: best.id };
}

/** Fallback when no vision model is available: reward submitting an image fast. */
function imageFallbackJudge(submissions: Submission[]): JudgedResult {
  const scores: JudgedResult["scores"] = {};
  let best = { id: submissions[0].id, score: -1 };
  for (const s of submissions) {
    const has = Boolean(s.imageBase64);
    // Faster valid submissions edge ahead; capped so it stays a tie-ish race.
    const speedBonus = has ? Math.max(0, 20 - Math.min(20, s.latencyMs / 3000)) : 0;
    const score = has ? clamp(60 + speedBonus) : 0;
    scores[s.id] = {
      score,
      rationale: has ? "image submitted (offline scoring)" : "no image submitted",
    };
    if (score > best.score) best = { id: s.id, score };
  }
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
