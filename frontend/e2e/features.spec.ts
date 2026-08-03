import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Uses the seeded admin Ava (has betting history + a large commit log).
// Requires: seeded DB + server started with POOLBET_ADMIN_NAMES=Ava.

test("home shows the edge-to-edge portfolio chart with range pills", async ({ page }) => {
  await login(page, "Ava");
  await expect(page.getByRole("heading", { name: "Your groups" })).toBeVisible();
  // range pills
  for (const r of ["1D", "1W", "1M", "All"]) {
    await expect(page.getByRole("button", { name: r, exact: true })).toBeVisible();
  }
  // the chart line is drawn as an SVG path in the 1000×300 viewBox
  await expect(page.locator('svg[viewBox="0 0 1000 300"] path')).toBeVisible();
});

test("commit log paginates, filters by range/date, and opens event details", async ({ page }) => {
  await login(page, "Ava");
  await page.goto("/#/admin");
  await expect(page.getByText("Commit log", { exact: true })).toBeVisible();

  // "All" range → full seeded log has >1 page
  await page.getByRole("button", { name: "All", exact: true }).click();
  const older = page.getByRole("button", { name: "Older" });
  await expect(older).toBeVisible();
  await older.click();
  await expect(page.getByText("page 2")).toBeVisible();

  // exact date filter (calendar): an end far in the past yields no rows
  await page.getByLabel("To", { exact: true }).fill("2020-01-01T00:00");
  await expect(page.getByText("No events in this range.")).toBeVisible();

  // back to a populated range, then open an event's detail dialog
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByText(/tap for details/).first().click();
  await expect(page.getByText("Payload")).toBeVisible();
});

test("group leaderboard (Ranks) tab renders ranked standings", async ({ page }) => {
  await login(page, "Ava");
  await page.getByText("Test League").click();
  const ranks = page.getByRole("tab", { name: "Ranks" });
  await ranks.click();
  await expect(ranks).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Ava").first()).toBeVisible();
});

test("session telemetry emits a session_ping when the tab is hidden", async ({ page }) => {
  await login(page, "Ava");
  await page.reload(); // boot with a token present so telemetry is active
  await page.waitForTimeout(1200); // accrue >0s of session time

  const pingSent = page.waitForRequest(
    (r) => r.url().includes("/events") && (r.postData() ?? "").includes("session_ping"),
    { timeout: 5000 },
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await pingSent;
});
