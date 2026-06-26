import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        arena: {
          bg: "#070612",
          panel: "#0d0b22",
          panel2: "#13102e",
          tier1: "#22d3ee",
          tier1b: "#0ea5e9",
          tier2: "#c026d3",
          tier2b: "#a21caf",
          sol: "#14f195",
          solb: "#9945ff",
          gold: "#fbbf24",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "neon-cyan": "0 0 20px rgba(34,211,238,0.35), inset 0 0 12px rgba(34,211,238,0.15)",
        "neon-magenta": "0 0 20px rgba(192,38,211,0.35), inset 0 0 12px rgba(192,38,211,0.15)",
        "neon-gold": "0 0 30px rgba(251,191,36,0.55)",
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
