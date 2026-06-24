import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "scripts/eval-project-roots-runner.ts",
    outDir: "node_modules/.tmp/fixer-root-evals",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: {
      output: {
        entryFileNames: "eval-project-roots.mjs",
        format: "es",
      },
    },
  },
});

