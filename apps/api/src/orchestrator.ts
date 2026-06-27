import { BURN_RATE, TIER_LABELS } from "@gpu-arena/shared";
import type { ArenaPhase, ArenaState, Bounty, Tier } from "@gpu-arena/shared";
import { store } from "./store.js";
import { judge } from "./judge.js";
import { payoutToWinner, burnPrize } from "./solana.js";

// Tunables (ms). The submission window must comfortably exceed the agent poll
// interval so every GPU in the tier has time to answer.
const BATTLE_WINDOW_MS = Number(process.env.BATTLE_WINDOW_MS || 9000);
// Image generation is much slower than text, so image bounties get a longer window.
const IMAGE_BATTLE_WINDOW_MS = Number(process.env.IMAGE_BATTLE_WINDOW_MS || 120000);
const JUDGE_PAUSE_MS = Number(process.env.JUDGE_PAUSE_MS || 1500);
const REVEAL_MS = Number(process.env.REVEAL_MS || 6000);
const IDLE_POLL_MS = 1000;

const windowForBounty = (bounty: Bounty) =>
  bounty.outputType === "image" ? IMAGE_BATTLE_WINDOW_MS : BATTLE_WINDOW_MS;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

// Currently-featured battle (only ever one at a time — bounties run 1-for-1).
const active: { bountyId: string | null; phase: ArenaPhase } = {
  bountyId: null,
  phase: "idle",
};

async function runBattle(bounty: Bounty) {
  // 1) Open for submissions from GPUs in this tier.
  const battleWindow = windowForBounty(bounty);
  bounty.status = "battling";
  bounty.closesAt = Date.now() + battleWindow;
  active.bountyId = bounty.id;
  active.phase = "battling";
  await store.saveBounty(bounty);
  console.log(
    `[arena] battle OPEN: "${bounty.title}" (Tier ${bounty.tier}, ${bounty.outputType ?? "text"}, prize ${bounty.prizeAmount})`,
  );
  await sleep(battleWindow);

  // 2) No one answered -> cancel and move on.
  const subs = store.submissionsFor(bounty.id);
  if (subs.length === 0) {
    bounty.status = "cancelled";
    await store.saveBounty(bounty);
    active.bountyId = null;
    active.phase = "idle";
    console.log(`[arena] battle CANCELLED (no submissions): "${bounty.title}"`);
    return;
  }

  // 3) Blind judging.
  bounty.status = "judging";
  await store.saveBounty(bounty);
  active.phase = "judging";
  await sleep(JUDGE_PAUSE_MS);
  const result = await judge(bounty.prompt, subs, bounty.outputType ?? "text");
  for (const s of subs) {
    const j = result.scores[s.id];
    if (j) {
      s.score = j.score;
      s.rationale = j.rationale;
      await store.saveSubmission(s);
    }
  }

  const winnerSub = store.submissions.get(result.winnerSubmissionId)!;
  const winner = store.competitors.get(winnerSub.competitorId)!;

  // 4) Split: burn 25%, pay the winner the rest.
  const burnAmount = round6(bounty.prizeAmount * BURN_RATE);
  const payout = round6(bounty.prizeAmount - burnAmount);
  const payRes = await payoutToWinner(winner.payoutWallet, payout);
  const burnRes = await burnPrize(burnAmount);

  bounty.winnerSubmissionId = winnerSub.id;
  bounty.winnerPayout = payout;
  bounty.burnedAmount = burnAmount;
  if (!payRes.simulated && payRes.signature) bounty.payoutTxSig = payRes.signature;
  if (!burnRes.simulated && burnRes.signature) bounty.burnTxSig = burnRes.signature;
  bounty.status = "settled";
  await store.saveBounty(bounty);

  store.stats.totalPaidOut = round6(store.stats.totalPaidOut + payout);
  store.stats.totalBurned = round6(store.stats.totalBurned + burnAmount);
  store.stats.battlesCompleted += 1;
  await store.saveStats();
  winner.points += Math.round(payout / 10);
  winner.wins += 1;
  await store.saveCompetitor(winner);

  console.log(
    `[arena] battle SETTLED: "${bounty.title}" -> ${winner.gpu.model} won ${payout}, burned ${burnAmount}` +
      `${payRes.simulated ? " (simulated)" : ""}`,
  );

  // 5) Linger on the winner so the UI can show the reveal, then go idle.
  active.phase = "reveal";
  await sleep(REVEAL_MS);
  active.bountyId = null;
  active.phase = "idle";
}

/** Long-running loop: pick the oldest open bounty and battle it, one at a time. */
export async function startArena() {
  console.log("[arena] orchestrator started — waiting for bounties…");
  for (;;) {
    const next = store.nextQueued();
    if (!next) {
      await sleep(IDLE_POLL_MS);
      continue;
    }
    try {
      await runBattle(next);
    } catch (err) {
      console.error("[arena] battle error:", err);
      active.bountyId = null;
      active.phase = "idle";
      await sleep(IDLE_POLL_MS);
    }
  }
}

export function activeBountyIsAcceptingSubmissions(bountyId: string): boolean {
  return active.bountyId === bountyId && active.phase === "battling";
}

/** Snapshot of everything the arena UI needs. */
export function getArenaState(): ArenaState {
  const competitors = [...store.competitors.values()];
  const pools = ([1, 2] as Tier[]).map((tier) => ({
    tier,
    label: TIER_LABELS[tier],
    competitors: competitors.filter((c) => c.tier === tier),
  }));

  const activeBounty = active.bountyId ? store.bounties.get(active.bountyId) ?? null : null;
  const battle = activeBounty
    ? {
        bounty: activeBounty,
        competitors: competitors.filter((c) => c.tier === activeBounty.tier),
        submissions: store.submissionsFor(activeBounty.id),
      }
    : null;

  return {
    phase: active.phase,
    active: battle,
    queue: store.queuedBounties(),
    pools,
    stats: { ...store.stats, activeGpus: competitors.filter((c) => c.online).length },
  };
}
