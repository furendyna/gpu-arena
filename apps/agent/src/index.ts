import { classifyGpu, TIER_LABELS } from "@gpu-arena/shared";
import type { Bounty } from "@gpu-arena/shared";
import { detectGpu } from "./gpu-detect.js";
import { loadOrCreateWallet, signMessage } from "./wallet.js";

const API_URL = process.env.API_URL || "http://localhost:4000";
const WALLET_PATH = process.env.WALLET_PATH || "./agent.keypair.json";
const HANDLE = process.env.HANDLE || "my-rig";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** Produce an answer using a local LLM if configured, else a stub. */
async function generateAnswer(prompt: string): Promise<{ answer: string; latencyMs: number }> {
  const start = Date.now();
  const url = process.env.OLLAMA_URL;
  if (url) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL || "llama3.1",
          prompt,
          stream: false,
        }),
      });
      const data = (await res.json()) as { response?: string };
      return { answer: (data.response || "").trim(), latencyMs: Date.now() - start };
    } catch (err) {
      console.warn("[agent] inference failed, using stub:", err);
    }
  }
  const answer = `(${HANDLE}) Here is a concise take on: "${prompt.slice(0, 60)}..." — focus on agentic systems, efficient on-device inference, and verifiable reasoning.`;
  return { answer, latencyMs: Date.now() - start };
}

async function main() {
  const wallet = loadOrCreateWallet(WALLET_PATH);
  const pubkey = wallet.publicKey.toBase58();

  const detected = await detectGpu();
  const gpu = classifyGpu(detected.rawName, detected.memoryMb);
  console.log(`[agent] wallet ${pubkey}`);
  console.log(`[agent] GPU ${gpu.model} -> ${TIER_LABELS[gpu.tier]}`);

  // Register with a signed proof of wallet ownership + hardware-detected GPU.
  const nonce = Date.now().toString();
  const message = `gpu-arena:register:${pubkey}:${gpu.rawName}:${nonce}`;
  const signature = signMessage(wallet, message);
  await api("/api/agents/register", {
    method: "POST",
    body: JSON.stringify({
      wallet: pubkey,
      handle: HANDLE,
      rawName: gpu.rawName,
      memoryMb: gpu.memoryMb,
      nonce,
      signature,
    }),
  });
  console.log(`[agent] registered in ${TIER_LABELS[gpu.tier]}`);

  const seen = new Set<string>();
  console.log("[agent] watching for bounties in my tier… (Ctrl+C to stop)");
  for (;;) {
    try {
      const { bounties } = await api<{ bounties: Bounty[] }>("/api/bounties");
      for (const b of bounties) {
        if (b.tier !== gpu.tier || b.status === "settled" || seen.has(b.id)) continue;
        seen.add(b.id);
        console.log(`[agent] battling bounty "${b.title}" (${b.prizeAmount} prize)`);
        const { answer, latencyMs } = await generateAnswer(b.prompt);
        await api(`/api/bounties/${b.id}/submit`, {
          method: "POST",
          body: JSON.stringify({ wallet: pubkey, answer, latencyMs }),
        });
        console.log(`[agent] submitted answer in ${latencyMs}ms`);
      }
    } catch (err) {
      console.warn("[agent] poll error:", (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
