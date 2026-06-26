"use client";

import { motion } from "framer-motion";

/** Central Solana-mark "judging crystal" that scores incoming answers. */
export function JudgingCrystal({ active }: { active?: boolean }) {
  return (
    <div className="relative grid place-items-center">
      <motion.div
        animate={active ? { scale: [1, 1.12, 1], rotate: [0, 8, -8, 0] } : { scale: 1 }}
        transition={{ duration: 1.6, repeat: active ? Infinity : 0, ease: "easeInOut" }}
        className="relative"
      >
        {/* halo */}
        <div
          className={`absolute -inset-8 rounded-full blur-2xl transition-opacity ${active ? "opacity-80" : "opacity-30"}`}
          style={{ background: "radial-gradient(circle, rgba(255,117,31,0.5), transparent 65%)" }}
        />
        {/* diamond */}
        <div
          className="relative h-20 w-20 rotate-45 rounded-lg border border-white/30"
          style={{
            background: "linear-gradient(135deg, rgba(255,164,92,0.95), rgba(255,117,31,0.95))",
            boxShadow: "0 0 40px rgba(255,117,31,0.6)",
          }}
        >
          <div className="absolute inset-2 rounded-md bg-black/30" />
        </div>
      </motion.div>
      <div className="mt-6 text-center">
        <div className="font-display text-xs tracking-[0.3em] text-arena-tier2">JUDGING CRYSTAL</div>
        <div className="mt-1 max-w-[180px] text-[11px] leading-snug text-slate-400">
          {active ? "Scoring answers blind for coherence, accuracy & relevance…" : "Awaiting answers from the pool"}
        </div>
      </div>
    </div>
  );
}
