import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const mathjaxPackage = createRequire(import.meta.url)("mathjax-full/package.json") as { version: string };
export default defineConfig({
  plugins: [react(), {
    name: "include-project-license",
    generateBundle() {
      for (const fileName of ["LICENSE", "NOTICE"]) {
        this.emitFile({ type: "asset", fileName, source: readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8") });
      }
    },
  }],
  // MathJax's source modules otherwise try to discover their version via Node's require().
  define: { PACKAGE_VERSION: JSON.stringify(mathjaxPackage.version) },
  base: "./",
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4310",
      "/bridge": { target: "ws://127.0.0.1:4310", ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: { math: ["katex"], canvas: ["@xyflow/react"] } },
    },
  },
});
