#!/usr/bin/env node
// Screenshots each predefined theme for the docs gallery.
//
// Needs a page that renders the components in one theme from `?theme=<name>`, such as the
// /sdk-demo/themes page of the local demo app, and Playwright (`npm i -D playwright`).
//
//   node scripts/theme-screenshots.mjs http://localhost:3010/sdk-demo/themes ../../../NozleDocs/images/react/themes
//
// `highlight-<theme>-<style>.png` crops the
// PricingTable alone, in both highlight styles, for the docs' highlighted-plan section.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const [base = "http://localhost:3010/sdk-demo/themes", outDir = "theme-screenshots"] = process.argv.slice(2);
const themes = [
  ["light", "light"],
  ["dark", "dark"],
  ["nozle", "nozle"],
  ["nozleDark", "nozle-dark"],
  ["minimal", "minimal"],
  ["neobrutal", "neobrutal"],
];
const shots = [
  ["light", "light"],
  ["dark", "dark"],
  ["minimal", "minimal"],
  ["neobrutal", "neobrutal"],
  ["nozle", "nozle"],
  ["nozleDark", "nozle-dark"],
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
  for (const [theme, file] of themes) {
    for (const highlight of ["outline", "filled"]) {
      const page = await browser.newPage({ viewport: { width: 1104, height: 900 }, deviceScaleFactor: 2 });
      await page.goto(`${base}?theme=${theme}&highlight=${highlight}`, { waitUntil: "networkidle" });
      await page.locator("[data-theme-ready]").waitFor();
      // The first child of the gallery grid is the PricingTable; keep room for the badge above the card.
      const box = await page.locator("[data-theme-ready] > div > :first-child").boundingBox();
      const target = path.join(outDir, `highlight-${file}-${highlight}.png`);
      await page.screenshot({ path: target, clip: { x: box.x - 16, y: box.y - 24, width: box.width + 32, height: box.height + 40 } });
      console.log(target);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
