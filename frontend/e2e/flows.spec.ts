import { test, expect, type Page } from "@playwright/test";

const rand = (p: string) => `${p}${Math.random().toString(36).slice(2, 7)}`;

async function signup(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Password").fill("test1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Your groups" })).toBeVisible();
}

async function createGroup(page: Page, name: string) {
  await page.getByRole("button", { name: /New group/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").first().fill(name);
  await dialog.getByRole("button", { name: /Create group/i }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test.describe("core flows", () => {
  test("sign up → create group → create market → place a bet", async ({ page }) => {
    await signup(page, rand("E2E-"));

    const gname = rand("Grp-");
    await createGroup(page, gname);

    // create a market
    await page.getByRole("button", { name: /^New$/ }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("textbox").first().fill("Will the test pass?");
    await dlg.getByRole("button", { name: /^Create$/ }).click();

    const card = page.locator("text=Will the test pass?").first();
    await expect(card).toBeVisible();

    // expand the market, place a YES bet
    await card.click();
    await page.getByRole("button", { name: "YES", exact: true }).first().click();
    // amount stepper: +100 chip a couple times
    await page.getByRole("button", { name: "+100" }).click();
    await page.getByRole("button", { name: /^Bet YES$/ }).click();

    // the bet shows up (nickname/name + YES) and the pot is no longer 0
    await expect(page.getByText(/pot 100/).first()).toBeVisible();
  });

  test("group appears in the list after creation and reload", async ({ page }) => {
    await signup(page, rand("E2E-"));
    const gname = rand("Persist-");
    await createGroup(page, gname);
    await page.goto("/");
    await expect(page.getByText(gname)).toBeVisible();
  });
});
