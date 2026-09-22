import { defineConfig } from "vite";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  server: {
    host: "127.0.0.1",
    port: 5179,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.MERCHANT_PORT || "4242"}`,
      },
    },
  },
});
