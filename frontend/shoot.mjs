// Screenshot harness for a see -> fix -> recheck loop. Self-contained: logs in,
// finds a group, and shoots key screens at iPhone Air resolution.
//   npm run shots                       # dark+light, home/group/admin
//   PB_THEMES=dark PB_PAGES=group npm run shots
import { chromium } from "playwright";

const BASE = process.env.PB_BASE || "http://localhost:8000";
const USER = process.env.PB_USER || "Ava";
const PW = process.env.PB_PW || "test1234";
const themes = (process.env.PB_THEMES || "dark,light").split(",");
const wanted = (process.env.PB_PAGES || "home,group,admin").split(",");

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: USER, password: PW }),
}).then((r) => r.json());
const token = login.api_token;
const groups = await fetch(`${BASE}/groups/mine`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
const gid = Array.isArray(groups) && groups[0] ? groups[0].id : null;

const routes = { home: "/#/", group: gid ? `/#/group/${gid}` : "/#/", admin: "/#/admin" };
const browser = await chromium.launch();

for (const theme of themes) {
  // iPhone Air — logical 420×912 @3x
  const ctx = await browser.newContext({ viewport: { width: 420, height: 912 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(
    ([t, th]) => { localStorage.setItem("pb_token", t); localStorage.setItem("pb_theme", th); },
    [token, theme],
  );
  const page = await ctx.newPage();
  for (const p of wanted) {
    await page.goto(BASE + (routes[p] || "/#/"));
    await page.waitForTimeout(2000);
    if (p === "group") {
      try { await page.locator("button:has-text('%')").first().click({ timeout: 1500 }); await page.waitForTimeout(700); } catch { /* no market */ }
    }
    await page.screenshot({ path: `/tmp/shot_${p}_${theme}.png` });
    console.log(`/tmp/shot_${p}_${theme}.png`);
  }
  await ctx.close();
}
await browser.close();
console.log("done");
