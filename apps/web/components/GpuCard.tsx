"use client";

import { motion } from "framer-motion";
import type { Competitor, Tier } from "@gpu-arena/shared";

const tierStyles: Record<Tier, { ring: string; glow: string; text: string; bar: string }> = {
  1: {
    ring: "border-arena-tier1/40",
    glow: "shadow-neon-cyan",
    text: "text-arena-tier1",
    bar: "from-arena-tier1 to-arena-tier1b",
  },
  2: {
    ring: "border-arena-tier2/40",
    glow: "shadow-neon-magenta",
    text: "text-arena-tier2",
    bar: "from-arena-tier2 to-arena-tier2b",
  },
};

export function GpuCard({
  competitor,
  rank,
  score,
  active,
  winner,
}: {
  competitor: Competitor;
  rank: number;
  score?: number;
  active?: boolean;
  winner?: boolean;
}) {
  const s = tierStyles[competitor.tier];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: winner ? 1.03 : 1,
      }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className={`clip-card glass relative flex items-center gap-3 border ${s.ring} px-3 py-2.5 ${
        active ? s.glow : ""
      } ${winner ? "ring-2 ring-arena-gold shadow-neon-gold" : ""}`}
    >
      <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/5 text-xs font-bold ${s.text}`}>
        {rank}
      </div>

      {/* GPU glyph */}
      <div className="relative grid h-11 w-16 shrink-0 place-items-center overflow-hidden rounded-md border border-white/10 bg-black/40">
        <div className={`absolute inset-0 bg-gradient-to-br ${s.bar} opacity-10`} />
        <div className="flex gap-1">
          <span className={`block h-3 w-3 rounded-full border ${s.ring} ${active ? "animate-pulseGlow" : ""}`} />
          <span className={`block h-3 w-3 rounded-full border ${s.ring} ${active ? "animate-pulseGlow" : ""}`} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{competitor.gpu.model}</span>
          {winner && <span className="text-[10px] font-bold text-arena-gold">WINNER</span>}
        </div>
        <div className="truncate text-[11px] text-slate-400">
          @{competitor.handle} · {(competitor.gpu.memoryMb ?? 0) / 1024}GB
        </div>
      </div>

      <div className="text-right">
        {score !== undefined ? (
          <div className={`text-base font-bold tabular-nums ${winner ? "text-arena-gold" : s.text}`}>
            {Math.round(score)}
          </div>
        ) : (
          <div className="text-base font-bold tabular-nums text-slate-200">{competitor.points}</div>
        )}
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{score !== undefined ? "score" : "pts"}</div>
      </div>
    </motion.div>
  );
}
