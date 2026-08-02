from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..models import Event, User
from ..schemas import EventIn, OkOut

router = APIRouter(tags=["events"])


@router.post("/events", response_model=OkOut)
def ingest_event(
    body: EventIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Permissive client telemetry ingest (app_open, session_end, ...).

    Any type string is accepted; the event is attributed to the current user.
    The raw payload dict is stored verbatim (no key collisions with helper args).
    """
    db.add(Event(type=body.type, actor_user_id=user.id, payload=body.payload or {}))
    db.commit()
    return OkOut(ok=True)
