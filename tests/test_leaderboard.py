"""Tests for the group leaderboard (P&L ranking, win/loss records, badges).

The leaderboard router is exercised through its own mounted app so the test is
independent of how app.main wires the include (the old balance-only route may
still be registered there). Both clients share the same SQLite file via get_db,
so data seeded through the main app is visible to the leaderboard app.
"""
import time
from datetime import timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app
from app.models import utcnow
from app.routers import leaderboard as lb

client = TestClient(app)

_lb_app = FastAPI()
_lb_app.include_router(lb.router)
lb_client = TestClient(_lb_app)


def _user(name):
    r = client.post("/auth/signup", json={"name": name, "password": "hunter2"})
    assert r.status_code == 201, r.text
    return r.json()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_leaderboard_ranks_winner_first_with_record_and_badges():
    alice = _user("BoardAlice")
    bob = _user("BoardBob")
    g = client.post(
        "/groups",
        json={"name": "BoardCrew", "starting_credits": "1000", "dispute_window_hours": 0},
        headers=_auth(alice["api_token"]),
    ).json()
    client.post("/groups/join", json={"invite_code": g["invite_code"]}, headers=_auth(bob["api_token"]))

    # Opposing bets: Alice 200 YES vs Bob 100 NO, pot 300; YES wins.
    closes = (utcnow() + timedelta(seconds=1)).isoformat()
    mid = client.post(
        f"/groups/{g['id']}/markets",
        json={"question": "Board?", "closes_at": closes},
        headers=_auth(alice["api_token"]),
    ).json()["id"]
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "200"}, headers=_auth(alice["api_token"]))
    client.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "100"}, headers=_auth(bob["api_token"]))
    time.sleep(1.1)
    client.post(f"/markets/{mid}/resolve", json={"outcome": "YES"}, headers=_auth(alice["api_token"]))
    r = client.post(f"/markets/{mid}/settle", headers=_auth(alice["api_token"]))
    assert r.status_code == 200, r.text

    r = lb_client.get(f"/groups/{g['id']}/leaderboard", headers=_auth(alice["api_token"]))
    assert r.status_code == 200, r.text
    board = r.json()

    # Winner ranks first with a positive P&L and a win on the record.
    assert board[0]["name"] == "BoardAlice"
    assert board[0]["pnl"] > 0
    assert board[0]["wins"] >= 1
    assert board[0]["balance"] == "1100.00"
    assert board[0]["streak"] >= 1
    assert "leader" in board[0]["badges"]

    # Loser is booked a loss and a negative P&L.
    loser = next(e for e in board if e["name"] == "BoardBob")
    assert loser["losses"] >= 1
    assert loser["pnl"] < 0
    # ROI reflects pnl / total granted (loser staked/lost 100 of a 1000 grant).
    assert loser["roi"] < 0


def test_leaderboard_rejects_non_member_and_missing_group():
    alice = _user("BoardOwner")
    g = client.post(
        "/groups",
        json={"name": "PrivateCrew", "starting_credits": "1000"},
        headers=_auth(alice["api_token"]),
    ).json()

    outsider = _user("BoardOutsider")
    assert lb_client.get(f"/groups/{g['id']}/leaderboard", headers=_auth(outsider["api_token"])).status_code == 403
    assert lb_client.get("/groups/does-not-exist/leaderboard", headers=_auth(alice["api_token"])).status_code == 404
