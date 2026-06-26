"use client";

import { motion } from "framer-motion";

/** Burst of glowing SOL token coins for the winner reveal. */
export function TokenConfetti({ count = 28 }: { count?: number }) {
  const pieces = Array.from({ length: count });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((_, i) => {
        const x = (Math.random() - 0.5) * 520;
        const delay = Math.random() * 0.3;
        const dur = 1.4 + Math.random() * 1.2;
        const size = 10 + Math.random() * 12;
        return (
          <motion.div
            key={i}
            initial={{ x: 0, y: -20, opacity: 0, rotate: 0 }}
            animate={{ x, y: 380, opacity: [0, 1, 1, 0], rotate: 360 }}
            transition={{ duration: dur, delay, ease: "easeIn", repeat: Infinity, repeatDelay: 0.4 }}
            className="absolute left-1/2 top-10"
            style={{ width: size, height: size }}
          >
            <div
              className="h-full w-full rounded-full"
              style={{
                background: "linear-gradient(135deg,#ffa45c,#ff751f)",
                boxShadow: "0 0 12px rgba(255,117,31,0.7)",
              }}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
