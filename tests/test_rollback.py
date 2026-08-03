"""Rigorous coverage for the snapshot chain + rollback.

Rollback restores the whole domain state (balances, bets, market status, the
event log) from a snapshot, then appends a 'rollback' event. These tests pin
down exact restoration, resolution-undo, idempotency, and auth.
"""
import os
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.database import SessionLocal
from app.main import app
from app.models import Bet, utcnow
from app.snapshots import rollback_to, snapshot_state

client = TestClient(app)


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


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
    return u


def _group(tok, **kw):
    body = {"name": "RB", "starting_credits": "1000", "dispute_window_hours": 0, **kw}
    return client.post("/groups", json=body, headers=_auth(tok)).json()


def _balances(gid, tok):
    board = client.get(f"/groups/{gid}/leaderboard", headers=_auth(tok)).json()
    return {e["name"]: e["balance"] for e in board}


def _latest_snapshot(tok):
    return client.get("/admin/snapshots", headers=_auth(tok)).json()[0]["id"]


def _market(gid, tok, hours=1.0):
    closes = (utcnow() + timedelta(hours=hours)).isoformat()
    return client.post(f"/groups/{gid}/markets", json={"question": "RB?", "closes_at": closes},
                       headers=_auth(tok)).json()["id"]


# ---------------- integration (via the API) ----------------
def test_rollback_restores_balances_and_bets_exactly():
    admin = _admin("RbA1")
    other = _user("RbB1")
    g = _group(admin["api_token"])
    client.post("/groups/join", json={"invite_code": g["invite_code"]}, headers=_auth(other["api_token"]))
    mid = _market(g["id"], admin["api_token"])

    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "100"}, headers=_auth(admin["api_token"]))
    early_balances = _balances(g["id"], admin["api_token"])
    early_snap = _latest_snapshot(admin["api_token"])  # snapshot right after that single bet

    # Mutate further.
    client.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "200"}, headers=_auth(other["api_token"]))
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "50"}, headers=_auth(admin["api_token"]))
    assert len(client.get(f"/markets/{mid}", headers=_auth(admin["api_token"])).json()["bets"]) == 3

    r = client.post("/admin/rollback", json={"snapshot_id": early_snap}, headers=_auth(admin["api_token"]))
    assert r.status_code == 200, r.text

    # Exact restoration — balances and bet count match the early state.
    assert _balances(g["id"], admin["api_token"]) == early_balances
    assert len(client.get(f"/markets/{mid}", headers=_auth(admin["api_token"])).json()["bets"]) == 1


def test_rollback_undoes_a_market_resolution():
    admin = _admin("RbA2")
    other = _user("RbB2")
    g = _group(admin["api_token"])
    client.post("/groups/join", json={"invite_code": g["invite_code"]}, headers=_auth(other["api_token"]))
    # Short window so we can resolve it.
    closes = (utcnow() + timedelta(seconds=1)).isoformat()
    mid = client.post(f"/groups/{g['id']}/markets", json={"question": "Res?", "closes_at": closes},
                      headers=_auth(admin["api_token"])).json()["id"]
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "300"}, headers=_auth(admin["api_token"]))
    client.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "100"}, headers=_auth(other["api_token"]))

    pre_balances = _balances(g["id"], admin["api_token"])
    pre_snap = _latest_snapshot(admin["api_token"])

    import time
    time.sleep(1.1)
    client.post(f"/markets/{mid}/resolve", json={"outcome": "YES"}, headers=_auth(admin["api_token"]))
    client.post(f"/markets/{mid}/settle", headers=_auth(admin["api_token"]))
    assert client.get(f"/markets/{mid}", headers=_auth(admin["api_token"])).json()["status"] == "RESOLVED"

    client.post("/admin/rollback", json={"snapshot_id": pre_snap}, headers=_auth(admin["api_token"]))
    m = client.get(f"/markets/{mid}", headers=_auth(admin["api_token"])).json()
    assert m["status"] == "OPEN"                                    # resolution undone
    assert _balances(g["id"], admin["api_token"]) == pre_balances   # payouts reverted


def test_double_rollback_to_same_snapshot_is_stable():
    admin = _admin("RbA3")
    g = _group(admin["api_token"])
    mid = _market(g["id"], admin["api_token"])
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "100"}, headers=_auth(admin["api_token"]))
    snap = _latest_snapshot(admin["api_token"])

    client.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "40"}, headers=_auth(admin["api_token"]))
    first = client.post("/admin/rollback", json={"snapshot_id": snap}, headers=_auth(admin["api_token"]))
    state1 = _balances(g["id"], admin["api_token"])
    second = client.post("/admin/rollback", json={"snapshot_id": snap}, headers=_auth(admin["api_token"]))
    state2 = _balances(g["id"], admin["api_token"])
    assert first.status_code == 200 and second.status_code == 200
    assert state1 == state2  # idempotent


def test_rollback_appends_a_rollback_event():
    admin = _admin("RbA4")
    g = _group(admin["api_token"])
    mid = _market(g["id"], admin["api_token"])
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "100"}, headers=_auth(admin["api_token"]))
    snap = _latest_snapshot(admin["api_token"])
    client.post("/admin/rollback", json={"snapshot_id": snap}, headers=_auth(admin["api_token"]))
    events = client.get("/admin/events?limit=5", headers=_auth(admin["api_token"])).json()
    assert events[0]["type"] == "rollback"


def test_rollback_nonexistent_snapshot_404():
    admin = _admin("RbA5")
    r = client.post("/admin/rollback", json={"snapshot_id": "does-not-exist"}, headers=_auth(admin["api_token"]))
    assert r.status_code == 404


def test_rollback_requires_admin():
    admin = _admin("RbA6")
    g = _group(admin["api_token"])
    mid = _market(g["id"], admin["api_token"])
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "100"}, headers=_auth(admin["api_token"]))
    snap = _latest_snapshot(admin["api_token"])
    nonadmin = _user("RbNot6")
    r = client.post("/admin/rollback", json={"snapshot_id": snap}, headers=_auth(nonadmin["api_token"]))
    assert r.status_code == 403


# ---------------- unit (snapshot_state / rollback_to directly) ----------------
def test_snapshot_and_rollback_roundtrip_unit():
    admin = _admin("RbU7")
    g = _group(admin["api_token"])
    mid = _market(g["id"], admin["api_token"])
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "100"}, headers=_auth(admin["api_token"]))

    with SessionLocal() as db:
        snap = snapshot_state(db, label="unit-test")
        db.commit()
        snap_id = snap.id
        bets_before = db.scalar(select(func.count()).select_from(Bet))

    # Add another bet through the API (mutates the shared DB).
    client.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "50"}, headers=_auth(admin["api_token"]))

    with SessionLocal() as db:
        restored = rollback_to(db, snap_id)
        db.commit()
        bets_after = db.scalar(select(func.count()).select_from(Bet))

    assert restored["bets"] == bets_before
    assert bets_after == bets_before  # the extra bet was rewound
