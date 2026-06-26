import express from "express";
import cors from "cors";
import type { Bounty, Tier } from "@gpu-arena/shared";
import { TIER_LABELS } from "@gpu-arena/shared";
import { seed, store } from "./store.js";
import { judge } from "./judge.js";
import { payoutToWinner, verifyWalletSignature } from "./solana.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

seed();

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, cluster: process.env.SOLANA_CLUSTER || "mainnet-beta" });
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

/**
 * Agent registration. The agent MUST sign a message proving wallet ownership.
 * Tier is computed from the hardware-detected GPU name — never trusted from input.
 */
app.post("/api/agents/register", (req, res) => {
  const { wallet, handle, rawName, memoryMb, signature, nonce } = req.body ?? {};
  if (!wallet || !rawName || !signature || !nonce) {
    return res.status(400).json({ error: "wallet, rawName, signature, nonce required" });
  }
  const message = `gpu-arena:register:${wallet}:${rawName}:${nonce}`;
  if (!verifyWalletSignature(wallet, message, signature)) {
    return res.status(401).json({ error: "invalid wallet signature" });
  }
  const competitor = store.upsertCompetitor({
    wallet,
    handle: handle || wallet.slice(0, 6),
    rawName,
    memoryMb,
  });
  res.json({ competitor });
});

app.get("/api/bounties", (_req, res) => {
  res.json({ bounties: [...store.bounties.values()] });
});

app.post("/api/bounties", (req, res) => {
  const { creatorWallet, title, prompt, category, tier, prizeAmount, prizeMint, closesAt, escrowTxSig } =
    req.body ?? {};
  if (!creatorWallet || !title || !prompt || !prizeAmount) {
    return res.status(400).json({ error: "creatorWallet, title, prompt, prizeAmount required" });
  }
  const bounty = store.createBounty({
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

/** A competitor submits an answer (called by the GPU agent). */
app.post("/api/bounties/:id/submit", (req, res) => {
  const bounty = store.bounties.get(req.params.id);
  if (!bounty) return res.status(404).json({ error: "bounty not found" });
  const { wallet, answer, latencyMs } = req.body ?? {};
  const competitor = wallet ? store.competitorByWallet(wallet) : undefined;
  if (!competitor) return res.status(401).json({ error: "competitor not registered" });
  if (competitor.tier !== bounty.tier) {
    return res.status(403).json({ error: `competitor is Tier ${competitor.tier}, bounty is Tier ${bounty.tier}` });
  }
  const submission = store.addSubmission({
    bountyId: bounty.id,
    competitorId: competitor.id,
    answer: String(answer ?? ""),
    latencyMs: Number(latencyMs ?? 0),
  });
  bounty.status = "battling";
  res.json({ submission });
});

/** Close the battle, judge blind, pick winner, pay out. */
app.post("/api/bounties/:id/judge", async (req, res) => {
  const bounty = store.bounties.get(req.params.id);
  if (!bounty) return res.status(404).json({ error: "bounty not found" });
  const submissions = store.submissionsFor(bounty.id);
  if (submissions.length === 0) return res.status(400).json({ error: "no submissions" });

  bounty.status = "judging";
  const result = await judge(bounty.prompt, submissions);

  for (const s of submissions) {
    const j = result.scores[s.id];
    if (j) {
      s.score = j.score;
      s.rationale = j.rationale;
    }
  }

  const winnerSub = store.submissions.get(result.winnerSubmissionId)!;
  const winner = store.competitors.get(winnerSub.competitorId)!;
  bounty.winnerSubmissionId = winnerSub.id;

  const payout = await payoutToWinner(winner.wallet, bounty.prizeAmount);
  if (!payout.simulated && payout.signature) {
    bounty.payoutTxSig = payout.signature;
  }
  bounty.status = "settled";
  winner.points += Math.round(bounty.prizeAmount / 10);
  winner.wins += 1;

  res.json({
    bounty,
    winner,
    winnerSubmission: winnerSub,
    submissions,
    payout,
  });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`[gpu-arena] API listening on http://localhost:${port}`);
  console.log(`[gpu-arena] cluster=${process.env.SOLANA_CLUSTER || "mainnet-beta"} realPayouts=${process.env.ENABLE_REAL_PAYOUTS === "true"}`);
});
