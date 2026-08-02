"""Live end-to-end demo against a running PoolBet server."""
import sys
from datetime import datetime, timedelta, timezone
from time import sleep

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
c = httpx.Client(base_url=BASE, timeout=10)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    import uuid
    suffix = uuid.uuid4().hex[:6]  # keep names unique across repeated demo runs
    alice = c.post("/auth/signup", json={"name": f"Alice-{suffix}", "password": "demo1234"}).json()
    bob = c.post("/auth/signup", json={"name": f"Bob-{suffix}", "password": "demo1234"}).json()
    print("✓ Created Alice & Bob")

    grp = c.post(
        "/groups",
        json={"name": "Fantasy Football Crew", "starting_credits": "1000", "dispute_window_hours": 0},
        headers=auth(alice["api_token"]),
    ).json()
    gid, code = grp["id"], grp["invite_code"]
    print(f"✓ Group '{grp['name']}' created — invite code: {code}")

    c.post("/groups/join", json={"invite_code": code}, headers=auth(bob["api_token"]))
    print("✓ Bob joined (both start with 1000 credits)")

    closes = (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat()
    mkt = c.post(
        f"/groups/{gid}/markets",
        json={"question": "Will the Chiefs cover the spread?", "closes_at": closes},
        headers=auth(alice["api_token"]),
    ).json()
    mid = mkt["id"]
    print(f"✓ Market proposed: '{mkt['question']}'")

    c.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "300"}, headers=auth(alice["api_token"]))
    pools = c.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "100"}, headers=auth(bob["api_token"])).json()
    print(f"✓ Bets: YES pool {pools['yes_pool']} | NO pool {pools['no_pool']} | implied P(YES)={pools['yes_prob']}")

    sleep(2.2)
    c.post(f"/markets/{mid}/resolve", json={"outcome": "YES"}, headers=auth(alice["api_token"]))
    settled = c.post(f"/markets/{mid}/settle", headers=auth(alice["api_token"])).json()
    print(f"✓ Resolved & settled: outcome={settled['outcome']}")

    print("\n  LEADERBOARD")
    board = c.get(f"/groups/{gid}/leaderboard", headers=auth(alice["api_token"])).json()
    for r in board:
        print(f"    {r['name']:8} {r['balance']:>10}")
    print("\n  (Alice: 1000 - 300 stake + 400 pot = 1100  |  Bob: 1000 - 100 = 900)")


if __name__ == "__main__":
    main()
