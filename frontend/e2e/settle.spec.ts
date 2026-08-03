import { test, expect } from "@playwright/test";
import { rand, signup, createGroup } from "./helpers";

// The Settle tab shows Splitwise-style standings + who-pays-who. A fresh group
// with only granted credits nets to zero, so it shows the "even" state.
test("settle tab: fresh group shows standings and an even state", async ({ page }) => {
  await signup(page, rand("Settle-"));
  await createGroup(page, rand("Grp-"));

  await page.getByRole("tab", { name: "Settle" }).click();
  await expect(page.getByText("Standings")).toBeVisible();
  await expect(page.getByText(/Everyone.?s even/i)).toBeVisible();
});
