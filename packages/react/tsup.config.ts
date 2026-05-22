import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "styles/preset": "src/styles/preset.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  minify: false,
  outDir: "dist",
  external: ["react", "react-dom", "react/jsx-runtime", "@stripe/stripe-js", "@stripe/react-stripe-js"],
});
