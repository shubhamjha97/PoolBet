"""Seed PoolBet with test users, groups, markets, and bets via the live API,
then dump credentials to TEST_USERS.md.

Run AFTER the schema is finalized and the server is restarted:
    ./.venv/bin/python scripts/seed_test_data.py
"""
import sys
from datetime import datetime, timedelta, timezone

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
PW = "test1234"
c = httpx.Client(base_url=BASE, timeout=15)


def h(t):
    return {"Authorization": f"Bearer {t}"}


def signup(name):
    r = c.post("/auth/signup", json={"name": name, "password": PW})
    r.raise_for_status()
    return r.json()


def main():
    # 4 test users
    names = ["Ava", "Ben", "Cy", "Dee"]
    users = {n: signup(n) for n in names}
    print("created users:", ", ".join(names))

    ava = users["Ava"]["api_token"]

    # Ava creates a group with a 0h dispute window (so markets can settle in-test)
    g = c.post("/groups", json={"name": "Test League", "starting_credits": "1000", "dispute_window_hours": 0},
               headers=h(ava)).json()
    gid, code = g["id"], g["invite_code"]
    for n in ["Ben", "Cy", "Dee"]:
        c.post("/groups/join", json={"invite_code": code}, headers=h(users[n]["api_token"]))
    print(f"group 'Test League' ({gid}) — code {code}, 4 members")

    def market(q, hrs, rules=None):
        body = {"question": q, "closes_at": (datetime.now(timezone.utc) + timedelta(hours=hrs)).isoformat()}
        if rules:
            body["rules"] = rules
        return c.post(f"/groups/{gid}/markets", json=body, headers=h(ava)).json()["id"]

    def bet(mid, tok, side, amt, anon=False):
        c.post(f"/markets/{mid}/bets", json={"side": side, "amount": str(amt), "anonymous": anon}, headers=h(tok))

    # An open market with a spread of bets (some anonymous)
    m1 = market("Will it rain this weekend?", 48, rules="Resolves YES if >1mm falls at the city gauge Sat/Sun.")
    bet(m1, ava, "YES", 150)
    bet(m1, users["Ben"]["api_token"], "NO", 100)
    bet(m1, users["Cy"]["api_token"], "YES", 80, anon=True)
    bet(m1, users["Dee"]["api_token"], "NO", 120)

    # A second open market
    m2 = market("Will Ava finish the marathon under 4h?", 72)
    bet(m2, users["Ben"]["api_token"], "YES", 60)
    bet(m2, users["Cy"]["api_token"], "NO", 90)

    # A short market we resolve + settle so Stats/timeline have a completed event
    m3 = market("Did the Lakers win last night?", 0.001)
    bet(m3, ava, "YES", 200)
    bet(m3, users["Ben"]["api_token"], "NO", 120)
    import time; time.sleep(1.2)
    c.post(f"/markets/{m3}/resolve", json={"outcome": "YES"}, headers=h(ava))
    c.post(f"/markets/{m3}/settle", headers=h(ava))
    print("created 3 markets (1 resolved), placed 8 bets")

    # Dump credentials
    lines = [
        "# PoolBet — Test Accounts",
        "",
        f"Server: {BASE}",
        f"All passwords: `{PW}`",
        "",
        "| Name | Password | Role |",
        "|------|----------|------|",
    ]
    for n in names:
        role = "owner / admin*" if n == "Ava" else "member"
        lines.append(f"| {n} | {PW} | {role} |")
    lines += [
        "",
        f"**Group:** Test League — invite code **{code}**",
        "",
        "*Ava is the group owner. To make her an app admin (for the rollback dashboard),",
        "set env `POOLBET_ADMIN_NAMES=Ava` before starting the server, or the first-ever",
        "user is admin by default.*",
        "",
        "Log in at the server URL with any name above + the password.",
    ]
    with open("TEST_USERS.md", "w") as f:
        f.write("\n".join(lines) + "\n")
    print("wrote TEST_USERS.md")


if __name__ == "__main__":
    main()
