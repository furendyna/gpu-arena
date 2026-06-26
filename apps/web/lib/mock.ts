import type { Bounty, Competitor } from "@gpu-arena/shared";
import { classifyGpu } from "@gpu-arena/shared";

function comp(
  id: string,
  handle: string,
  wallet: string,
  rawName: string,
  memoryMb: number,
  points: number,
  wins: number,
): Competitor {
  const gpu = classifyGpu(rawName, memoryMb);
  return { id, handle, wallet, gpu, tier: gpu.tier, online: true, points, wins };
}

export const COMPETITORS: Competitor[] = [
  // Tier 1 — Pool Alpha (RTX 20-series & older)
  comp("t1-a", "frostbyte", "9xQe...Alpha1", "NVIDIA GeForce RTX 2060", 6144, 1245, 14),
  comp("t1-b", "neonkid", "7Kp2...Alpha2", "NVIDIA GeForce RTX 2080 Ti", 11264, 1387, 21),
  comp("t1-c", "redshift", "4Fb9...Alpha3", "AMD Radeon RX 5600 XT", 6144, 1102, 9),
  comp("t1-d", "lowpoly", "2Zc1...Alpha4", "NVIDIA GeForce GTX 1660 Super", 6144, 1009, 7),
  // Tier 2 — Pool Omega
  comp("t2-a", "overclocked", "Bk7t...Omega1", "NVIDIA GeForce RTX 4090", 24576, 2894, 63),
  comp("t2-b", "vramlord", "Cm3p...Omega2", "AMD Radeon RX 7900 XTX", 24576, 2643, 41),
  comp("t2-c", "tensorrush", "Dq8w...Omega3", "NVIDIA GeForce RTX 4080 Super", 16384, 2411, 35),
  comp("t2-d", "haloeffect", "Er5n...Omega4", "NVIDIA GeForce RTX 3090", 24576, 2207, 28),
];

export const SAMPLE_BOUNTY: Bounty = {
  id: "bounty-001",
  creatorWallet: "ArenaMaster...",
  title: "What are the most promising directions for AI in the next 5 years?",
  prompt:
    "Give a concise, well-structured take on the most promising directions for AI over the next 5 years. Prioritize insight and clarity over length.",
  category: "Technology",
  tier: 2,
  prizeAmount: 1000,
  prizeMint: "So111...token",
  status: "open",
  createdAt: Date.now(),
  closesAt: Date.now() + 1000 * 60 * 60 * 3,
};

/** Canned answer fragments used to animate the "answer stream" per competitor. */
export const ANSWER_SNIPPETS: Record<string, string> = {
  "t2-a":
    "Agentic systems that plan, use tools, and self-correct will dominate. Multimodal world-models, on-device inference, and verifiable reasoning become the real moats — not raw scale.",
  "t2-b":
    "Expect a shift from bigger models to better data and tighter feedback loops. Retrieval, tool use, and continual learning matter more than parameter count.",
  "t2-c":
    "Reasoning + tool use, cheaper inference, and domain-specialized agents. Safety/alignment tooling becomes a first-class product surface.",
  "t2-d":
    "Edge inference and efficiency win. Smaller specialized models orchestrated by a planner beat one giant model.",
  "t1-a":
    "AI will move into everyday workflows via agents; healthcare and coding see the fastest gains.",
  "t1-b":
    "Open models close the gap; the breakthroughs come from data quality and orchestration, not size.",
  "t1-c": "More automation of routine knowledge work and better multimodal assistants.",
  "t1-d": "AI gets cheaper and more local; assistants become genuinely useful.",
};
