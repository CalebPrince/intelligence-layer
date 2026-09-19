import type { Config } from "tailwindcss";

// Palette: deliberate, not shadcn defaults — deep ink base with a routed-perspective
// accent per provider color used in the concept art (openai/anthropic/gemini).
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0E14",
        paper: "#F6F5F1",
        brand: {
          DEFAULT: "#12A150",
          hover: "#0E8A43",
          tint: "#E6F5EC",
          deep: "#062B1E",
          mid: "#0B4A33",
        },
        accent: {
          claude: "#D97757",
          openai: "#10A37F",
          gemini: "#4F7CFF",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        hand: ["var(--font-hand)", "cursive"],
      },
    },
  },
  plugins: [],
} satisfies Config;
