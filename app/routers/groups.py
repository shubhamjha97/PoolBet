from datetime import timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import current_user, require_membership
from ..models import (
    AccessRequest,
    AccessStatus,
    Event,
    Group,
    Membership,
    Transaction,
    TxnKind,
    User,
    record_event,
    record_txn,
)
from ..schemas import (
    AccessRequestOut,
    AccessRequestStatusOut,
    GroupCreate,
    GroupJoin,
    GroupOut,
    GroupPreview,
    MemberOut,
    PnlPoint,
    PnlSeries,
    TimelineItem,
)

router = APIRouter(prefix="/groups", tags=["groups"])


def _serialize_group(db: Session, group: Group) -> GroupOut:
    rows = db.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(Membership.group_id == group.id)
    ).all()
    members = [
        MemberOut(membership_id=m.id, user_id=u.id, name=u.name, balance=m.balance)
        for m, u in rows
    ]
    return GroupOut(
        id=group.id,
        name=group.name,
        invite_code=group.invite_code,
        starting_credits=group.starting_credits,
        dispute_window_hours=group.dispute_window_hours,
        rake=group.rake,
        members=members,
    )


def _aware_iso(dt) -> str:
    """ISO8601 string, coercing SQLite's naive datetimes to UTC-aware."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _serialize_access_request(req: AccessRequest) -> AccessRequestStatusOut:
    return AccessRequestStatusOut(
        id=req.id,
        group_id=req.group_id,
        user_id=req.user_id,
        status=req.status,
        created_at=req.created_at,
    )


@router.post("", response_model=GroupOut, status_code=201)
def create_group(
    body: GroupCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Create a group and auto-join the creator with the starting credit pool."""
    starting = body.starting_credits or Decimal(settings.default_starting_credits)
    group = Group(
        name=body.name,
        starting_credits=starting,
        dispute_window_hours=(
            body.dispute_window_hours
            if body.dispute_window_hours is not None
            else settings.default_dispute_window_hours
        ),
        rake=body.rake if body.rake is not None else Decimal(settings.default_rake),
        created_by=user.id,
    )
    db.add(group)
    db.flush()  # need group.id

    membership = Membership(group_id=group.id, user_id=user.id, balance=starting)
    db.add(membership)
    db.flush()  # need membership.id for the ledger entry
    record_txn(db, membership, starting, TxnKind.GRANT)
    record_event(db, "group_create", actor_user_id=user.id, group_id=group.id, name=group.name, actor_name=user.name)
    db.commit()
    db.refresh(group)
    return _serialize_group(db, group)


@router.post("/join", response_model=GroupOut)
def join_group(
    body: GroupJoin,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Join a group by invite code; receive the group's starting credit pool."""
    group = db.scalar(select(Group).where(Group.invite_code == body.invite_code.upper()))
    if not group:
        raise HTTPException(status_code=404, detail="invalid invite code")

    existing = db.scalar(
        select(Membership).where(
            Membership.group_id == group.id, Membership.user_id == user.id
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="already a member")

    membership = Membership(
        group_id=group.id, user_id=user.id, balance=group.starting_credits
    )
    db.add(membership)
    db.flush()  # need membership.id for the ledger entry
    record_txn(db, membership, group.starting_credits, TxnKind.GRANT)
    record_event(db, "group_join", actor_user_id=user.id, group_id=group.id, name=user.name, actor_name=user.name)
    db.commit()
    return _serialize_group(db, group)


@router.get("/{group_id}", response_model=GroupOut)
def get_group(
    group_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="group not found")
    require_membership(db, group_id, user)  # members only
    return _serialize_group(db, group)


@router.get("/{group_id}/preview", response_model=GroupPreview)
def preview_group(
    group_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Public-ish group card for deep links — any authenticated user, member or not."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="group not found")
    member_count = db.scalar(
        select(func.count())
        .select_from(Membership)
        .where(Membership.group_id == group_id)
    )
    return GroupPreview(id=group.id, name=group.name, member_count=member_count or 0)


@router.get("/{group_id}/pnl", response_model=list[PnlSeries])
def group_pnl(
    group_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Per-member balance history over time, built from the ledger. Members only."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="group not found")
    require_membership(db, group_id, user)

    rows = db.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(Membership.group_id == group_id)
    ).all()

    out: list[PnlSeries] = []
    for m, u in rows:
        txns = db.scalars(
            select(Transaction)
            .where(Transaction.membership_id == m.id)
            .order_by(Transaction.created_at, Transaction.id)
        ).all()
        series = [
            PnlPoint(t=_aware_iso(tx.created_at), balance=float(tx.balance_after))
            for tx in txns
        ]
        out.append(PnlSeries(user_id=u.id, name=u.name, series=series))
    return out


# ---------- access requests (deep-link join flow) ----------
@router.post("/{group_id}/access-requests", response_model=AccessRequestStatusOut)
def create_access_request(
    group_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """A non-member asks to join. Idempotent: an existing PENDING request is returned."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="group not found")

    already = db.scalar(
        select(Membership).where(
            Membership.group_id == group_id, Membership.user_id == user.id
        )
    )
    if already:
        raise HTTPException(status_code=409, detail="already a member")

    existing = db.scalar(
        select(AccessRequest).where(
            AccessRequest.group_id == group_id,
            AccessRequest.user_id == user.id,
            AccessRequest.status == AccessStatus.PENDING.value,
        )
    )
    if existing:
        return _serialize_access_request(existing)

    req = AccessRequest(group_id=group_id, user_id=user.id, status=AccessStatus.PENDING.value)
    db.add(req)
    db.flush()
    record_event(
        db, "access_requested", actor_user_id=user.id, group_id=group_id,
        name=user.name, actor_name=user.name,
    )
    db.commit()
    db.refresh(req)
    return _serialize_access_request(req)


@router.get("/{group_id}/access-requests", response_model=list[AccessRequestOut])
def list_access_requests(
    group_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """List PENDING requests. Group creator only."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="group not found")
    if group.created_by != user.id:
        raise HTTPException(status_code=403, detail="only the group creator can view requests")

    rows = db.execute(
        select(AccessRequest, User)
        .join(User, User.id == AccessRequest.user_id)
        .where(
            AccessRequest.group_id == group_id,
            AccessRequest.status == AccessStatus.PENDING.value,
        )
        .order_by(AccessRequest.created_at)
    ).all()
    return [
        AccessRequestOut(id=r.id, user_id=u.id, name=u.name, created_at=r.created_at)
        for r, u in rows
    ]


@router.post(
    "/{group_id}/access-requests/{request_id}/approve",
    response_model=GroupOut,
)
def approve_access_request(
    group_id: str,
    request_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Group creator approves a request: grants membership + starting credits."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="group not found")
    if group.created_by != user.id:
        raise HTTPException(status_code=403, detail="only the group creator can approve")

    req = db.get(AccessRequest, request_id)
    if not req or req.group_id != group_id:
        raise HTTPException(status_code=404, detail="access request not found")

    existing = db.scalar(
        select(Membership).where(
            Membership.group_id == group_id, Membership.user_id == req.user_id
        )
    )
    if not existing:
        membership = Membership(
            group_id=group_id, user_id=req.user_id, balance=group.starting_credits
        )
        db.add(membership)
        db.flush()  # need membership.id for the ledger entry
        record_txn(db, membership, group.starting_credits, TxnKind.GRANT)

    req.status = AccessStatus.APPROVED.value
    approved_user = db.get(User, req.user_id)
    record_event(
        db, "access_approved", actor_user_id=user.id, group_id=group_id,
        approved_user_id=req.user_id,
        name=approved_user.name if approved_user else None,
        actor_name=user.name,
    )
    db.commit()
    db.refresh(group)
    return _serialize_group(db, group)


# ---------- re-buy-in ----------
@router.post("/{group_id}/buy-in", response_model=GroupOut)
def buy_in(
    group_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Top the caller's own balance up by the group's starting_credits (a GRANT)."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="group not found")
    member = require_membership(db, group_id, user)

    member.balance = member.balance + group.starting_credits
    record_txn(db, member, group.starting_credits, TxnKind.GRANT)
    record_event(
        db, "buy_in", actor_user_id=user.id, group_id=group_id,
        amount=str(group.starting_credits), actor_name=user.name,
    )
    db.commit()
    db.refresh(group)
    return _serialize_group(db, group)


# ---------- group timeline (commit log) ----------
@router.get("/{group_id}/timeline", response_model=list[TimelineItem])
def group_timeline(
    group_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Newest-first commit log of this group's events, derived from the Event log.

    Each event's payload is self-contained (actor_name, market_question, etc.) so a
    timeline line renders without extra lookups. Members only.
    """
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="group not found")
    require_membership(db, group_id, user)

    rows = db.execute(
        select(Event, User)
        .join(User, User.id == Event.actor_user_id, isouter=True)
        .where(Event.group_id == group_id)
        .order_by(Event.ts.desc(), Event.id.desc())
    ).all()
    items = []
    for ev, u in rows:
        payload = ev.payload or {}
        # Prefer the payload's actor_name (it is None for anonymous bets, keeping
        # them anonymous even in the timeline); else fall back to the joined user.
        actor_name = payload["actor_name"] if "actor_name" in payload else (u.name if u else None)
        items.append(
            TimelineItem(
                id=ev.id,
                ts=_aware_iso(ev.ts),
                type=ev.type,
                actor_name=actor_name,
                market_id=ev.market_id,
                payload=payload,
            )
        )
    return items
