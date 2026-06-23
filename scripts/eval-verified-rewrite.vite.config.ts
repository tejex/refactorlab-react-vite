import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "scripts/eval-verified-rewrite.ts",
    outDir: "node_modules/.tmp/fixer-evals",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: {
      output: {
        entryFileNames: "eval-verified-rewrite.mjs",
        format: "es",
      },
    },
  },
});
