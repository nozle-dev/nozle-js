import { readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "styles/preset": "src/styles/preset.ts",
    themes: "src/themes.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  minify: false,
  outDir: "dist",
  external: ["react", "react-dom", "react/jsx-runtime"],
  // Bundling drops the source files' "use client", so Next.js server components could not render
  // the components. Mark the main entry as client code; themes and the preset stay server-safe.
  // Prepended on the same line so the source maps keep their line numbers.
  onSuccess: async () => {
    for (const file of ["dist/index.js", "dist/index.cjs"]) {
      const code = await readFile(file, "utf8");
      if (!code.startsWith('"use client";')) await writeFile(file, '"use client";' + code);
    }
  },
});
