// Fails the build when the main entry is not marked as client code (see tsup.config.ts).
import { readFile } from "node:fs/promises";

for (const file of ["dist/index.js", "dist/index.cjs"]) {
  if (!(await readFile(file, "utf8")).startsWith('"use client";')) {
    console.error(`${file} does not start with "use client"`);
    process.exit(1);
  }
}
for (const file of ["dist/themes.js", "dist/themes.cjs"]) {
  if ((await readFile(file, "utf8")).includes('"use client"')) {
    console.error(`${file} must stay importable from server components`);
    process.exit(1);
  }
}
