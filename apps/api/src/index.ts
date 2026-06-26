import express from "express";
import cors from "cors";
import type { Bounty, Tier } from "@gpu-arena/shared";
import { MIN_PRIZE, TIER_LABELS } from "@gpu-arena/shared";
import { initStore, store } from "./store.js";
import {
  escrowConfigured,
  getTreasuryAddress,
  isValidSolanaAddress,
  verifyEscrowTransfer,
  verifyWalletSignature,
} from "./solana.js";
import { BURN_RATE } from "@gpu-arena/shared";
import { activeBountyIsAcceptingSubmissions, getArenaState, startArena } from "./orchestrator.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, cluster: process.env.SOLANA_CLUSTER || "mainnet-beta" });
});

/** Public config the web app needs to fund bounties on-chain. */
app.get("/api/config", (_req, res) => {
  res.json({
    cluster: process.env.SOLANA_CLUSTER || "mainnet-beta",
    rpcUrl: process.env.SOLANA_RPC_URL || null,
    prizeTokenMint: process.env.PRIZE_TOKEN_MINT || null,
    treasuryAddress: getTreasuryAddress(),
    escrowEnabled: escrowConfigured(),
    minPrize: MIN_PRIZE,
    burnRate: BURN_RATE,
  });
});

/** Pools grouped by tier. */
app.get("/api/pools", (_req, res) => {
  const competitors = [...store.competitors.values()];
  const pools = ([1, 2] as Tier[]).map((tier) => ({
    tier,
    label: TIER_LABELS[tier],
    competitors: competitors.filter((c) => c.tier === tier),
  }));
  res.json({ pools });
});

/** Single live snapshot the arena UI polls: active battle, queue, pools, stats. */
app.get("/api/arena/state", (_req, res) => {
  res.json(getArenaState());
});

/**
 * Agent registration. The agent MUST sign a message proving wallet ownership.
 * Tier is computed from the hardware-detected GPU name — never trusted from input.
 */
app.post("/api/agents/register", async (req, res) => {
  const { wallet, payoutWallet, handle, rawName, memoryMb, signature, nonce } = req.body ?? {};
  if (!wallet || !rawName || !signature || !nonce) {
    return res.status(400).json({ error: "wallet, rawName, signature, nonce required" });
  }
  const message = `gpu-arena:register:${wallet}:${rawName}:${nonce}`;
  if (!verifyWalletSignature(wallet, message, signature)) {
    return res.status(401).json({ error: "invalid wallet signature" });
  }
  if (payoutWallet && !isValidSolanaAddress(payoutWallet)) {
    return res.status(400).json({ error: "payoutWallet is not a valid Solana address" });
  }
  const competitor = await store.upsertCompetitor({
    wallet,
    payoutWallet,
    handle: handle || wallet.slice(0, 6),
    rawName,
    memoryMb,
  });
  res.json({ competitor });
});

app.get("/api/bounties", (_req, res) => {
  res.json({ bounties: [...store.bounties.values()] });
});

app.post("/api/bounties", async (req, res) => {
  const { creatorWallet, title, prompt, category, tier, prizeAmount, prizeMint, closesAt, escrowTxSig } =
    req.body ?? {};
  if (!creatorWallet || !title || !prompt || !prizeAmount) {
    return res.status(400).json({ error: "creatorWallet, title, prompt, prizeAmount required" });
  }
  if (Number(prizeAmount) < MIN_PRIZE) {
    return res.status(400).json({ error: `prize must be at least ${MIN_PRIZE} tokens` });
  }
  // When a token + treasury are configured, the prize must be escrowed on-chain
  // before the bounty goes live. Verify the funding transfer.
  if (escrowConfigured()) {
    if (!escrowTxSig) {
      return res.status(402).json({ error: "escrowTxSig required: fund the prize into the treasury first" });
    }
    const v = await verifyEscrowTransfer(escrowTxSig, Number(prizeAmount));
    if (!v.ok) {
      return res.status(402).json({ error: `escrow verification failed: ${v.reason}` });
    }
  }
  const bounty = await store.createBounty({
    creatorWallet,
    title,
    prompt,
    category: category || "General",
    tier: (tier as Tier) || 1,
    prizeAmount: Number(prizeAmount),
    prizeMint: prizeMint || process.env.PRIZE_TOKEN_MINT || "",
    closesAt: closesAt || Date.now() + 1000 * 60 * 60,
    escrowTxSig,
  });
  res.json({ bounty });
});

/** Battle view: bounty + roster (its tier) + submissions. */
app.get("/api/bounties/:id", (req, res) => {
  const bounty = store.bounties.get(req.params.id);
  if (!bounty) return res.status(404).json({ error: "not found" });
  const competitors = [...store.competitors.values()].filter((c) => c.tier === bounty.tier);
  res.json({ bounty, competitors, submissions: store.submissionsFor(bounty.id) });
});

/**
 * A competitor submits an answer (called by the GPU agent). Only accepted while
 * the bounty is the active battle and inside its submission window — the
 * orchestrator drives judging/payout automatically afterwards.
 */
app.post("/api/bounties/:id/submit", async (req, res) => {
  const bounty = store.bounties.get(req.params.id);
  if (!bounty) return res.status(404).json({ error: "bounty not found" });
  if (!activeBountyIsAcceptingSubmissions(bounty.id)) {
    return res.status(409).json({ error: "bounty is not accepting submissions right now" });
  }
  const { wallet, answer, latencyMs } = req.body ?? {};
  const competitor = wallet ? store.competitorByWallet(wallet) : undefined;
  if (!competitor) return res.status(401).json({ error: "competitor not registered" });
  if (competitor.tier !== bounty.tier) {
    return res.status(403).json({ error: `competitor is Tier ${competitor.tier}, bounty is Tier ${bounty.tier}` });
  }
  // One submission per competitor per bounty.
  const existing = store.submissionsFor(bounty.id).find((s) => s.competitorId === competitor.id);
  if (existing) return res.json({ submission: existing });

  const submission = await store.addSubmission({
    bountyId: bounty.id,
    competitorId: competitor.id,
    answer: String(answer ?? ""),
    latencyMs: Number(latencyMs ?? 0),
  });
  res.json({ submission });
});

const port = Number(process.env.PORT || 4000);

initStore()
  .then(() => {
    app.listen(port, () => {
      console.log(`[gpu-arena] API listening on http://localhost:${port}`);
      console.log(`[gpu-arena] cluster=${process.env.SOLANA_CLUSTER || "mainnet-beta"} realPayouts=${process.env.ENABLE_REAL_PAYOUTS === "true"}`);
      startArena();
    });
  })
  .catch((err) => {
    console.error("[gpu-arena] failed to start:", err);
    process.exit(1);
  });
