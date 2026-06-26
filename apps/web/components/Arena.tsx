"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Competitor, Tier } from "@gpu-arena/shared";
import { TIER_LABELS } from "@gpu-arena/shared";
import { ANSWER_SNIPPETS, COMPETITORS, SAMPLE_BOUNTY } from "@/lib/mock";
import { GpuCard } from "./GpuCard";
import { JudgingCrystal } from "./JudgingCrystal";
import { TokenConfetti } from "./TokenConfetti";

type Phase = "idle" | "battling" | "judging" | "result";

// Pre-baked target scores. NOTE: in each tier the winner is deliberately NOT the
// strongest GPU — best answer wins, not the most powerful card.
const TARGET_SCORES: Record<string, number> = {
  "t1-a": 88, // RTX 3060  -> winner over the 2080 Ti
  "t1-b": 84,
  "t1-c": 76,
  "t1-d": 80,
  "t2-c": 94, // RTX 4080 Super -> winner over the 4090
  "t2-a": 86,
  "t2-b": 81,
  "t2-d": 79,
};

export function Arena() {
  const [tier, setTier] = useState<Tier>(2);
  const [phase, setPhase] = useState<Phase>("idle");
  const [streams, setStreams] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, number>>({});
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const roster = useMemo(() => COMPETITORS.filter((c) => c.tier === tier), [tier]);
  const tier1 = useMemo(() => COMPETITORS.filter((c) => c.tier === 1), []);
  const tier2 = useMemo(() => COMPETITORS.filter((c) => c.tier === 2), []);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  const startBattle = useCallback(() => {
    clearTimers();
    setPhase("battling");
    setStreams({});
    setScores({});
    setWinnerId(null);

    // 1) Stream each competitor's answer (typewriter).
    const STREAM_MS = 2600;
    roster.forEach((c) => {
      const full = ANSWER_SNIPPETS[c.id] ?? "";
      const steps = Math.max(full.length, 1);
      for (let i = 1; i <= steps; i++) {
        const t = setTimeout(() => {
          setStreams((prev) => ({ ...prev, [c.id]: full.slice(0, i) }));
        }, (STREAM_MS / steps) * i + Math.random() * 120);
        timers.current.push(t);
      }
    });

    // 2) Judging phase.
    timers.current.push(
      setTimeout(() => {
        setPhase("judging");
        const JUDGE_MS = 1600;
        const ticks = 24;
        for (let k = 1; k <= ticks; k++) {
          const t = setTimeout(() => {
            setScores(() => {
              const next: Record<string, number> = {};
              roster.forEach((c) => {
                next[c.id] = (TARGET_SCORES[c.id] ?? 70) * (k / ticks);
              });
              return next;
            });
          }, (JUDGE_MS / ticks) * k);
          timers.current.push(t);
        }
      }, STREAM_MS + 500),
    );

    // 3) Result + winner reveal.
    timers.current.push(
      setTimeout(() => {
        const winner = [...roster].sort(
          (a, b) => (TARGET_SCORES[b.id] ?? 0) - (TARGET_SCORES[a.id] ?? 0),
        )[0];
        setWinnerId(winner.id);
        setPhase("result");
      }, STREAM_MS + 500 + 1900),
    );
  }, [roster]);

  const accent = tier === 1 ? "text-arena-tier1" : "text-arena-tier2";

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6">
      <Header onCreate={startBattle} phase={phase} />

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr_300px]">
        <PoolColumn
          title={TIER_LABELS[1]}
          tier={1}
          competitors={tier1}
          activeTier={tier}
          phase={phase}
          scores={scores}
          winnerId={winnerId}
          onSelect={() => phase === "idle" && setTier(1)}
        />

        <BattleStage
          tier={tier}
          phase={phase}
          roster={roster}
          streams={streams}
          winnerId={winnerId}
          onStart={startBattle}
        />

        <PoolColumn
          title={TIER_LABELS[2]}
          tier={2}
          competitors={tier2}
          activeTier={tier}
          phase={phase}
          scores={scores}
          winnerId={winnerId}
          onSelect={() => phase === "idle" && setTier(2)}
        />
      </div>

      <Scoreboard roster={roster} scores={scores} accent={accent} />
      <StatBar />
    </div>
  );
}

/* ----------------------------- Header ----------------------------- */

function Header({ onCreate, phase }: { onCreate: () => void; phase: Phase }) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
      <div className="flex items-center gap-3">
        <div className="clip-card grid h-14 w-14 place-items-center bg-gradient-to-br from-arena-tier1 to-arena-tier2 font-display text-2xl font-black text-black">
          GA
        </div>
        <div>
          <div className="font-display text-2xl font-black leading-none tracking-wide">
            GPU<span className="text-arena-tier2"> ARENA</span>
          </div>
          <div className="text-[11px] tracking-[0.25em] text-slate-400">GPUS BATTLE · BEST ANSWER WINS</div>
        </div>
      </div>

      <div className="clip-card glass flex flex-1 items-center gap-4 px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.25em] text-arena-sol">Active Bounty</div>
          <div className="truncate text-sm font-semibold text-slate-100">{SAMPLE_BOUNTY.title}</div>
          <div className="text-[11px] text-slate-400">Category: {SAMPLE_BOUNTY.category}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Prize Pool</div>
          <div className="font-display text-2xl font-black text-arena-sol">
            {SAMPLE_BOUNTY.prizeAmount.toLocaleString()} <span className="text-sm">SOL</span>
          </div>
        </div>
      </div>

      <button
        onClick={onCreate}
        className="clip-card group relative overflow-hidden bg-gradient-to-r from-arena-sol to-arena-solb px-6 py-3 font-display text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-95"
      >
        {phase === "idle" ? "⚔ START BATTLE" : "↻ REMATCH"}
      </button>
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
  scores,
  winnerId,
  onSelect,
}: {
  title: string;
  tier: Tier;
  competitors: Competitor[];
  activeTier: Tier;
  phase: Phase;
  scores: Record<string, number>;
  winnerId: string | null;
  onSelect: () => void;
}) {
  const isActive = activeTier === tier;
  const showScores = phase === "judging" || phase === "result";
  const accent = tier === 1 ? "text-arena-tier1" : "text-arena-tier2";
  return (
    <button
      onClick={onSelect}
      className={`clip-card glass flex flex-col gap-2 p-3 text-left transition-opacity ${
        isActive ? "opacity-100" : "opacity-60 hover:opacity-90"
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <span className={`font-display text-sm font-bold tracking-wide ${accent}`}>{title}</span>
        <span className="text-[10px] text-slate-500">{competitors.length} GPUs</span>
      </div>
      {competitors.map((c, i) => (
        <GpuCard
          key={c.id}
          competitor={c}
          rank={i + 1}
          score={isActive && showScores ? scores[c.id] : undefined}
          active={isActive && phase === "battling"}
          winner={winnerId === c.id}
        />
      ))}
    </button>
  );
}

/* --------------------------- Battle Stage --------------------------- */

function BattleStage({
  tier,
  phase,
  roster,
  streams,
  winnerId,
  onStart,
}: {
  tier: Tier;
  phase: Phase;
  roster: Competitor[];
  streams: Record<string, string>;
  winnerId: string | null;
  onStart: () => void;
}) {
  const winner = roster.find((c) => c.id === winnerId);
  const beam = tier === 1 ? "#22d3ee" : "#c026d3";

  return (
    <div className="clip-card glass relative grid min-h-[460px] place-items-center overflow-hidden p-6">
      {/* arena rings */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-40">
        <div className="h-[420px] w-[420px] animate-spinSlow rounded-full border border-white/10" />
        <div className="absolute h-[300px] w-[300px] rounded-full border border-white/10" />
        <div className="absolute h-[180px] w-[180px] rounded-full border border-white/10" />
      </div>

      <AnimatePresence mode="wait">
        {phase === "result" && winner ? (
          <motion.div
            key="winner"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 text-center"
          >
            <TokenConfetti />
            {/* spotlight */}
            <div
              className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[260px] -translate-x-1/2 -translate-y-10"
              style={{
                background: "linear-gradient(to bottom, rgba(251,191,36,0.35), transparent 70%)",
                clipPath: "polygon(42% 0, 58% 0, 100% 100%, 0 100%)",
              }}
            />
            <div className="font-display text-xs tracking-[0.4em] text-arena-gold">WINNER</div>
            <div className="mt-2 font-display text-3xl font-black text-arena-gold drop-shadow">
              {winner.gpu.model}
            </div>
            <div className="text-sm text-slate-300">@{winner.handle}</div>
            <div className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-200">
              “{streams[winner.id]}”
            </div>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-arena-sol/15 px-4 py-1.5 text-sm font-semibold text-arena-sol">
              +{SAMPLE_BOUNTY.prizeAmount.toLocaleString()} SOL paid out
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Best answer won — not the most powerful GPU.
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 grid w-full place-items-center"
          >
            <JudgingCrystal active={phase === "battling" || phase === "judging"} />

            {phase === "idle" && (
              <button
                onClick={onStart}
                className="mt-8 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm text-slate-200 transition hover:border-arena-sol/60 hover:text-arena-sol"
              >
                Click to run a battle in {tier === 1 ? "Tier 1" : "Tier 2"}
              </button>
            )}

            {(phase === "battling" || phase === "judging") && (
              <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                {roster.map((c) => (
                  <div
                    key={c.id}
                    className="clip-card glass relative min-h-[64px] px-3 py-2 text-[11px] leading-snug text-slate-300"
                    style={{ borderColor: `${beam}55` }}
                  >
                    <div className="mb-1 text-[10px] font-semibold" style={{ color: beam }}>
                      {c.gpu.model}
                    </div>
                    {streams[c.id] ?? ""}
                    {phase === "battling" && (
                      <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulseGlow bg-current align-middle" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------- Scoreboard --------------------------- */

function Scoreboard({
  roster,
  scores,
  accent,
}: {
  roster: Competitor[];
  scores: Record<string, number>;
  accent: string;
}) {
  const ranked = [...roster].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  const hasScores = Object.keys(scores).length > 0;
  return (
    <div className="clip-card glass mt-4 p-4">
      <div className={`mb-3 font-display text-sm font-bold tracking-wide ${accent}`}>LIVE SCOREBOARD</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {ranked.map((c, i) => (
          <div key={c.id} className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2">
            <span className="text-xs text-slate-300">
              <span className="mr-2 text-slate-500">{i + 1}</span>
              {c.gpu.model}
            </span>
            <span className="text-sm font-bold tabular-nums">
              {hasScores ? Math.round(scores[c.id] ?? 0) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- Stat bar ----------------------------- */

function StatBar() {
  const stats = [
    ["Total Battles", "12,847"],
    ["SOL Paid Out", "234,982"],
    ["Active GPUs", "1,248"],
    ["Battles Today", "382"],
    ["Avg Response", "12.4s"],
  ];
  return (
    <div className="clip-card glass mt-4 grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map(([k, v]) => (
        <div key={k} className="text-center">
          <div className="font-display text-lg font-black text-slate-100">{v}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{k}</div>
        </div>
      ))}
    </div>
  );
}
