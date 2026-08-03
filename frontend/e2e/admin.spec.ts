import { test, expect, type Page } from "@playwright/test";

// Uses the seeded admin account (Ava). Requires: seeded DB + server started with
// POOLBET_ADMIN_NAMES=Ava.
async function login(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Log in", exact: true }).click(); // landing toggle
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Password").fill("test1234");
  await page.getByRole("button", { name: "Log in", exact: true }).last().click(); // submit
  await expect(page.getByRole("heading", { name: "Your groups" })).toBeVisible();
}

test.describe("admin", () => {
  test("unified commit log shows restore points and a rollback succeeds", async ({ page }) => {
    await login(page, "Ava");
    await page.goto("/#/admin");

    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    await expect(page.getByText("Commit log", { exact: true })).toBeVisible();
    // the separate "Rollback points" section is gone — rollback lives on the log now
    await expect(page.getByText("Rollback points")).toHaveCount(0);

    // widen to the whole log so restore-point events are in view
    await page.getByRole("button", { name: "All", exact: true }).click();

    // an eligible event carries an inline rollback button
    const rb = page.getByTestId("rollback-btn").first();
    await expect(rb).toBeVisible();
    await rb.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Roll back/ }).click();

    // success toast + the confirm dialog closes; the app stays functional
    await expect(page.getByText("Rolled back", { exact: true })).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Commit log", { exact: true })).toBeVisible();
  });

  test("metrics tiles render and the house rake saves", async ({ page }) => {
    await login(page, "Ava");
    await page.goto("/#/admin");

    await expect(page.getByText("Metrics", { exact: true })).toBeVisible();
    await expect(page.getByText("Users", { exact: true })).toBeVisible();
    await expect(page.getByText("Total volume", { exact: true })).toBeVisible();

    await expect(page.getByText("House rake", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("House rake saved")).toBeVisible();
  });
});
