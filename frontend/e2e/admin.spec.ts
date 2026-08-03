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
  test("commit log is visible and a rollback succeeds", async ({ page }) => {
    await login(page, "Ava");
    await page.goto("/#/admin");

    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    await expect(page.getByText("Rollback points", { exact: true })).toBeVisible();
    await expect(page.getByText("Commit log", { exact: true })).toBeVisible();

    // roll back to the first snapshot → confirm
    await page.getByRole("button", { name: /Roll back/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Roll back/ }).click();

    // success toast, and the dialog closes
    await expect(page.getByText("Rolled back", { exact: true })).toBeVisible(); // the toast (not "State rolled back" log lines)
  });
});
