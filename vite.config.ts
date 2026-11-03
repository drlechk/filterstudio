import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
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
