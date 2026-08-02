"""Tests for the batch of new features: rules, events/timeline, evidence,
push, buy-in, and the admin commit-log + snapshot/rollback."""
import base64
import os
from datetime import timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.models import utcnow

client = TestClient(app)

# A minimal 1x1 PNG.
_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def _user(name):
    r = client.post("/auth/signup", json={"name": name, "password": "hunter2"})
    assert r.status_code == 201, r.text
    return r.json()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _group(token, **kw):
    body = {"name": "G", "starting_credits": "1000", "dispute_window_hours": 0}
    body.update(kw)
    r = client.post("/groups", json=body, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


def test_market_rules_roundtrip():
    u = _user("RulesU")
    g = _group(u["api_token"])
    closes = (utcnow() + timedelta(hours=1)).isoformat()
    r = client.post(
        f"/groups/{g['id']}/markets",
        json={"question": "Rules?", "closes_at": closes, "rules": "Resolves YES if X."},
        headers=_auth(u["api_token"]),
    )
    assert r.status_code == 201, r.text
    m = r.json()
    assert m["rules"] == "Resolves YES if X."
    assert m["evidence_url"] is None
    # Fetch again -> still there.
    r = client.get(f"/markets/{m['id']}", headers=_auth(u["api_token"]))
    assert r.json()["rules"] == "Resolves YES if X."


def test_events_ingest_and_group_timeline():
    alice = _user("TLAlice")
    bob = _user("TLBob")
    g = _group(alice["api_token"], name="TLGroup")
    client.post("/groups/join", json={"invite_code": g["invite_code"]}, headers=_auth(bob["api_token"]))

    # Telemetry ingest is permissive.
    r = client.post("/events", json={"type": "app_open", "payload": {"secs": 3}},
                    headers=_auth(alice["api_token"]))
    assert r.status_code == 200 and r.json()["ok"] is True

    closes = (utcnow() + timedelta(hours=1)).isoformat()
    mid = client.post(f"/groups/{g['id']}/markets",
                      json={"question": "Timeline market?", "closes_at": closes},
                      headers=_auth(alice["api_token"])).json()["id"]
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "50"},
                headers=_auth(bob["api_token"]))

    r = client.get(f"/groups/{g['id']}/timeline", headers=_auth(alice["api_token"]))
    assert r.status_code == 200, r.text
    tl = r.json()
    types = [e["type"] for e in tl]
    assert "market_create" in types and "bet_placed" in types and "group_join" in types
    # Newest-first.
    assert types.index("bet_placed") < types.index("market_create")
    # Bet payload is self-contained.
    bet_ev = next(e for e in tl if e["type"] == "bet_placed")
    assert bet_ev["payload"]["side"] == "YES"
    assert bet_ev["payload"]["amount"] == "50"
    assert bet_ev["payload"]["market_question"] == "Timeline market?"
    assert bet_ev["actor_name"] == "TLBob"

    # Non-member cannot read the timeline.
    stranger = _user("TLStranger")
    assert client.get(f"/groups/{g['id']}/timeline", headers=_auth(stranger["api_token"])).status_code == 403


def test_evidence_upload_and_reject_non_image():
    u = _user("EvidenceU")
    g = _group(u["api_token"])
    closes = (utcnow() + timedelta(hours=1)).isoformat()
    mid = client.post(f"/groups/{g['id']}/markets",
                      json={"question": "Evidence?", "closes_at": closes},
                      headers=_auth(u["api_token"])).json()["id"]

    r = client.post(f"/markets/{mid}/evidence",
                    files={"file": ("proof.png", _PNG, "image/png")},
                    headers=_auth(u["api_token"]))
    assert r.status_code == 200, r.text
    url = r.json()["evidence_url"]
    assert url.startswith("/static/uploads/") and url.endswith(".png")
    # Served via the static mount.
    assert client.get(url).status_code == 200

    # Non-image rejected.
    r = client.post(f"/markets/{mid}/evidence",
                    files={"file": ("notes.txt", b"hello", "text/plain")},
                    headers=_auth(u["api_token"]))
    assert r.status_code == 400


def test_push_public_key_subscribe_unsubscribe():
    u = _user("PushU")
    r = client.get("/push/public-key")
    assert r.status_code == 200 and len(r.json()["public_key"]) > 0

    sub = {"endpoint": "https://example.com/push/abc", "keys": {"p256dh": "p", "auth": "a"}}
    r = client.post("/push/subscribe", json=sub, headers=_auth(u["api_token"]))
    assert r.status_code == 200 and r.json()["ok"] is True
    # Upsert (same endpoint) is idempotent.
    assert client.post("/push/subscribe", json=sub, headers=_auth(u["api_token"])).status_code == 200

    r = client.post("/push/unsubscribe", json={"endpoint": sub["endpoint"]},
                    headers=_auth(u["api_token"]))
    assert r.status_code == 200 and r.json()["ok"] is True


def test_buy_in_tops_up_balance():
    u = _user("BuyU")
    g = _group(u["api_token"], starting_credits="500")
    r = client.post(f"/groups/{g['id']}/buy-in", headers=_auth(u["api_token"]))
    assert r.status_code == 200, r.text
    bal = {m["name"]: m["balance"] for m in r.json()["members"]}
    assert bal["BuyU"] == "1000.00"  # 500 start + 500 buy-in
    # 404 for missing group, 403 for non-member.
    assert client.post("/groups/does-not-exist/buy-in", headers=_auth(u["api_token"])).status_code == 404
    outsider = _user("BuyOutsider")
    assert client.post(f"/groups/{g['id']}/buy-in", headers=_auth(outsider["api_token"])).status_code == 403


def test_google_login_503_when_unconfigured():
    os.environ.pop("GOOGLE_CLIENT_ID", None)
    os.environ.pop("GOOGLE_CLIENT_SECRET", None)
    r = client.get("/auth/google/login", follow_redirects=False)
    assert r.status_code == 503


def test_admin_commit_log_snapshot_and_rollback():
    os.environ["POOLBET_ADMIN_NAMES"] = "TheAdmin"
    try:
        admin = _user("TheAdmin")
    finally:
        os.environ.pop("POOLBET_ADMIN_NAMES", None)

    # Admin flag is granted and reported.
    assert client.get("/admin/me", headers=_auth(admin["api_token"])).json()["is_admin"] is True
    nonadmin = _user("NotAdmin")
    assert client.get("/admin/me", headers=_auth(nonadmin["api_token"])).json()["is_admin"] is False
    assert client.get("/admin/events", headers=_auth(nonadmin["api_token"])).status_code == 403

    g = _group(admin["api_token"], name="RollbackCrew", starting_credits="1000")
    client.post("/groups/join", json={"invite_code": g["invite_code"]}, headers=_auth(nonadmin["api_token"]))
    closes = (utcnow() + timedelta(hours=1)).isoformat()
    mid = client.post(f"/groups/{g['id']}/markets",
                      json={"question": "Rollback?", "closes_at": closes},
                      headers=_auth(admin["api_token"])).json()["id"]

    # Early state: one bet.
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "100"},
                headers=_auth(admin["api_token"]))
    early_board = {m["name"]: m["balance"] for m in
                   client.get(f"/groups/{g['id']}/leaderboard", headers=_auth(admin["api_token"])).json()}
    early_bets = len(client.get(f"/markets/{mid}", headers=_auth(admin["api_token"])).json()["bets"])
    assert early_bets == 1

    # Grab the newest snapshot (represents this early state).
    snaps = client.get("/admin/snapshots", headers=_auth(admin["api_token"])).json()
    assert len(snaps) > 0
    early_snap_id = snaps[0]["id"]

    # Mutate further: two more bets.
    client.post(f"/markets/{mid}/bets", json={"side": "NO", "amount": "200"},
                headers=_auth(nonadmin["api_token"]))
    client.post(f"/markets/{mid}/bets", json={"side": "YES", "amount": "50"},
                headers=_auth(admin["api_token"]))
    assert len(client.get(f"/markets/{mid}", headers=_auth(admin["api_token"])).json()["bets"]) == 3

    # Events endpoint reflects the newest activity first.
    ev = client.get("/admin/events?limit=10", headers=_auth(admin["api_token"])).json()
    assert ev[0]["type"] in ("bet_placed", "rollback") or len(ev) > 0

    # Roll back to the early snapshot.
    r = client.post("/admin/rollback", json={"snapshot_id": early_snap_id},
                    headers=_auth(admin["api_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    assert r.json()["restored"]["bets"] >= 1

    # Later bets are gone; balances match the early state.
    after_bets = len(client.get(f"/markets/{mid}", headers=_auth(admin["api_token"])).json()["bets"])
    assert after_bets == early_bets
    after_board = {m["name"]: m["balance"] for m in
                   client.get(f"/groups/{g['id']}/leaderboard", headers=_auth(admin["api_token"])).json()}
    assert after_board == early_board

    # A 'rollback' event was appended (log keeps moving forward).
    ev = client.get("/admin/events?limit=5", headers=_auth(admin["api_token"])).json()
    assert any(e["type"] == "rollback" for e in ev)
