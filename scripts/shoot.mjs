import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:8000";
const args = JSON.parse(readFileSync("/tmp/shoot_args.json", "utf8"));
const gid = args.gid;
const token = args.token;
const pages = args.pages || ["home", "group"];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

async function seed(theme) {
  await page.goto(BASE + "/");
  await page.evaluate(
    ([t, g, th]) => {
      localStorage.setItem("pb_token", t);
      localStorage.setItem("pb_groups", JSON.stringify([g]));
      localStorage.setItem("pb_theme", th);
    },
    [token, gid, theme],
  );
}

const routes = { home: "/#/", group: `/#/group/${gid}`, admin: "/#/admin" };

for (const theme of ["dark", "light"]) {
  await seed(theme);
  for (const p of pages) {
    await page.goto(BASE + routes[p]);
    await page.waitForTimeout(1800);
    // expand the first market card on the group page so we see the bet UI
    if (p === "group") {
      try { await page.locator("button:has-text('%')").first().click({ timeout: 1500 }); await page.waitForTimeout(600); } catch {}
    }
    await page.screenshot({ path: `/tmp/shot_${p}_${theme}.png` });
    console.log(`shot_${p}_${theme}.png`);
  }
}

await browser.close();
console.log("done");
