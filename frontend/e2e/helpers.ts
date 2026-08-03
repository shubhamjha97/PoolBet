import { expect, type Page } from "@playwright/test";

export const rand = (p: string) => `${p}${Math.random().toString(36).slice(2, 7)}`;

export async function login(page: Page, name: string, password = "test1234") {
  await page.goto("/");
  await page.getByRole("button", { name: "Log in", exact: true }).click(); // landing toggle
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).last().click(); // submit
  await expect(page.getByRole("heading", { name: "Your groups" })).toBeVisible();
}

export async function signup(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Password").fill("test1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Your groups" })).toBeVisible();
}

export async function createGroup(page: Page, name: string) {
  await page.getByRole("button", { name: /New group/i }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("textbox").first().fill(name);
  await d.getByRole("button", { name: /Create group/i }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

export async function joinGroup(page: Page, code: string, groupName: string) {
  await page.getByRole("button", { name: /Join with code/i }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("textbox").first().fill(code);
  await d.getByRole("button", { name: /Join group/i }).click();
  await expect(page.getByRole("heading", { name: groupName })).toBeVisible();
}
