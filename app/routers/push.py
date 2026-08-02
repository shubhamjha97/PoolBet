from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..models import PushSubscription, User, record_event
from ..push import public_key
from ..schemas import OkOut, PublicKeyOut, PushSubscribeIn, PushUnsubscribeIn

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/public-key", response_model=PublicKeyOut)
def get_public_key():
    """The VAPID applicationServerKey the browser subscribes with."""
    return PublicKeyOut(public_key=public_key())


@router.post("/subscribe", response_model=OkOut)
def subscribe(
    body: PushSubscribeIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Upsert a browser PushSubscription by endpoint for the current user."""
    existing = db.scalar(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    if existing:
        existing.user_id = user.id
        existing.p256dh = body.keys.p256dh
        existing.auth = body.keys.auth
    else:
        db.add(
            PushSubscription(
                user_id=user.id,
                endpoint=body.endpoint,
                p256dh=body.keys.p256dh,
                auth=body.keys.auth,
            )
        )
    record_event(db, "push_subscribe", actor_user_id=user.id, actor_name=user.name)
    db.commit()
    return OkOut(ok=True)


@router.post("/unsubscribe", response_model=OkOut)
def unsubscribe(
    body: PushUnsubscribeIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    sub = db.scalar(
        select(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint,
            PushSubscription.user_id == user.id,
        )
    )
    if sub:
        db.delete(sub)
        db.commit()
    return OkOut(ok=True)
