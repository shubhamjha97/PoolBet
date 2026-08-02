from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_admin
from ..models import Event, Snapshot, User
from ..schemas import (
    AdminEventOut,
    AdminMeOut,
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


@router.get("/events", response_model=list[AdminEventOut])
def admin_events(
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Newest-first slice of the global commit log."""
    limit = max(1, min(limit, 500))
    rows = db.execute(
        select(Event, User)
        .join(User, User.id == Event.actor_user_id, isouter=True)
        .order_by(Event.ts.desc(), Event.id.desc())
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
