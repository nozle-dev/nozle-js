#!/usr/bin/env node
// Screenshots each predefined theme for the docs gallery.
//
// Needs a page that renders the components in one theme from `?theme=<name>`, such as the
// /sdk-demo/themes page of the local demo app, and Playwright (`npm i -D playwright`).
//
//   node scripts/theme-screenshots.mjs http://localhost:3010/sdk-demo/themes ../../../NozleDocs/images/react/themes
//
// `light-filled` shows the filled highlight style.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const [base = "http://localhost:3010/sdk-demo/themes", outDir = "theme-screenshots"] = process.argv.slice(2);
const shots = [
  ["light", "light"],
  ["dark", "dark"],
  ["minimal", "minimal"],
  ["neobrutal", "neobrutal"],
  ["nozle", "nozle"],
  ["nozleDark", "nozle-dark"],
  ["light", "light-filled", "filled"],
  ["dark", "dark-filled", "filled"],
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [theme, file, highlight = "outline"] of shots) {
    const page = await browser.newPage({ viewport: { width: 1104, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(`${base}?theme=${theme}&highlight=${highlight}`, { waitUntil: "networkidle" });
    await page.locator("[data-theme-ready]").waitFor();
    const target = path.join(outDir, `${file}.png`);
    await page.locator("[data-theme-ready]").screenshot({ path: target });
    console.log(target);
    await page.close();
  }
} finally {
  await browser.close();
}
