import { test, expect } from "@playwright/test";

const rand = (p: string) => `${p}${Math.random().toString(36).slice(2, 7)}`;

// Drives the raked-settlement flow via the API, then asserts the Settle screen
// surfaces the house take. Ava is the seeded admin.
test("house take shows on the settle screen after a raked settlement", async ({ page, request }) => {
  const H = (t: string) => ({ Authorization: `Bearer ${t}` });

  const ava = await (await request.post("/auth/login", { data: { name: "Ava", password: "test1234" } })).json();
  const at = ava.api_token;
  await request.post("/admin/settings", { headers: H(at), data: { house_rake: 0.05 } });

  const g = await (await request.post("/groups", {
    headers: H(at), data: { name: rand("Rake-"), starting_credits: "1000", dispute_window_hours: 0 },
  })).json();

  const bob = await (await request.post("/auth/signup", { data: { name: rand("Bob-"), password: "test1234" } })).json();
  await request.post("/groups/join", { headers: H(bob.api_token), data: { invite_code: g.invite_code } });

  const closes = new Date(Date.now() + 1500).toISOString();
  const m = await (await request.post(`/groups/${g.id}/markets`, {
    headers: H(at), data: { question: "Rake test?", closes_at: closes },
  })).json();
  await request.post(`/markets/${m.id}/bets`, { headers: H(at), data: { side: "YES", amount: "300" } });
  await request.post(`/markets/${m.id}/bets`, { headers: H(bob.api_token), data: { side: "NO", amount: "200" } });

  await page.waitForTimeout(1700); // let the market pass its close time
  expect((await request.post(`/markets/${m.id}/resolve`, { headers: H(at), data: { outcome: "YES" } })).ok()).toBeTruthy();
  expect((await request.post(`/markets/${m.id}/settle`, { headers: H(at) })).ok()).toBeTruthy();

  // Load the group as Ava and open the Settle tab.
  await page.addInitScript((tok) => localStorage.setItem("pb_token", tok as string), at);
  await page.goto(`/#/group/${g.id}`);
  await page.getByRole("tab", { name: "Settle" }).click();
  await expect(page.getByText(/house has taken/i)).toBeVisible();

  await request.post("/admin/settings", { headers: H(at), data: { house_rake: 0 } }); // reset for other specs
});
