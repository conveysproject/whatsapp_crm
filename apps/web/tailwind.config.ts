import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        wa: {
          green:          "var(--wa-green)",
          teal:           "#128C7E",
          light:          "#DCF8C6",
          header:         "var(--wa-header)",
          bg:             "var(--wa-bg)",
          sidebar:        "var(--wa-sidebar)",
          search:         "var(--wa-search)",
          active:         "var(--wa-active)",
          hover:          "var(--wa-hover)",
          border:         "var(--wa-border)",
          "bubble-out":   "var(--wa-bubble-out)",
          "bubble-in":    "var(--wa-bubble-in)",
          timestamp:      "var(--wa-timestamp)",
          "text-primary": "var(--wa-text-primary)",
          "text-secondary":"var(--wa-text-secondary)",
          icon:           "var(--wa-icon)",
          input:          "var(--wa-input)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
