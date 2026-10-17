#!/usr/bin/env node
// Screenshots each component in each predefined theme for the docs component reference.
//
// Needs a page that renders the components in one theme from `?theme=<name>` and wraps each one in
// an element with `data-component="<Name>"`, such as the /sdk-demo/themes page of the local demo
// app, and Playwright (`npm i -D playwright`).
//
//   node scripts/component-screenshots.mjs http://localhost:3010/sdk-demo/themes ../../../NozleDocs/images/react/components
//
// Writes `<out>/<component-kebab>/<theme>.png`, for example `pricing-table/nozle-dark.png`. The
// dialogs (UpgradeModal, the PlanChangeControl steps, the CancellationControl dialog) are opened
// by clicking their buttons on the page.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const [base = "http://localhost:3010/sdk-demo/themes", outDir = "component-screenshots"] = process.argv.slice(2);
const themes = ["light", "dark", "minimal", "neobrutal", "nozle", "nozleDark"];
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

// Hides the block labels, the sticky page header and the Next.js dev indicator, and gives each
// block a margin of page background without moving the layout.
const css = `
[data-component] > code { display: none !important }
[data-component] { padding: 16px; margin: -16px }
header[style*="sticky"] { position: static !important }
nextjs-portal { display: none !important }
`;

// Dialogs: the block holding the trigger, the steps to open each state, and the file name.
const dialogs = [
  {
    block: "UpgradeButton",
    steps: [{ click: "Upgrade to Scale", shot: "upgrade-modal", dialog: ".nozle-upgradeModal__dialog" }],
  },
  {
    block: "PlanChangeControl",
    steps: [
      { click: "Change plan", radio: "Scale", shot: "plan-change-control-plans", dialog: ".nozle-upgradeModal__dialog" },
      { click: "Review change", wait: "Confirm upgrade", shot: "plan-change-control-confirm", dialog: ".nozle-upgradeModal__dialog" },
    ],
  },
  {
    block: "CancellationControl",
    steps: [{ click: "Cancel subscription", wait: "Confirm cancellation", shot: "cancellation-control-dialog", dialog: ".nzc-dialog" }],
  },
];

async function save(target) {
  await mkdir(path.dirname(target), { recursive: true });
  console.log(target);
  return target;
}

const browser = await chromium.launch();
try {
  for (const theme of themes) {
    const page = await browser.newPage({ viewport: { width: 1104, height: 1100 }, deviceScaleFactor: 2 });
    await page.goto(`${base}?theme=${theme}`, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: css });
    await page.evaluate(() => document.fonts.ready);
    // The billing portal reads its sample data after the session callback resolves.
    await page.waitForTimeout(1500);
    const file = `${kebab(theme)}.png`;

    for (const block of await page.locator("[data-component]").all()) {
      const name = await block.getAttribute("data-component");
      await block.screenshot({ path: await save(path.join(outDir, kebab(name), file)), animations: "disabled" });
    }

    // Behind the dialogs, only the block that opened them stays visible.
    await page.addStyleTag({
      content: `[data-component]:not(:has(.nozle-upgradeModal, .nzc-backdrop)), section > h2, [data-theme-ready] { visibility: hidden }`,
    });
    for (const { block, steps } of dialogs) {
      // The first step clicks a button in the block, the next ones a button in the open dialog.
      const container = page.locator(`[data-component="${block}"]`);
      let scope = container;
      for (const step of steps) {
        // The trigger is hidden behind the dialog's backdrop, so it is clicked from the page.
        await scope.getByRole("button", { name: step.click, exact: true, includeHidden: true }).evaluate((button) => button.click());
        const dialog = container.locator(step.dialog);
        await dialog.waitFor();
        scope = dialog;
        if (step.radio) await dialog.getByRole("radio", { name: step.radio }).check();
        if (step.wait) await dialog.getByRole("button", { name: step.wait }).waitFor();
        // No focus ring from the programmatic click.
        await page.evaluate(() => document.activeElement?.blur());
        await page.waitForTimeout(200);
        // The dialog with a strip of the dimmed page around it.
        const box = await dialog.boundingBox();
        const pad = 16;
        const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 };
        await page.screenshot({ path: await save(path.join(outDir, step.shot, file)), clip, animations: "disabled" });
      }
      await scope.getByRole("button", { name: "Close", exact: true }).click();
      await scope.waitFor({ state: "detached" });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
