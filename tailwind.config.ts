import seogaemoPresets from "@seogaemo/ds-tailwind";
import scrollbarHide from "tailwind-scrollbar-hide";
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["SeogaemoMono", "ui-monospace", "monospace"],
      },
      colors: {
        login: {
          brand: "var(--login-brand)",
          "brand-strong": "var(--login-brand-strong)",
          stroke: "var(--login-stroke)",
          "stroke-strong": "var(--login-stroke-strong)",
        },
        kakao: "var(--kakao)",
      },
    },
  },
  plugins: [scrollbarHide],
  presets: [seogaemoPresets],
};

export default config;
