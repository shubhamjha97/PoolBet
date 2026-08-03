import { test, expect } from "@playwright/test";
import { rand, signup, createGroup, joinGroup } from "./helpers";

// Two separate browser contexts (two logged-in users) verify real-time SSE fan-out.
test("SSE: user B sees user A's comment live", async ({ browser }) => {
  const gname = rand("SSE-");
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await signup(a, rand("Alice-"));
  await createGroup(a, gname); // A ends up on the group page
  const code = (await a.getByTestId("invite-code").innerText()).trim();

  await signup(b, rand("Bob-"));
  await joinGroup(b, code, gname); // B ends up on the group page (subscribes to SSE)
  await b.waitForTimeout(600); // let B's EventSource connect

  // A posts a comment → it must appear live in B's feed via SSE
  const msg = `live-${rand("")}`;
  await a.getByPlaceholder("Add a comment…").fill(msg);
  await a.getByRole("button", { name: "Send comment" }).click();

  await expect(b.getByText(new RegExp(msg))).toBeVisible({ timeout: 12_000 });

  await ctxA.close();
  await ctxB.close();
});
