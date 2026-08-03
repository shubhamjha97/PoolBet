"""Seed PoolBet with a rich test dataset via the live API, then dump credentials
to TEST_USERS.md.

Wipes to a clean state (recreate poolbet.db + restart the server first), then
creates users, several groups, markets (open / resolved / scalar), and many bets
(some anonymous). Run:  ./.venv/bin/python scripts/seed_test_data.py
"""
import sys
import time
from datetime import datetime, timedelta, timezone

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
PW = "test1234"
c = httpx.Client(base_url=BASE, timeout=20)

# Ava is created first → app admin (also POOLBET_ADMIN_NAMES=Ava).
USERS = ["Ava", "Ben", "Cy", "Dee", "Eve", "Finn", "Gus", "Hana"]
tokens: dict[str, str] = {}


def h(name):
    return {"Authorization": f"Bearer {tokens[name]}"}


def signup(name):
    r = c.post("/auth/signup", json={"name": name, "password": PW})
    if r.status_code == 409:  # already exists → log in
        r = c.post("/auth/login", json={"name": name, "password": PW})
    r.raise_for_status()
    tokens[name] = r.json()["api_token"]


def make_group(owner, name, members, dispute_hours=0, credits="1000"):
    g = c.post("/groups", json={"name": name, "starting_credits": credits, "dispute_window_hours": dispute_hours},
               headers=h(owner)).json()
    for m in members:
        if m != owner:
            c.post("/groups/join", json={"invite_code": g["invite_code"]}, headers=h(m))
    return g


def make_market(gid, owner, question, hours, rules=None):
    body = {"question": question, "closes_at": (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()}
    if rules:
        body["rules"] = rules
    return c.post(f"/groups/{gid}/markets", json=body, headers=h(owner)).json()["id"]


def bet(mid, name, side, amt, anon=False):
    c.post(f"/markets/{mid}/bets", json={"side": side, "amount": str(amt), "anonymous": anon}, headers=h(name))


def resolve(mid, owner, outcome, pct=None):
    body = {"outcome": outcome}
    if pct is not None:
        body["yes_percent"] = pct
    r1 = c.post(f"/markets/{mid}/resolve", json=body, headers=h(owner))
    r2 = c.post(f"/markets/{mid}/settle", headers=h(owner))  # 0h window → proposer settles now
    if r1.status_code >= 300 or r2.status_code >= 300:
        raise SystemExit(f"seed resolve failed: resolve={r1.status_code} {r1.text} "
                         f"settle={r2.status_code} {r2.text}")


def main():
    for u in USERS:
        signup(u)
    print("users:", ", ".join(USERS))

    # ---- Group 1: Test League (everyone) ----
    g1 = make_group("Ava", "Test League", USERS, dispute_hours=0)
    m = make_market(g1["id"], "Ava", "Will it rain this weekend?", 48, "Resolves YES if >1mm falls Sat/Sun.")
    bet(m, "Ava", "YES", 150); bet(m, "Ben", "NO", 100); bet(m, "Cy", "YES", 80, anon=True)
    bet(m, "Dee", "NO", 120); bet(m, "Eve", "YES", 60); bet(m, "Finn", "NO", 40, anon=True)
    m = make_market(g1["id"], "Ava", "Will Ava finish the marathon under 4h?", 72)
    bet(m, "Ben", "YES", 90); bet(m, "Cy", "NO", 130); bet(m, "Gus", "YES", 50)
    # resolved YES
    mr = make_market(g1["id"], "Ava", "Did the Lakers win last night?", 0.0002)
    bet(mr, "Ava", "YES", 200); bet(mr, "Ben", "NO", 120); bet(mr, "Hana", "YES", 70)
    # scalar resolved (YES 65%)
    ms = make_market(g1["id"], "Ava", "Did the Chiefs cover the spread?", 0.0002)
    bet(ms, "Cy", "YES", 100); bet(ms, "Dee", "NO", 100); bet(ms, "Eve", "YES", 60)
    time.sleep(2.0)
    resolve(mr, "Ava", "YES")
    resolve(ms, "Ava", "SCALAR", pct=65)

    # ---- Group 2: Degens ----
    g2 = make_group("Ben", "Degens", ["Ben", "Cy", "Eve", "Finn"], dispute_hours=0)
    m = make_market(g2["id"], "Ben", "BTC above 100k by Friday?", 60)
    bet(m, "Ben", "YES", 200); bet(m, "Cy", "NO", 150, anon=True); bet(m, "Eve", "YES", 120); bet(m, "Finn", "NO", 90)
    mr = make_market(g2["id"], "Ben", "Will Finn ship the feature today?", 0.0002)
    bet(mr, "Cy", "NO", 110); bet(mr, "Eve", "YES", 80); bet(mr, "Finn", "YES", 140)
    time.sleep(2.0)
    resolve(mr, "Ben", "NO")

    # ---- Group 3: Office Pool ----
    g3 = make_group("Ava", "Office Pool", ["Ava", "Dee", "Gus", "Hana"], dispute_hours=12, credits="500")
    m = make_market(g3["id"], "Ava", "Return-to-office 5 days a week next quarter?", 96)
    bet(m, "Dee", "NO", 200); bet(m, "Gus", "NO", 150); bet(m, "Hana", "YES", 80); bet(m, "Ava", "YES", 60)

    print("groups: Test League (8), Degens (4), Office Pool (4)")
    print("markets: 8 (2 resolved, 1 scalar-resolved); ~30 bets incl. anonymous")

    lines = [
        "# PoolBet — Test Accounts", "",
        f"Server: {BASE}  ·  all passwords: `{PW}`", "",
        "| Name | Password | Notes |", "|------|----------|-------|",
    ]
    for u in USERS:
        note = "owner of Test League + Office Pool · **app admin**" if u == "Ava" else \
               "owner of Degens" if u == "Ben" else "member"
        lines.append(f"| {u} | {PW} | {note} |")
    lines += [
        "", "## Groups",
        f"- **Test League** — all 8 users · code `{g1['invite_code']}` · open + resolved markets",
        f"- **Degens** — Ben, Cy, Eve, Finn · code `{g2['invite_code']}`",
        f"- **Office Pool** — Ava, Dee, Gus, Hana · code `{g3['invite_code']}`",
        "", "Log in at the server URL with any name + the password.",
    ]
    with open("TEST_USERS.md", "w") as f:
        f.write("\n".join(lines) + "\n")
    print("wrote TEST_USERS.md")


if __name__ == "__main__":
    main()
