import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      colors: {
        accent: {
          light: "#5eeeca",
          DEFAULT: "#00d4aa",
          dark: "#00a080",
        },
        surface: {
          900: "#0b0f15",
          800: "#11161e",
          700: "#181d27",
        },
      },
    },
  },
  plugins: [],
};
export default config;
