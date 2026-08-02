"""End-to-end flow: two friends pool credits, bet against each other, settle."""
from datetime import timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.models import utcnow

client = TestClient(app)


def _user(name):
    r = client.post("/auth/signup", json={"name": name, "password": "hunter2"})
    assert r.status_code == 201, r.text
    return r.json()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_full_market_lifecycle():
    alice = _user("Alice")
    bob = _user("Bob")

    # Alice creates a group with a short dispute window so we can settle in-test.
    r = client.post(
        "/groups",
        json={"name": "Roommates", "starting_credits": "1000", "dispute_window_hours": 0},
        headers=_auth(alice["api_token"]),
    )
    assert r.status_code == 201, r.text
    group = r.json()
    assert len(group["members"]) == 1
    assert group["members"][0]["balance"] == "1000.00"

    # Bob joins via invite code.
    r = client.post(
        "/groups/join",
        json={"invite_code": group["invite_code"]},
        headers=_auth(bob["api_token"]),
    )
    assert r.status_code == 200, r.text

    # Alice proposes a market closing 1s from now.
    closes = (utcnow() + timedelta(seconds=1)).isoformat()
    r = client.post(
        f"/groups/{group['id']}/markets",
        json={"question": "Will it rain tomorrow?", "closes_at": closes},
        headers=_auth(alice["api_token"]),
    )
    assert r.status_code == 201, r.text
    market = r.json()
    mid = market["id"]

    # Alice bets 200 YES, Bob bets 100 NO.
    r = client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "200"},
                    headers=_auth(alice["api_token"]))
    assert r.status_code == 201, r.text
    r = client.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "100"},
                    headers=_auth(bob["api_token"]))
    assert r.status_code == 201, r.text

    m = r.json()
    assert m["yes_pool"] == "200.00" and m["no_pool"] == "100.00"
    assert m["yes_prob"] == "0.6667"

    # Wait for close, then Alice resolves YES.
    import time
    time.sleep(1.1)
    r = client.post(f"/markets/{mid}/resolve", json={"outcome": "YES"},
                    headers=_auth(alice["api_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "RESOLVING"

    # Dispute window is 0h -> settle immediately.
    r = client.post(f"/markets/{mid}/settle", headers=_auth(alice["api_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["outcome"] == "YES"

    # Leaderboard: Alice won the pot. Started 1000, staked 200, won 300 -> 1100.
    r = client.get(f"/groups/{group['id']}/leaderboard", headers=_auth(alice["api_token"]))
    board = {row["name"]: row["balance"] for row in r.json()}
    assert board["Alice"] == "1100.00"
    assert board["Bob"] == "900.00"


def test_proposer_can_force_settle_but_others_wait():
    alice = _user("EarlyAlice")
    bob = _user("EarlyBob")
    # 12h dispute window — normally a long wait.
    r = client.post("/groups", json={"name": "EarlyCrew", "starting_credits": "1000", "dispute_window_hours": 12},
                    headers=_auth(alice["api_token"]))
    group = r.json()
    client.post("/groups/join", json={"invite_code": group["invite_code"]}, headers=_auth(bob["api_token"]))

    closes = (utcnow() + timedelta(seconds=1)).isoformat()
    mid = client.post(f"/groups/{group['id']}/markets",
                      json={"question": "Force settle?", "closes_at": closes},
                      headers=_auth(alice["api_token"])).json()["id"]
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "100"}, headers=_auth(alice["api_token"]))
    client.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "100"}, headers=_auth(bob["api_token"]))
    import time; time.sleep(1.1)
    client.post(f"/markets/{mid}/resolve", json={"outcome": "YES"}, headers=_auth(alice["api_token"]))

    # Non-proposer cannot settle while the window is open.
    assert client.post(f"/markets/{mid}/settle", headers=_auth(bob["api_token"])).status_code == 409
    # Proposer can force-settle immediately.
    r = client.post(f"/markets/{mid}/settle", headers=_auth(alice["api_token"]))
    assert r.status_code == 200 and r.json()["outcome"] == "YES"


def test_cannot_bet_more_than_balance():
    u = _user("Broke")
    r = client.post("/groups", json={"name": "Solo", "starting_credits": "50"},
                    headers=_auth(u["api_token"]))
    gid = r.json()["id"]
    closes = (utcnow() + timedelta(hours=1)).isoformat()
    r = client.post(f"/groups/{gid}/markets",
                    json={"question": "Will I be rich?", "closes_at": closes},
                    headers=_auth(u["api_token"]))
    mid = r.json()["id"]
    r = client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "500"},
                    headers=_auth(u["api_token"]))
    assert r.status_code == 422


def test_login_returns_same_account_and_rejects_duplicates():
    # Signing up claims a unique name.
    r = client.post("/auth/signup", json={"name": "Persistent Pat", "password": "s3cret"})
    assert r.status_code == 201
    token = r.json()["api_token"]

    # Same name again is rejected, not silently duplicated.
    r = client.post("/auth/signup", json={"name": "Persistent Pat", "password": "other"})
    assert r.status_code == 409

    # Logging in with name + password returns the SAME account (same token).
    r = client.post("/auth/login", json={"name": "Persistent Pat", "password": "s3cret"})
    assert r.status_code == 200
    assert r.json()["api_token"] == token

    # Wrong password is rejected.
    r = client.post("/auth/login", json={"name": "Persistent Pat", "password": "nope"})
    assert r.status_code == 401


def test_non_member_cannot_view_group():
    owner = _user("Owner")
    outsider = _user("Outsider")
    r = client.post("/groups", json={"name": "Private"}, headers=_auth(owner["api_token"]))
    gid = r.json()["id"]
    r = client.get(f"/groups/{gid}", headers=_auth(outsider["api_token"]))
    assert r.status_code == 403


def test_anonymous_bet_hides_real_name_but_is_stable():
    alice = _user("AnonAlice")
    r = client.post(
        "/groups",
        json={"name": "AnonCrew", "starting_credits": "1000"},
        headers=_auth(alice["api_token"]),
    )
    group = r.json()
    gid = group["id"]

    closes = (utcnow() + timedelta(hours=1)).isoformat()
    mid = client.post(
        f"/groups/{gid}/markets",
        json={"question": "Anon?", "closes_at": closes},
        headers=_auth(alice["api_token"]),
    ).json()["id"]

    # First anonymous bet -> gets a random nickname.
    r = client.post(
        f"/markets/{mid}/bets",
        json={"side": "YES", "amount": "100", "anonymous": True},
        headers=_auth(alice["api_token"]),
    )
    assert r.status_code == 201, r.text
    bets = r.json()["bets"]
    assert len(bets) == 1
    nick = bets[0]["member_name"]
    assert nick != "AnonAlice"           # real name hidden
    assert bets[0]["is_anonymous"] is True
    assert "created_at" in bets[0]

    # Second anonymous bet by the same member reuses the SAME nickname.
    r = client.post(
        f"/markets/{mid}/bets",
        json={"side": "NO", "amount": "50", "anonymous": True},
        headers=_auth(alice["api_token"]),
    )
    nicks = {b["member_name"] for b in r.json()["bets"]}
    assert nicks == {nick}

    # A non-anonymous bet shows the real name.
    r = client.post(
        f"/markets/{mid}/bets",
        json={"side": "YES", "amount": "10"},
        headers=_auth(alice["api_token"]),
    )
    names = {b["member_name"] for b in r.json()["bets"]}
    assert "AnonAlice" in names and nick in names


def test_pnl_series_ends_at_current_balance():
    alice = _user("PnlAlice")
    bob = _user("PnlBob")
    r = client.post(
        "/groups",
        json={"name": "PnlCrew", "starting_credits": "1000", "dispute_window_hours": 0},
        headers=_auth(alice["api_token"]),
    )
    group = r.json()
    gid = group["id"]
    client.post("/groups/join", json={"invite_code": group["invite_code"]}, headers=_auth(bob["api_token"]))

    closes = (utcnow() + timedelta(seconds=1)).isoformat()
    mid = client.post(
        f"/groups/{gid}/markets",
        json={"question": "Pnl?", "closes_at": closes},
        headers=_auth(alice["api_token"]),
    ).json()["id"]
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "200"}, headers=_auth(alice["api_token"]))
    client.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "100"}, headers=_auth(bob["api_token"]))

    import time; time.sleep(1.1)
    client.post(f"/markets/{mid}/resolve", json={"outcome": "YES"}, headers=_auth(alice["api_token"]))
    client.post(f"/markets/{mid}/settle", headers=_auth(alice["api_token"]))

    # Current balances from the leaderboard.
    board = {row["name"]: float(row["balance"]) for row in
             client.get(f"/groups/{gid}/leaderboard", headers=_auth(alice["api_token"])).json()}

    r = client.get(f"/groups/{gid}/pnl", headers=_auth(alice["api_token"]))
    assert r.status_code == 200, r.text
    pnl = {s["name"]: s for s in r.json()}
    # Each series starts at the GRANT and ends at the member's current balance.
    assert pnl["PnlAlice"]["series"][0]["balance"] == 1000.0
    assert pnl["PnlAlice"]["series"][-1]["balance"] == board["PnlAlice"]
    assert pnl["PnlBob"]["series"][-1]["balance"] == board["PnlBob"]


def test_access_request_flow():
    owner = _user("GateOwner")
    stranger = _user("GateStranger")
    r = client.post(
        "/groups",
        json={"name": "Gated", "starting_credits": "500"},
        headers=_auth(owner["api_token"]),
    )
    gid = r.json()["id"]

    # Preview is visible to a non-member.
    r = client.get(f"/groups/{gid}/preview", headers=_auth(stranger["api_token"]))
    assert r.status_code == 200
    assert r.json()["member_count"] == 1

    # Stranger requests access.
    r = client.post(f"/groups/{gid}/access-requests", headers=_auth(stranger["api_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "PENDING"

    # Duplicate request returns the same PENDING request (idempotent).
    r2 = client.post(f"/groups/{gid}/access-requests", headers=_auth(stranger["api_token"]))
    assert r2.status_code == 200 and r2.json()["id"] == r.json()["id"]

    # Non-creator cannot list requests.
    assert client.get(f"/groups/{gid}/access-requests", headers=_auth(stranger["api_token"])).status_code == 403

    # Creator lists the pending request.
    reqs = client.get(f"/groups/{gid}/access-requests", headers=_auth(owner["api_token"])).json()
    assert len(reqs) == 1 and reqs[0]["name"] == "GateStranger"
    req_id = reqs[0]["id"]

    # Creator approves -> stranger becomes a member with starting credits.
    r = client.post(
        f"/groups/{gid}/access-requests/{req_id}/approve",
        headers=_auth(owner["api_token"]),
    )
    assert r.status_code == 200, r.text
    names = {m["name"]: m for m in r.json()["members"]}
    assert "GateStranger" in names
    assert names["GateStranger"]["balance"] == "500.00"

    # Stranger can now view the group.
    assert client.get(f"/groups/{gid}", headers=_auth(stranger["api_token"])).status_code == 200

    # And their P&L series opens with the GRANT.
    pnl = {s["name"]: s for s in client.get(f"/groups/{gid}/pnl", headers=_auth(owner["api_token"])).json()}
    assert pnl["GateStranger"]["series"][0]["balance"] == 500.0
