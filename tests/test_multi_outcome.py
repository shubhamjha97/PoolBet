"""Multiple-choice (N-way) markets: create, bet on a label, resolve a winner."""
import time
from datetime import timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.models import utcnow

client = TestClient(app)


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def _user(name):
    return client.post("/auth/signup", json={"name": name, "password": "hunter2"}).json()


def _group(tok):
    return client.post("/groups", json={"name": "MC", "starting_credits": "1000", "dispute_window_hours": 0},
                       headers=_auth(tok)).json()


def _balances(gid, tok):
    return {e["name"]: float(e["balance"]) for e in
            client.get(f"/groups/{gid}/leaderboard", headers=_auth(tok)).json()}


def test_multi_outcome_create_bet_resolve_and_settle():
    a, b, c = _user("McA"), _user("McB"), _user("McC")
    g = _group(a["api_token"])
    for u in (b, c):
        client.post("/groups/join", json={"invite_code": g["invite_code"]}, headers=_auth(u["api_token"]))

    closes = (utcnow() + timedelta(seconds=1)).isoformat()
    r = client.post(f"/groups/{g['id']}/markets", json={
        "question": "Who drives first?", "closes_at": closes,
        "outcomes": ["Alice", "Bob", "Carol"],
    }, headers=_auth(a["api_token"]))
    assert r.status_code == 201, r.text
    m = r.json()
    assert m["outcomes"] == ["Alice", "Bob", "Carol"]
    assert [o["label"] for o in m["outcome_pools"]] == ["Alice", "Bob", "Carol"]
    mid = m["id"]

    client.post(f"/markets/{mid}/bets", json={"outcome": "Alice", "amount": "300"}, headers=_auth(a["api_token"]))
    client.post(f"/markets/{mid}/bets", json={"outcome": "Bob", "amount": "200"}, headers=_auth(b["api_token"]))
    client.post(f"/markets/{mid}/bets", json={"outcome": "Carol", "amount": "100"}, headers=_auth(c["api_token"]))

    # A label you can't pick is rejected.
    assert client.post(f"/markets/{mid}/bets", json={"outcome": "Dave", "amount": "10"},
                       headers=_auth(a["api_token"])).status_code == 422

    pools = {o["label"]: float(o["pool"]) for o in client.get(f"/markets/{mid}", headers=_auth(a["api_token"])).json()["outcome_pools"]}
    assert pools == {"Alice": 300.0, "Bob": 200.0, "Carol": 100.0}

    time.sleep(1.1)
    # An invalid winning label is rejected.
    assert client.post(f"/markets/{mid}/resolve", json={"outcome": "Nobody"},
                       headers=_auth(a["api_token"])).status_code == 422
    assert client.post(f"/markets/{mid}/resolve", json={"outcome": "Alice"},
                       headers=_auth(a["api_token"])).status_code == 200
    client.post(f"/markets/{mid}/settle", headers=_auth(a["api_token"]))

    final = client.get(f"/markets/{mid}", headers=_auth(a["api_token"])).json()
    assert final["status"] == "RESOLVED" and final["outcome"] == "Alice"
    payout = {bt["outcome"]: (float(bt["payout"]) if bt["payout"] is not None else 0.0) for bt in final["bets"]}
    assert payout["Alice"] == 600.0   # sole Alice backer takes the whole 600 pot
    assert payout["Bob"] == 0.0 and payout["Carol"] == 0.0

    bal = _balances(g["id"], a["api_token"])
    assert bal["McA"] == 1300.0 and bal["McB"] == 800.0 and bal["McC"] == 900.0


def test_binary_market_still_requires_a_side():
    a = _user("BinA")
    g = _group(a["api_token"])
    closes = (utcnow() + timedelta(hours=1)).isoformat()
    mid = client.post(f"/groups/{g['id']}/markets", json={"question": "Rain?", "closes_at": closes},
                      headers=_auth(a["api_token"])).json()["id"]
    # Binary market: an `outcome` label is not accepted, a side is required.
    assert client.post(f"/markets/{mid}/bets", json={"outcome": "Whatever", "amount": "10"},
                       headers=_auth(a["api_token"])).status_code == 422
    assert client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "10"},
                       headers=_auth(a["api_token"])).status_code == 201
