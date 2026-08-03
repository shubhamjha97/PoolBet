from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _auth(t): return {"Authorization": f"Bearer {t}"}
def _user(n): return client.post("/auth/signup", json={"name": n, "password": "hunter2"}).json()


def test_reactions_toggle_and_membership():
    a = _user("ReactA")
    b = _user("ReactB")
    g = client.post("/groups", json={"name": "Rx", "starting_credits": "1000"}, headers=_auth(a["api_token"])).json()
    # a group-create event exists; grab a recent event id from the timeline
    tl = client.get(f"/groups/{g['id']}/timeline", headers=_auth(a["api_token"])).json()
    eid = tl[0]["id"]

    # add 🔥
    r = client.post(f"/events/{eid}/react", json={"emoji": "🔥"}, headers=_auth(a["api_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["counts"][eid]["🔥"] == 1
    assert "🔥" in r.json()["mine"][eid]

    # toggle off
    r = client.post(f"/events/{eid}/react", json={"emoji": "🔥"}, headers=_auth(a["api_token"]))
    assert r.json()["counts"].get(eid, {}).get("🔥", 0) == 0

    # unsupported emoji -> 422
    assert client.post(f"/events/{eid}/react", json={"emoji": "🚀"}, headers=_auth(a["api_token"])).status_code == 422

    # non-member -> 403
    assert client.post(f"/events/{eid}/react", json={"emoji": "🔥"}, headers=_auth(b["api_token"])).status_code == 403
