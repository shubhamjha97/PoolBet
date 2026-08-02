from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .deps import current_user, require_membership
from .models import Membership, User
from .push import init_vapid
from .routers import admin, auth, events, groups, markets, oauth, push, users
from .schemas import MemberOut

# Importing snapshots registers the after-commit listeners that append a Snapshot
# whenever an Event is committed (the commit log is the source of truth for state).
from . import snapshots  # noqa: E402,F401

# Create tables on startup. (Alembic migrations are additive; see README.)
Base.metadata.create_all(bind=engine)

# Load or generate the VAPID keypair for Web Push (persisted to .vapid.json).
init_vapid()

app = FastAPI(
    title="PoolBet",
    description="Parimutuel prediction markets for friend groups. Everyone pools "
    "credits, bets on YES/NO markets, and winners split the pot.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(groups.router)
app.include_router(markets.router)
app.include_router(events.router)
app.include_router(push.router)
app.include_router(oauth.router)
app.include_router(admin.router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "service": "poolbet"}


# ---- frontend (served by the same server) ----
WEB_DIR = Path(__file__).resolve().parent.parent / "web"
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(WEB_DIR / "index.html")


# ---- PWA: service worker must be root-scoped; manifest at a stable path ----
@app.get("/sw.js", include_in_schema=False)
def service_worker():
    return FileResponse(
        WEB_DIR / "sw.js",
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"},
    )


@app.get("/manifest.webmanifest", include_in_schema=False)
def manifest():
    return FileResponse(WEB_DIR / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/groups/{group_id}/leaderboard", response_model=list[MemberOut], tags=["groups"])
def leaderboard(
    group_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Standings by credit balance — the season scoreboard."""
    require_membership(db, group_id, user)
    rows = db.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(Membership.group_id == group_id)
        .order_by(Membership.balance.desc())
    ).all()
    return [
        MemberOut(membership_id=m.id, user_id=u.id, name=u.name, balance=m.balance)
        for m, u in rows
    ]
