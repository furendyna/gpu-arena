import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        arena: {
          bg: "#0a0806",
          panel: "#13100c",
          panel2: "#1a1510",
          // Tier 1 = subdued amber, Tier 2 = the hero orange.
          tier1: "#f59e0b",
          tier1b: "#b45309",
          tier2: "#ff751f",
          tier2b: "#c2410c",
          // Brand accent (prize, CTA, judging) — the requested orange.
          sol: "#ff751f",
          solb: "#ffa45c",
          gold: "#ffb84d",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // names kept for stability; recolored to the warm/orange theme.
        "neon-cyan": "0 0 20px rgba(245,158,11,0.30), inset 0 0 12px rgba(245,158,11,0.12)",
        "neon-magenta": "0 0 22px rgba(255,117,31,0.40), inset 0 0 12px rgba(255,117,31,0.16)",
        "neon-gold": "0 0 30px rgba(255,184,77,0.6)",
      },
      keyframes: {
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        pulseGlow: {
          "0%,100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        spinSlow: {
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        float: "float 4s ease-in-out infinite",
        pulseGlow: "pulseGlow 2.4s ease-in-out infinite",
        spinSlow: "spinSlow 18s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
