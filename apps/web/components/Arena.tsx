"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import type { ArenaState, Bounty, Competitor, Submission, Tier } from "@gpu-arena/shared";
import { BURN_RATE, TIER_LABELS } from "@gpu-arena/shared";
import { getArenaState } from "@/lib/api";
import { GITHUB_URL, TWITTER_URL } from "@/lib/config";
import { GpuCard } from "./GpuCard";
import { JudgingCrystal } from "./JudgingCrystal";
import { TokenConfetti } from "./TokenConfetti";
import { SocialLinks } from "./SocialLinks";
import { CreateBountyModal } from "./CreateBountyModal";
import { ConnectGpuModal } from "./ConnectGpuModal";

const WalletButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

const POLL_MS = 1200;

function useArenaState() {
  const [state, setState] = useState<ArenaState | null>(null);
  const [offline, setOffline] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await getArenaState();
        if (!alive) return;
        setState(s);
        setOffline(false);
      } catch {
        if (alive) setOffline(true);
      } finally {
        if (alive) timer.current = setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { state, offline };
}

export function Arena() {
  const { state, offline } = useArenaState();
  const [createOpen, setCreateOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  const phase = state?.phase ?? "idle";
  const active = state?.active ?? null;
  const activeTier = active?.bounty.tier ?? null;

  const pools = state?.pools ?? [];
  const tier1 = pools.find((p) => p.tier === 1)?.competitors ?? [];
  const tier2 = pools.find((p) => p.tier === 2)?.competitors ?? [];

  // submission lookups for the active battle
  const subByComp = useMemo(() => {
    const m = new Map<string, Submission>();
    active?.submissions.forEach((s) => m.set(s.competitorId, s));
    return m;
  }, [active]);

  const winnerCompId = useMemo(() => {
    if (!active?.bounty.winnerSubmissionId) return null;
    return active.submissions.find((s) => s.id === active.bounty.winnerSubmissionId)?.competitorId ?? null;
  }, [active]);

  const showScores = phase === "judging" || phase === "reveal";

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6">
      <CreateBountyModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ConnectGpuModal open={connectOpen} onClose={() => setConnectOpen(false)} />

      <Header
        onCreateBounty={() => setCreateOpen(true)}
        onConnect={() => setConnectOpen(true)}
        active={active}
        queue={state?.queue ?? []}
        offline={offline}
      />

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr_300px]">
        <PoolColumn
          title={TIER_LABELS[1]}
          tier={1}
          competitors={tier1}
          activeTier={activeTier}
          phase={phase}
          subByComp={subByComp}
          showScores={showScores}
          winnerCompId={winnerCompId}
        />

        <BattleStage
          phase={phase}
          active={active}
          subByComp={subByComp}
          winnerCompId={winnerCompId}
          queueLen={state?.queue.length ?? 0}
          onCreateBounty={() => setCreateOpen(true)}
          onConnect={() => setConnectOpen(true)}
        />

        <PoolColumn
          title={TIER_LABELS[2]}
          tier={2}
          competitors={tier2}
          activeTier={activeTier}
          phase={phase}
          subByComp={subByComp}
          showScores={showScores}
          winnerCompId={winnerCompId}
        />
      </div>

      <BattleScoreboard active={active} subByComp={subByComp} showScores={showScores} pools={pools} />
      <QueueStrip queue={state?.queue ?? []} />
      <StatBar stats={state?.stats} />
      <HowItWorks />
      <Footer />
    </div>
  );
}

/* ----------------------------- Header ----------------------------- */

function Header({
  onCreateBounty,
  onConnect,
  active,
  queue,
  offline,
}: {
  onCreateBounty: () => void;
  onConnect: () => void;
  active: ArenaState["active"];
  queue: Bounty[];
  offline: boolean;
}) {
  const shown = active?.bounty ?? queue[0] ?? null;
  const label = active ? "Active Battle" : queue.length ? "Next Up" : "No active battle";
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="GPU Arena" className="h-14 w-14 object-contain" />
          <div>
            <div className="font-display text-2xl font-black leading-none tracking-wide">
              GPU<span className="text-arena-tier2"> ARENA</span>
            </div>
            <div className="text-[11px] tracking-[0.25em] text-slate-400">GPUS BATTLE · BEST ANSWER WINS</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onConnect}
            className="clip-card border border-arena-tier2/40 px-4 py-2.5 font-display text-sm font-bold text-arena-tier2 transition hover:bg-arena-tier2/10"
          >
            ⚡ Connect GPU
          </button>
          <button
            onClick={onCreateBounty}
            className="clip-card bg-gradient-to-r from-arena-sol to-arena-solb px-4 py-2.5 font-display text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-95"
          >
            + Create Bounty
          </button>
          <WalletButton />
          <SocialLinks />
        </div>
      </div>

      <div className="clip-card glass flex flex-col gap-4 px-5 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.25em] text-arena-sol">{label}</span>
            {offline && <span className="text-[10px] text-red-400">· API offline (run npm run dev:api)</span>}
          </div>
          <div className="truncate text-sm font-semibold text-slate-100">
            {shown ? shown.title : "Create a bounty to start the next battle"}
          </div>
          <div className="text-[11px] text-slate-400">
            {shown ? `Tier ${shown.tier} · ${shown.category}` : "GPUs sit idle until a bounty is posted"}
          </div>
        </div>
        {shown && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Prize Pool</div>
            <div className="font-display text-2xl font-black text-arena-sol">
              {shown.prizeAmount.toLocaleString()} <span className="text-sm">$ARENA</span>
            </div>
            <div className="text-[10px] text-arena-gold">
              {(shown.prizeAmount * (1 - BURN_RATE)).toLocaleString()} to winner ·{" "}
              {(shown.prizeAmount * BURN_RATE).toLocaleString()} burned
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

/* --------------------------- Pool Column --------------------------- */

function PoolColumn({
  title,
  tier,
  competitors,
  activeTier,
  phase,
  subByComp,
  showScores,
  winnerCompId,
}: {
  title: string;
  tier: Tier;
  competitors: Competitor[];
  activeTier: Tier | null;
  phase: ArenaState["phase"];
  subByComp: Map<string, Submission>;
  showScores: boolean;
  winnerCompId: string | null;
}) {
  const isActive = activeTier === tier;
  const accent = tier === 1 ? "text-arena-tier1" : "text-arena-tier2";
  const ranked = [...competitors].sort((a, b) => b.points - a.points);
  return (
    <div className="clip-card glass flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between px-1">
        <span className={`font-display text-sm font-bold tracking-wide ${accent}`}>{title}</span>
        <span className="text-[10px] text-slate-500">{competitors.length} GPUs</span>
      </div>
      {ranked.length === 0 && (
        <div className="rounded-md border border-dashed border-white/10 p-4 text-center text-[11px] text-slate-500">
          No GPUs yet — connect one to fill this pool.
        </div>
      )}
      {ranked.map((c, i) => (
        <GpuCard
          key={c.id}
          competitor={c}
          rank={i + 1}
          score={isActive && showScores ? subByComp.get(c.id)?.score : undefined}
          active={isActive && phase === "battling"}
          winner={winnerCompId === c.id}
        />
      ))}
    </div>
  );
}

/* --------------------------- Battle Stage --------------------------- */

function BattleStage({
  phase,
  active,
  subByComp,
  winnerCompId,
  queueLen,
  onCreateBounty,
  onConnect,
}: {
  phase: ArenaState["phase"];
  active: ArenaState["active"];
  subByComp: Map<string, Submission>;
  winnerCompId: string | null;
  queueLen: number;
  onCreateBounty: () => void;
  onConnect: () => void;
}) {
  const tier = active?.bounty.tier ?? 2;
  const beam = tier === 1 ? "#f59e0b" : "#ff751f";
  const winner = active?.competitors.find((c) => c.id === winnerCompId) ?? null;
  const winnerSub = winnerCompId ? subByComp.get(winnerCompId) : undefined;

  return (
    <div className="clip-card glass relative grid min-h-[460px] place-items-center overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-40">
        <div className="h-[420px] w-[420px] animate-spinSlow rounded-full border border-white/10" />
        <div className="absolute h-[300px] w-[300px] rounded-full border border-white/10" />
        <div className="absolute h-[180px] w-[180px] rounded-full border border-white/10" />
      </div>

      <AnimatePresence mode="wait">
        {phase === "reveal" && winner ? (
          <motion.div
            key="winner"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 text-center"
          >
            <TokenConfetti />
            <div
              className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[260px] -translate-x-1/2 -translate-y-10"
              style={{
                background: "linear-gradient(to bottom, rgba(255,184,77,0.4), transparent 70%)",
                clipPath: "polygon(42% 0, 58% 0, 100% 100%, 0 100%)",
              }}
            />
            <div className="font-display text-xs tracking-[0.4em] text-arena-gold">WINNER</div>
            <div className="mt-2 font-display text-3xl font-black text-arena-gold drop-shadow">{winner.gpu.model}</div>
            <div className="text-sm text-slate-300">@{winner.handle}</div>
            {winnerSub && (
              <div className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-200">“{winnerSub.answer}”</div>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="rounded-full bg-arena-sol/15 px-4 py-1.5 font-semibold text-arena-sol">
                +{(active?.bounty.winnerPayout ?? 0).toLocaleString()} $ARENA to winner
              </span>
              <span className="rounded-full bg-orange-500/10 px-4 py-1.5 font-semibold text-orange-400">
                🔥 {(active?.bounty.burnedAmount ?? 0).toLocaleString()} burned (25%)
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">Best answer won — not the most powerful GPU.</div>
          </motion.div>
        ) : phase === "idle" || !active ? (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative z-10 grid place-items-center text-center">
            <JudgingCrystal active={false} />
            <div className="mt-6 max-w-sm text-sm text-slate-400">
              {queueLen > 0
                ? `${queueLen} bounty${queueLen > 1 ? "ies" : "y"} queued — the next battle starts automatically.`
                : "The arena is idle. GPUs are waiting — post a bounty to trigger a battle."}
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={onConnect}
                className="rounded-full border border-arena-tier2/40 px-4 py-2 text-xs font-bold text-arena-tier2 hover:bg-arena-tier2/10"
              >
                ⚡ Connect GPU
              </button>
              <button
                onClick={onCreateBounty}
                className="rounded-full bg-gradient-to-r from-arena-sol to-arena-solb px-4 py-2 text-xs font-bold text-black"
              >
                + Create Bounty
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="battle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative z-10 grid w-full place-items-center">
            <JudgingCrystal active />
            <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
              {active.competitors.map((c) => {
                const sub = subByComp.get(c.id);
                return (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="clip-card glass relative min-h-[64px] px-3 py-2 text-[11px] leading-snug text-slate-300"
                    style={{ borderColor: `${beam}55` }}
                  >
                    <div className="mb-1 flex items-center justify-between text-[10px] font-semibold" style={{ color: beam }}>
                      <span>{c.gpu.model}</span>
                      {phase === "judging" && sub?.score !== undefined && (
                        <span className="text-arena-gold">{Math.round(sub.score)}</span>
                      )}
                    </div>
                    {sub ? (
                      sub.answer
                    ) : (
                      <span className="text-slate-500">
                        computing<span className="animate-pulseGlow">…</span>
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </div>
            <div className="mt-4 text-[11px] uppercase tracking-[0.2em] text-slate-500">
              {phase === "battling" ? "Collecting answers…" : "Judging blind…"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------- Scoreboard --------------------------- */

function BattleScoreboard({
  active,
  subByComp,
  showScores,
  pools,
}: {
  active: ArenaState["active"];
  subByComp: Map<string, Submission>;
  showScores: boolean;
  pools: ArenaState["pools"];
}) {
  if (active && showScores) {
    const ranked = [...active.competitors]
      .map((c) => ({ c, score: subByComp.get(c.id)?.score ?? 0 }))
      .sort((a, b) => b.score - a.score);
    return (
      <Panel title="LIVE SCOREBOARD">
        {ranked.map(({ c, score }, i) => (
          <Row key={c.id} rank={i + 1} label={c.gpu.model} value={Math.round(score)} />
        ))}
      </Panel>
    );
  }
  // idle: overall leaderboard by points
  const all = pools.flatMap((p) => p.competitors).sort((a, b) => b.points - a.points).slice(0, 8);
  return (
    <Panel title="LEADERBOARD">
      {all.length === 0 ? (
        <div className="col-span-full text-center text-[11px] text-slate-500">No GPUs connected yet.</div>
      ) : (
        all.map((c, i) => <Row key={c.id} rank={i + 1} label={c.gpu.model} value={c.points} />)
      )}
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="clip-card glass mt-4 p-4">
      <div className="mb-3 font-display text-sm font-bold tracking-wide text-arena-tier2">{title}</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  );
}

function Row({ rank, label, value }: { rank: number; label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2">
      <span className="text-xs text-slate-300">
        <span className="mr-2 text-slate-500">{rank}</span>
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

/* ----------------------------- Queue ----------------------------- */

function QueueStrip({ queue }: { queue: Bounty[] }) {
  return (
    <div className="clip-card glass mt-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display text-sm font-bold tracking-wide text-arena-tier1">BATTLE QUEUE</span>
        <span className="text-[10px] text-slate-500">{queue.length} waiting · runs first-in, first-out</span>
      </div>
      {queue.length === 0 ? (
        <div className="text-[11px] text-slate-500">Queue is empty. New bounties battle in the order they’re posted.</div>
      ) : (
        <div className="space-y-2">
          {queue.map((b, i) => (
            <div key={b.id} className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-arena-tier1/15 text-[11px] font-bold text-arena-tier1">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{b.title}</span>
              <span className="shrink-0 text-[10px] text-slate-500">Tier {b.tier}</span>
              <span className="shrink-0 text-xs font-bold text-arena-sol">{b.prizeAmount.toLocaleString()} $ARENA</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Stat bar ----------------------------- */

function StatBar({ stats }: { stats?: ArenaState["stats"] }) {
  const items = [
    ["Battles Done", (stats?.battlesCompleted ?? 0).toLocaleString()],
    ["$ARENA Paid Out", (stats?.totalPaidOut ?? 0).toLocaleString()],
    ["🔥 $ARENA Burned", (stats?.totalBurned ?? 0).toLocaleString()],
    ["Active GPUs", (stats?.activeGpus ?? 0).toLocaleString()],
  ];
  return (
    <div className="clip-card glass mt-4 grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="text-center">
          <div className="font-display text-lg font-black text-slate-100">{v}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{k}</div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------- How it works --------------------------- */

function HowItWorks() {
  const steps = [
    { n: 1, t: "Connect your GPU", d: "Run the agent locally. It detects your real card and slots you into the fair tier — no faking." },
    { n: 2, t: "Someone posts a bounty", d: "A prompt + token prize. It joins the queue and battles when its turn comes — one at a time." },
    { n: 3, t: "The pool battles", d: "Every GPU in that tier answers. Answers stream into the arena live during the window." },
    { n: 4, t: "Best answer wins", d: "A blind AI judge scores anonymously. Winner gets 75%; 25% of the prize is burned." },
  ];
  return (
    <section className="clip-card glass mt-8 p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-black tracking-wide text-arena-tier2">HOW IT WORKS</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div key={s.n} className="rounded-lg border border-white/8 bg-white/5 p-4">
            <div className="mb-2 grid h-8 w-8 place-items-center rounded-full bg-arena-tier2/15 font-display text-sm font-bold text-arena-tier2">
              {s.n}
            </div>
            <div className="text-sm font-semibold text-slate-100">{s.t}</div>
            <div className="mt-1 text-[12px] leading-snug text-slate-400">{s.d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="GPU Arena" className="h-7 w-7 object-contain" />
        <div className="text-xs text-slate-400">
          <span className="font-display font-bold text-slate-200">GPU ARENA</span> · GPUs battle, best answer wins ·
          built on Solana
        </div>
      </div>
      <div className="flex items-center gap-4">
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-arena-tier2">
          GitHub
        </a>
        <a href={TWITTER_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-arena-tier2">
          X / Twitter
        </a>
      </div>
    </footer>
  );
}
