"""Tests for house rake, admin metrics, and Splitwise-style settlement."""
import os
import time
from datetime import timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.models import utcnow
from app.settlement import min_transfers

client = TestClient(app)


def _user(name):
    r = client.post("/auth/signup", json={"name": name, "password": "hunter2"})
    assert r.status_code == 201, r.text
    return r.json()


def _admin(name):
    os.environ["POOLBET_ADMIN_NAMES"] = name
    try:
        u = _user(name)
    finally:
        os.environ.pop("POOLBET_ADMIN_NAMES", None)
    assert client.get("/admin/me", headers=_auth(u["api_token"])).json()["is_admin"] is True
    return u


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- unit: min_transfers ----------------
def test_min_transfers_settles_everyone():
    # a is owed 30, b is owed 10, c owes 40.
    nets = {"a": 30.0, "b": 10.0, "c": -40.0}
    transfers = min_transfers(nets)
    # c pays everyone off -> exactly 2 transfers.
    assert len(transfers) == 2
    # Apply the transfers and confirm every net lands at ~0.
    bal = dict(nets)
    for frm, to, amt in transfers:
        assert amt > 0
        bal[frm] += amt
        bal[to] -= amt
    assert all(abs(v) < 0.01 for v in bal.values())
    # All transfers flow out of the sole debtor.
    assert {t[0] for t in transfers} == {"c"}


def test_min_transfers_empty_when_settled():
    assert min_transfers({"a": 0.0, "b": 0.0}) == []


# ---------------- house rake ----------------
def test_house_rake_reduces_payout_and_records_event():
    admin = _admin("RakeAdmin")
    alice = _user("RakeAlice")
    bob = _user("RakeBob")

    # Non-admin is refused both settings endpoints.
    assert client.get("/admin/settings", headers=_auth(alice["api_token"])).status_code == 403
    assert client.post("/admin/settings", json={"house_rake": 0.01},
                       headers=_auth(alice["api_token"])).status_code == 403

    # Default is 0.0.
    assert client.get("/admin/settings", headers=_auth(admin["api_token"])).json()["house_rake"] == 0.0

    # Set the max 5% rake; over-cap is rejected.
    assert client.post("/admin/settings", json={"house_rake": 0.5},
                       headers=_auth(admin["api_token"])).status_code == 422
    r = client.post("/admin/settings", json={"house_rake": 0.05}, headers=_auth(admin["api_token"]))
    assert r.status_code == 200 and r.json()["house_rake"] == 0.05

    # Alice(200 YES) vs Bob(100 NO), pot 300, YES wins. With 5% rake the house
    # takes 15, so Alice collects 285 -> balance 1000-200+285 = 1085.
    r = client.post("/groups", json={"name": "RakeCrew", "starting_credits": "1000",
                                     "dispute_window_hours": 0}, headers=_auth(alice["api_token"]))
    group = r.json()
    client.post("/groups/join", json={"invite_code": group["invite_code"]}, headers=_auth(bob["api_token"]))
    closes = (utcnow() + timedelta(seconds=1)).isoformat()
    mid = client.post(f"/groups/{group['id']}/markets",
                      json={"question": "Rake?", "closes_at": closes},
                      headers=_auth(alice["api_token"])).json()["id"]
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "200"}, headers=_auth(alice["api_token"]))
    client.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "100"}, headers=_auth(bob["api_token"]))
    time.sleep(1.1)
    client.post(f"/markets/{mid}/resolve", json={"outcome": "YES"}, headers=_auth(alice["api_token"]))
    r = client.post(f"/markets/{mid}/settle", headers=_auth(alice["api_token"]))
    assert r.status_code == 200, r.text

    board = {row["name"]: row["balance"] for row in
             client.get(f"/groups/{group['id']}/leaderboard", headers=_auth(alice["api_token"])).json()}
    assert board["RakeAlice"] == "1085.00"   # 15 credits less than the no-rake 1100
    assert board["RakeBob"] == "900.00"

    # A house_rake event was recorded, and metrics rolls it into house_earnings.
    tl = client.get(f"/groups/{group['id']}/timeline", headers=_auth(alice["api_token"])).json()
    rake_events = [e for e in tl if e["type"] == "house_rake"]
    assert rake_events and rake_events[0]["payload"]["amount"] == "15.00"

    metrics = client.get("/admin/metrics", headers=_auth(admin["api_token"])).json()
    assert float(metrics["house_earnings"]) >= 15.0

    # Reset so other tests aren't affected by the global rake.
    client.post("/admin/settings", json={"house_rake": 0.0}, headers=_auth(admin["api_token"]))


# ---------------- admin metrics ----------------
def test_admin_metrics_sane_counts():
    admin = _admin("MetricAdmin")
    alice = _user("MetricAlice")
    bob = _user("MetricBob")

    # Non-admin gets 403.
    assert client.get("/admin/metrics", headers=_auth(alice["api_token"])).status_code == 403

    # Telemetry the metrics summarize.
    client.post("/events", json={"type": "app_open"}, headers=_auth(alice["api_token"]))
    client.post("/events", json={"type": "session_ping", "payload": {"seconds": 30}},
                headers=_auth(alice["api_token"]))

    g = client.post("/groups", json={"name": "MetricCrew", "starting_credits": "1000"},
                    headers=_auth(alice["api_token"])).json()
    client.post("/groups/join", json={"invite_code": g["invite_code"]}, headers=_auth(bob["api_token"]))
    closes = (utcnow() + timedelta(hours=1)).isoformat()
    mid = client.post(f"/groups/{g['id']}/markets",
                      json={"question": "Metric?", "closes_at": closes},
                      headers=_auth(alice["api_token"])).json()["id"]
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "100"}, headers=_auth(alice["api_token"]))
    client.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "40"}, headers=_auth(bob["api_token"]))

    m = client.get("/admin/metrics", headers=_auth(admin["api_token"])).json()
    assert m["users"] >= 3
    assert m["groups"] >= 1
    assert m["markets"] >= 1
    assert m["bets"] >= 2
    assert m["app_opens"] >= 1
    assert m["session_seconds"] >= 30
    assert m["active_users_7d"] >= 2
    assert float(m["total_volume"]) >= 140.0
    assert isinstance(m["house_earnings"], str)
    assert len(m["events_per_day"]) == 14
    assert len(m["bets_per_day"]) == 14
    assert all("day" in d and "count" in d for d in m["events_per_day"])
    # The most recent bets_per_day bucket (today) reflects the bets just placed.
    assert sum(d["count"] for d in m["bets_per_day"]) >= 2


# ---------------- settlement endpoint ----------------
def test_group_settlement_nets_sum_to_zero_and_transfers_settle():
    alice = _user("SettleAlice")
    bob = _user("SettleBob")
    carol = _user("SettleCarol")
    g = client.post("/groups", json={"name": "SettleCrew", "starting_credits": "1000",
                                     "dispute_window_hours": 0}, headers=_auth(alice["api_token"])).json()
    client.post("/groups/join", json={"invite_code": g["invite_code"]}, headers=_auth(bob["api_token"]))
    client.post("/groups/join", json={"invite_code": g["invite_code"]}, headers=_auth(carol["api_token"]))

    # Alice(300 YES) vs Bob+Carol(100+100 NO); YES wins so Alice takes the pot.
    closes = (utcnow() + timedelta(seconds=1)).isoformat()
    mid = client.post(f"/groups/{g['id']}/markets",
                      json={"question": "Settle?", "closes_at": closes},
                      headers=_auth(alice["api_token"])).json()["id"]
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "300"}, headers=_auth(alice["api_token"]))
    client.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "100"}, headers=_auth(bob["api_token"]))
    client.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "100"}, headers=_auth(carol["api_token"]))
    time.sleep(1.1)
    client.post(f"/markets/{mid}/resolve", json={"outcome": "YES"}, headers=_auth(alice["api_token"]))
    client.post(f"/markets/{mid}/settle", headers=_auth(alice["api_token"]))

    r = client.get(f"/groups/{g['id']}/settlement", headers=_auth(alice["api_token"]))
    assert r.status_code == 200, r.text
    body = r.json()

    # Nets sum to ~0 (credits conserved).
    assert abs(sum(n["net"] for n in body["net"])) < 0.01
    nets = {n["name"]: n["net"] for n in body["net"]}
    assert nets["SettleAlice"] > 0        # Alice won -> creditor
    assert nets["SettleBob"] < 0 and nets["SettleCarol"] < 0

    # Applying the transfers zeroes everyone out.
    bal = {n["user_id"]: n["net"] for n in body["net"]}
    for t in body["transfers"]:
        assert t["amount"] > 0
        bal[t["from_user_id"]] += t["amount"]
        bal[t["to_user_id"]] -= t["amount"]
    assert all(abs(v) < 0.01 for v in bal.values())

    # Non-member is refused.
    outsider = _user("SettleOutsider")
    assert client.get(f"/groups/{g['id']}/settlement", headers=_auth(outsider["api_token"])).status_code == 403


def test_open_bets_are_not_counted_as_losses():
    """Stake locked in an unresolved market must be added back, so nobody owes
    anything until the market actually resolves."""
    alice = _user("OpenAlice")
    bob = _user("OpenBob")
    g = client.post("/groups", json={"name": "OpenCrew", "starting_credits": "1000"},
                    headers=_auth(alice["api_token"])).json()
    client.post("/groups/join", json={"invite_code": g["invite_code"]}, headers=_auth(bob["api_token"]))

    closes = (utcnow() + timedelta(days=1)).isoformat()  # stays OPEN
    mid = client.post(f"/groups/{g['id']}/markets", json={"question": "Open?", "closes_at": closes},
                      headers=_auth(alice["api_token"])).json()["id"]
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "250"}, headers=_auth(alice["api_token"]))
    client.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "400"}, headers=_auth(bob["api_token"]))

    body = client.get(f"/groups/{g['id']}/settlement", headers=_auth(alice["api_token"])).json()
    nets = {n["name"]: n["net"] for n in body["net"]}
    assert abs(nets["OpenAlice"]) < 0.01 and abs(nets["OpenBob"]) < 0.01  # stake at risk, not lost
    assert body["transfers"] == []
