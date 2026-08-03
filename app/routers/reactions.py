"""Emoji reactions on feed/timeline events."""
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_membership
from ..models import Event, Reaction, User
from ..sanitize import CleanStr

router = APIRouter(tags=["reactions"])

ALLOWED = ["🔥", "😂", "😮", "💀", "👏", "🎉", "😭", "🧠"]


class ReactIn(BaseModel):
    emoji: CleanStr = Field(min_length=1, max_length=8)


def _counts(db: Session, group_id: str, user_id: str) -> dict:
    """{ counts: {event_id: {emoji: n}}, mine: {event_id: [emoji]} }."""
    rows = db.scalars(select(Reaction).where(Reaction.group_id == group_id)).all()
    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    mine: dict[str, list[str]] = defaultdict(list)
    for r in rows:
        counts[r.event_id][r.emoji] += 1
        if r.user_id == user_id:
            mine[r.event_id].append(r.emoji)
    return {"counts": {k: dict(v) for k, v in counts.items()}, "mine": dict(mine)}


@router.post("/events/{event_id}/react")
def toggle_reaction(
    event_id: str,
    body: ReactIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Toggle one emoji on an event (add if absent, remove if present). Members only."""
    if body.emoji not in ALLOWED:
        raise HTTPException(status_code=422, detail="unsupported reaction")
    event = db.get(Event, event_id)
    if not event or not event.group_id:
        raise HTTPException(status_code=404, detail="event not found")
    require_membership(db, event.group_id, user)

    existing = db.scalar(
        select(Reaction).where(
            Reaction.event_id == event_id, Reaction.user_id == user.id, Reaction.emoji == body.emoji
        )
    )
    if existing:
        db.delete(existing)
    else:
        db.add(Reaction(event_id=event_id, user_id=user.id, group_id=event.group_id, emoji=body.emoji))
    db.commit()
    return _counts(db, event.group_id, user.id)


@router.get("/groups/{group_id}/reactions")
def group_reactions(
    group_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """All reaction counts for a group's events (+ which the caller made). Members only."""
    require_membership(db, group_id, user)
    return _counts(db, group_id, user.id)
