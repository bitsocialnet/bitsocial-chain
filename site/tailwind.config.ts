import type { Config } from "tailwindcss";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The chain site's visual system lives in CSS custom properties (src/styles.css),
// so Tailwind here is just the base/reset layer. Content globs are absolute so the
// build works when invoked from the monorepo root.
export default {
  content: [
    path.resolve(__dirname, "index.html"),
    path.resolve(__dirname, "src/**/*.{js,ts,jsx,tsx}"),
  ],
  safelist: ["hidden"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
