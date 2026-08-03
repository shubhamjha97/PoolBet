from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_admin
from ..models import (
    Bet,
    Event,
    Group,
    Market,
    Snapshot,
    User,
    get_setting,
    set_setting,
    utcnow,
)
from ..schemas import (
    AdminEventOut,
    AdminMeOut,
    HouseRakeIn,
    HouseRakeOut,
    RollbackIn,
    RollbackOut,
    SnapshotOut,
)
from ..snapshots import rollback_to

router = APIRouter(prefix="/admin", tags=["admin"])


def _iso(dt) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


@router.get("/me", response_model=AdminMeOut)
def admin_me(user: User = Depends(current_user)):
    """Any authed user: report whether they may see the admin dashboard."""
    return AdminMeOut(is_admin=user.is_admin)


def _parse_dt(label: str, value: str) -> datetime:
    """Parse an ISO datetime (from a datetime-local input) to naive UTC to match
    the stored, tz-stripped timestamps."""
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"invalid {label} datetime")
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


@router.get("/events", response_model=list[AdminEventOut])
def admin_events(
    limit: int = 100,
    offset: int = 0,
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Newest-first slice of the global commit log, with optional [start, end]
    datetime filtering (inclusive) and offset pagination."""
    limit = max(1, min(limit, 500))
    q = (
        select(Event, User)
        .join(User, User.id == Event.actor_user_id, isouter=True)
    )
    if start:
        q = q.where(Event.ts >= _parse_dt("start", start))
    if end:
        q = q.where(Event.ts <= _parse_dt("end", end))
    rows = db.execute(
        q.order_by(Event.ts.desc(), Event.id.desc())
        .limit(limit)
        .offset(max(0, offset))
    ).all()
    return [
        AdminEventOut(
            id=ev.id,
            ts=_iso(ev.ts),
            type=ev.type,
            actor_name=u.name if u else None,
            group_id=ev.group_id,
            market_id=ev.market_id,
            payload=ev.payload or {},
        )
        for ev, u in rows
    ]


@router.get("/snapshots", response_model=list[SnapshotOut])
def admin_snapshots(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Newest-first list of available restore points."""
    snaps = db.scalars(
        select(Snapshot).order_by(Snapshot.created_at.desc(), Snapshot.id.desc())
    ).all()
    return [
        SnapshotOut(
            id=s.id,
            created_at=_iso(s.created_at),
            label=s.label,
            after_event_id=s.after_event_id,
        )
        for s in snaps
    ]


@router.post("/rollback", response_model=RollbackOut)
def admin_rollback(
    body: RollbackIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Restore the whole domain state to the given snapshot's logged point."""
    try:
        restored = rollback_to(db, body.snapshot_id)
    except KeyError:
        db.rollback()
        raise HTTPException(status_code=404, detail="snapshot not found")
    db.commit()
    return RollbackOut(ok=True, restored=restored)


# ---------- settings (house rake) ----------
@router.get("/settings", response_model=HouseRakeOut)
def get_settings(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Current global settings. Defaults house_rake to 0.0 when unset."""
    return HouseRakeOut(house_rake=float(get_setting(db, "house_rake", "0") or "0"))


@router.post("/settings", response_model=HouseRakeOut)
def update_settings(
    body: HouseRakeIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Persist the house rake (validated 0..0.05)."""
    # Normalize through Decimal so we store a clean, deterministic string.
    value = str(Decimal(str(body.house_rake)))
    set_setting(db, "house_rake", value)
    db.commit()
    return HouseRakeOut(house_rake=float(value))


# ---------- metrics (dashboard telemetry) ----------
def _per_day(db: Session, ts_col, extra_where=None, days: int = 14) -> list[dict]:
    """Counts bucketed by calendar day (UTC) for the last `days`, zero-filled."""
    today = utcnow().date()
    since = today - timedelta(days=days - 1)
    day_col = func.date(ts_col)
    q = select(day_col, func.count()).where(ts_col >= since)
    if extra_where is not None:
        q = q.where(extra_where)
    rows = db.execute(q.group_by(day_col)).all()
    counts = {str(day): int(n) for day, n in rows}
    return [
        {"day": (since + timedelta(days=i)).isoformat(), "count": counts.get((since + timedelta(days=i)).isoformat(), 0)}
        for i in range(days)
    ]


@router.get("/metrics")
def admin_metrics(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Aggregate telemetry for the admin dashboard. Decimals as strings."""
    users = db.scalar(select(func.count()).select_from(User)) or 0
    groups = db.scalar(select(func.count()).select_from(Group)) or 0
    markets = db.scalar(select(func.count()).select_from(Market)) or 0
    bets = db.scalar(select(func.count()).select_from(Bet)) or 0

    app_opens = db.scalar(
        select(func.count()).select_from(Event).where(Event.type == "app_open")
    ) or 0

    # Sum payload.seconds over session_ping events (payload is JSON — sum in Python).
    session_seconds = 0
    for (payload,) in db.execute(
        select(Event.payload).where(Event.type == "session_ping")
    ).all():
        try:
            session_seconds += int((payload or {}).get("seconds", 0) or 0)
        except (TypeError, ValueError):
            pass

    since_7d = utcnow() - timedelta(days=7)
    active_users_7d = db.scalar(
        select(func.count(func.distinct(Event.actor_user_id))).where(
            Event.ts >= since_7d, Event.actor_user_id.isnot(None)
        )
    ) or 0

    total_volume = db.scalar(select(func.coalesce(func.sum(Bet.amount), 0))) or Decimal("0")

    house_earnings = Decimal("0")
    for (payload,) in db.execute(
        select(Event.payload).where(Event.type == "house_rake")
    ).all():
        try:
            house_earnings += Decimal(str((payload or {}).get("amount", "0") or "0"))
        except (TypeError, ValueError):
            pass

    return {
        "users": int(users),
        "groups": int(groups),
        "markets": int(markets),
        "bets": int(bets),
        "app_opens": int(app_opens),
        "session_seconds": int(session_seconds),
        "active_users_7d": int(active_users_7d),
        "total_volume": str(Decimal(str(total_volume))),
        "house_earnings": str(house_earnings),
        "events_per_day": _per_day(db, Event.ts),
        "bets_per_day": _per_day(db, Bet.created_at),
    }
