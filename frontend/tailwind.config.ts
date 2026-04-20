import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        "bg-0": "var(--bg-0)",
        "bg-1": "var(--bg-1)",
        "bg-2": "var(--bg-2)",
        "bg-3": "var(--bg-3)",
        "t-0": "var(--text-0)",
        "t-1": "var(--text-1)",
        "t-2": "var(--text-2)",
        "t-3": "var(--text-3)",
        ok: "var(--ok)",
        warn: "var(--warn)",
        danger: "var(--danger)",
      },
      fontFamily: {
        sans: ["Geist", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
        serif: ["Instrument Serif", "Georgia", "serif"],
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "12px",
        lg: "16px",
      },
      animation: {
        "fade-in": "fadeIn 160ms ease-out",
        pulse: "pulse 1.2s ease-in-out infinite",
        speaking: "speaking 1.2s ease-in-out infinite",
        "ring-pulse": "ringPulse 1.6s infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        speaking: {
          "0%,100%": { transform: "scale(1)", opacity: "0.8" },
          "50%": { transform: "scale(1.08)", opacity: "1" },
        },
        ringPulse: {
          "0%": { boxShadow: "0 0 0 0 rgba(124,92,255,0.5)" },
          "70%": { boxShadow: "0 0 0 24px rgba(124,92,255,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(124,92,255,0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
