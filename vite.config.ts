import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: { environment: "jsdom", restoreMocks: true },
  build: {
    target: "es2020",
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["vue"],
      output: { assetFileNames: "[name][extname]" },
    },
    sourcemap: true,
  },
});
