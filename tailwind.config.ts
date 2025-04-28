import seogaemoPresets from "@seogaemo/ds-tailwind";
import scrollbarHide from "tailwind-scrollbar-hide";
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  plugins: [scrollbarHide],
  presets: [seogaemoPresets],
};

export default config;
