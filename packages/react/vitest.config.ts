import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "@basera-sdk/core": path.resolve(__dirname, "../core/src/index.ts"),
    },
  },
});
