import { classifyGpu, TIER_LABELS } from "@gpu-arena/shared";
import type { ArenaState, Tier } from "@gpu-arena/shared";
import { detectGpu } from "./gpu-detect.js";
import { loadOrCreateWallet, signMessage } from "./wallet.js";

/** Tiny CLI flag parser: supports `--key value` and `--key=value`. */
function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split("=").slice(1).join("=") : undefined;
}

const API_URL = arg("api") || process.env.API_URL || "http://localhost:4000";
const WALLET_PATH = process.env.WALLET_PATH || "./agent.keypair.json";
const HANDLE = arg("handle") || process.env.HANDLE || "my-rig";
// Address prizes are paid to. Just a public address — no private key needed.
const PAYOUT_WALLET = arg("wallet") || process.env.PAYOUT_WALLET || undefined;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** Pick the model for this GPU's tier: smaller for Tier 1, bigger for Tier 2. */
function modelForTier(tier: Tier): string {
  return tier === 1
    ? process.env.OLLAMA_MODEL_TIER1 || "llama3.2:3b"
    : process.env.OLLAMA_MODEL_TIER2 || "llama3.1:8b";
}

/** Produce an answer using a local LLM if configured, else a stub. */
async function generateAnswer(
  prompt: string,
  tier: Tier,
): Promise<{ answer: string; latencyMs: number }> {
  const start = Date.now();
  const url = process.env.OLLAMA_URL;
  if (url) {
    const model = modelForTier(tier);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
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

/** Optional per-tier image checkpoint override for Automatic1111. */
function imageModelForTier(tier: Tier): string | undefined {
  return tier === 1
    ? process.env.IMAGE_MODEL_TIER1 || undefined
    : process.env.IMAGE_MODEL_TIER2 || undefined;
}

/**
 * Generate an image with a local Automatic1111 SD WebUI (started with --api).
 * Returns raw base64 PNG. Tier 2 renders larger / more steps for higher quality.
 */
async function generateImage(
  prompt: string,
  tier: Tier,
): Promise<{ imageBase64: string; latencyMs: number }> {
  const start = Date.now();
  const url = process.env.IMAGE_API_URL;
  if (!url) {
    throw new Error("IMAGE_API_URL not set — cannot compete in image bounties");
  }
  const base = url.replace(/\/$/, "");
  const size = tier === 1 ? 512 : 768;
  const steps = tier === 1 ? 12 : 28;
  const checkpoint = imageModelForTier(tier);

  const res = await fetch(`${base}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      steps,
      width: size,
      height: size,
      cfg_scale: 7,
      ...(checkpoint ? { override_settings: { sd_model_checkpoint: checkpoint } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`txt2img ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { images?: string[] };
  const image = data.images?.[0];
  if (!image) throw new Error("txt2img returned no image");
  // A1111 sometimes prefixes a data URL; store raw base64.
  const imageBase64 = image.replace(/^data:image\/[a-z]+;base64,/, "");
  return { imageBase64, latencyMs: Date.now() - start };
}

async function main() {
  const wallet = loadOrCreateWallet(WALLET_PATH);
  const pubkey = wallet.publicKey.toBase58();

  const detected = await detectGpu();
  const gpu = classifyGpu(detected.rawName, detected.memoryMb);
  const payoutWallet = PAYOUT_WALLET || pubkey;
  console.log(`[agent] signing wallet ${pubkey}`);
  console.log(`[agent] prizes paid to ${payoutWallet}${PAYOUT_WALLET ? "" : " (this agent's wallet — pass --wallet <addr> to change)"}`);
  console.log(`[agent] GPU ${gpu.model} -> ${TIER_LABELS[gpu.tier]}`);

  // Register with a signed proof of wallet ownership + hardware-detected GPU.
  const nonce = Date.now().toString();
  const message = `gpu-arena:register:${pubkey}:${gpu.rawName}:${nonce}`;
  const signature = signMessage(wallet, message);
  await api("/api/agents/register", {
    method: "POST",
    body: JSON.stringify({
      wallet: pubkey,
      payoutWallet,
      handle: HANDLE,
      rawName: gpu.rawName,
      memoryMb: gpu.memoryMb,
      nonce,
      signature,
    }),
  });
  console.log(`[agent] registered in ${TIER_LABELS[gpu.tier]}`);

  const seen = new Set<string>();
  console.log("[agent] watching for battles in my tier… (Ctrl+C to stop)");
  for (;;) {
    try {
      const state = await api<ArenaState>("/api/arena/state");
      const battle = state.active;
      // Only the active battle in my tier accepts answers, and only once.
      if (battle && state.phase === "battling" && battle.bounty.tier === gpu.tier && !seen.has(battle.bounty.id)) {
        seen.add(battle.bounty.id);
        const isImage = battle.bounty.outputType === "image";
        try {
          if (isImage) {
            console.log(
              `[agent] battling "${battle.bounty.title}" (${battle.bounty.prizeAmount} prize) — generating image`,
            );
            const { imageBase64, latencyMs } = await generateImage(battle.bounty.prompt, gpu.tier);
            await api(`/api/bounties/${battle.bounty.id}/submit`, {
              method: "POST",
              body: JSON.stringify({ wallet: pubkey, answer: "", imageBase64, latencyMs }),
            });
            console.log(`[agent] submitted image in ${latencyMs}ms`);
          } else {
            console.log(
              `[agent] battling "${battle.bounty.title}" (${battle.bounty.prizeAmount} prize) using ${modelForTier(gpu.tier)}`,
            );
            const { answer, latencyMs } = await generateAnswer(battle.bounty.prompt, gpu.tier);
            await api(`/api/bounties/${battle.bounty.id}/submit`, {
              method: "POST",
              body: JSON.stringify({ wallet: pubkey, answer, latencyMs }),
            });
            console.log(`[agent] submitted answer in ${latencyMs}ms`);
          }
        } catch (err) {
          // Don't get stuck on this bounty if generation failed (e.g. no image backend).
          console.warn(`[agent] could not compete in "${battle.bounty.title}":`, (err as Error).message);
        }
      }
    } catch (err) {
      console.warn("[agent] poll error:", (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
