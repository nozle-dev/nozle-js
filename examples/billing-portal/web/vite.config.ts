import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  server: {
    host: "127.0.0.1",
    port: 5179,
    strictPort: true,
    ...(process.env.DEV_TLS_CERT &&
      process.env.DEV_TLS_KEY && {
        https: {
          cert: readFileSync(process.env.DEV_TLS_CERT),
          key: readFileSync(process.env.DEV_TLS_KEY),
        },
      }),
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.MERCHANT_PORT || "4242"}`,
      },
      "/nozle-core": {
        target: `http://127.0.0.1:${process.env.CORE_PORT || "43100"}`,
        rewrite: (path) => path.replace(/^\/nozle-core/, ""),
      },
    },
  },
});
