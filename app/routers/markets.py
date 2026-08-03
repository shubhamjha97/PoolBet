import uuid
from collections import Counter
from datetime import timedelta, timezone
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_membership
from ..engine import StakeIn, compute_odds, settle
from ..models import (
    Bet,
    Dispute,
    Group,
    IdempotencyKey,
    Market,
    MarketStatus,
    Membership,
    Outcome,
    Side,
    TxnKind,
    User,
    Vote,
    random_nickname,
    record_event,
    record_txn,
    utcnow,
)
from ..push import send_push_to_users
from ..schemas import (
    BetCreate,
    BetOut,
    DisputeIn,
    MarketCreate,
    MarketOut,
    MarketPreview,
    MessageOut,
    ResolveIn,
    VoteIn,
)

router = APIRouter(tags=["markets"])

# Photo-evidence uploads are written here and served via the /static mount.
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "web" / "uploads"
_ALLOWED_IMAGE_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_MAX_EVIDENCE_BYTES = 6 * 1024 * 1024


def _group_member_user_ids(db: Session, group_id: str, exclude_user_id: str | None = None) -> list[str]:
    ids = db.scalars(
        select(Membership.user_id).where(Membership.group_id == group_id)
    ).all()
    return [uid for uid in ids if uid != exclude_user_id]


def _aware(dt):
    """Coerce a possibly-naive datetime to timezone-aware UTC (SQLite stores naive)."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _stakes(market: Market) -> list[StakeIn]:
    return [StakeIn(bet_id=b.id, side=b.side, amount=b.amount) for b in market.bets]


def _serialize_market(db: Session, market: Market) -> MarketOut:
    odds = compute_odds(_stakes(market))
    proposer = db.get(Membership, market.proposer_id)
    proposer_user = db.get(User, proposer.user_id) if proposer else None

    # Preload member names for bets in one pass.
    name_by_membership: dict[str, str] = {}
    for b in market.bets:
        if b.membership_id not in name_by_membership:
            m = db.get(Membership, b.membership_id)
            name_by_membership[b.membership_id] = db.get(User, m.user_id).name

    bets = [
        BetOut(
            id=b.id,
            side=b.side,
            amount=b.amount,
            payout=b.payout,
            # Anonymous bets surface their stable nickname, never the real name.
            member_name=b.nickname if b.anonymous else name_by_membership[b.membership_id],
            is_anonymous=b.anonymous,
            created_at=_aware(b.created_at),
        )
        for b in market.bets
    ]
    return MarketOut(
        id=market.id,
        group_id=market.group_id,
        question=market.question,
        rules=market.rules,
        evidence_url=market.evidence_url,
        status=market.status,
        closes_at=_aware(market.closes_at),
        proposer_name=proposer_user.name if proposer_user else "?",
        proposer_user_id=proposer_user.id if proposer_user else None,
        yes_pool=odds.yes_pool,
        no_pool=odds.no_pool,
        yes_prob=odds.yes_prob,
        no_prob=odds.no_prob,
        proposed_outcome=market.proposed_outcome,
        proposed_fraction=market.proposed_fraction,
        outcome=market.outcome,
        outcome_fraction=market.outcome_fraction,
        bets=bets,
    )


# ---------- create / list / read ----------
@router.post("/groups/{group_id}/markets", response_model=MarketOut, status_code=201)
def create_market(
    group_id: str,
    body: MarketCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="group not found")
    member = require_membership(db, group_id, user)

    if _aware(body.closes_at) <= utcnow():
        raise HTTPException(status_code=422, detail="closes_at must be in the future")

    market = Market(
        group_id=group_id,
        proposer_id=member.id,
        question=body.question,
        rules=body.rules,
        closes_at=body.closes_at,
        status=MarketStatus.OPEN,
    )
    db.add(market)
    db.flush()
    record_event(
        db, "market_create", actor_user_id=user.id, group_id=group_id,
        market_id=market.id, question=market.question, actor_name=user.name,
    )
    db.commit()
    db.refresh(market)
    return _serialize_market(db, market)


@router.get("/groups/{group_id}/markets", response_model=list[MarketOut])
def list_markets(
    group_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_membership(db, group_id, user)
    markets = db.scalars(
        select(Market).where(Market.group_id == group_id).order_by(Market.created_at.desc())
    ).all()
    return [_serialize_market(db, m) for m in markets]


@router.get("/markets/{market_id}/preview", response_model=MarketPreview)
def preview_market(
    market_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Lightweight market info for deep links — any authenticated user, member or not."""
    market = db.get(Market, market_id)
    if not market:
        raise HTTPException(status_code=404, detail="market not found")
    group = db.get(Group, market.group_id)
    is_member = (
        db.scalar(
            select(Membership).where(
                Membership.group_id == market.group_id, Membership.user_id == user.id
            )
        )
        is not None
    )
    return MarketPreview(
        market_id=market.id,
        question=market.question,
        group_id=market.group_id,
        group_name=group.name if group else "?",
        is_member=is_member,
    )


@router.get("/markets/{market_id}", response_model=MarketOut)
def get_market(
    market_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    market = db.get(Market, market_id)
    if not market:
        raise HTTPException(status_code=404, detail="market not found")
    require_membership(db, market.group_id, user)
    return _serialize_market(db, market)


# ---------- betting ----------
@router.post("/markets/{market_id}/bets", response_model=MarketOut, status_code=201)
def place_bet(
    market_id: str,
    body: BetCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    market = db.get(Market, market_id)
    if not market:
        raise HTTPException(status_code=404, detail="market not found")
    member = require_membership(db, market.group_id, user)

    # Idempotency: a retried request with the same key is a no-op (returns current
    # state), so the bet + its commit-log event are never applied twice.
    idem = request.headers.get("Idempotency-Key")
    if idem and db.scalar(select(IdempotencyKey).where(IdempotencyKey.key == idem)):
        return _serialize_market(db, market)
    # Strict transaction: lock this member's row so the balance check + debit are
    # atomic against concurrent bets (a real row lock on Postgres; SQLite already
    # serializes writes). Prevents double-spend / overdraft races.
    member = db.scalar(
        select(Membership).where(Membership.id == member.id).with_for_update()
    )

    if market.status != MarketStatus.OPEN or _aware(market.closes_at) <= utcnow():
        raise HTTPException(status_code=409, detail="market is not open for betting")
    if body.amount > member.balance:
        raise HTTPException(status_code=422, detail="insufficient balance")

    nickname = None
    if body.anonymous:
        # Reuse this membership's existing nickname in this market so an anonymous
        # bettor is stable across bets; otherwise mint a fresh one.
        prior = db.scalar(
            select(Bet).where(
                Bet.market_id == market.id,
                Bet.membership_id == member.id,
                Bet.anonymous.is_(True),
            )
        )
        nickname = prior.nickname if prior else random_nickname()

    member.balance = member.balance - body.amount
    db.add(
        Bet(
            market_id=market.id,
            membership_id=member.id,
            side=Side(body.side).value,
            amount=body.amount,
            anonymous=body.anonymous,
            nickname=nickname,
        )
    )
    record_txn(db, member, -body.amount, TxnKind.BET, market_id=market.id)
    record_event(
        db, "bet_placed", actor_user_id=user.id, group_id=market.group_id,
        market_id=market.id, side=Side(body.side).value,
        amount=str(body.amount), anonymous=body.anonymous,
        nickname_or_name=(nickname if body.anonymous else user.name),
        actor_name=user.name if not body.anonymous else None,
        market_question=market.question,
    )
    if idem:
        db.add(IdempotencyKey(key=idem, user_id=user.id))
    try:
        db.commit()
    except IntegrityError:
        # Concurrent duplicate (same Idempotency-Key): the other request won.
        db.rollback()
        return _serialize_market(db, db.get(Market, market_id))
    except Exception:
        db.rollback()
        raise HTTPException(status_code=409, detail="could not place bet — please retry")
    db.refresh(market)

    # Notify the rest of the group (best-effort; never breaks the request).
    try:
        group = db.get(Group, market.group_id)
        others = _group_member_user_ids(db, market.group_id, exclude_user_id=user.id)
        send_push_to_users(
            db, others,
            title=f"New bet in {group.name}",
            body=market.question,
            url=f"/#/market/{market.id}",
        )
    except Exception:
        pass

    return _serialize_market(db, market)


# ---------- resolution: propose -> dispute window -> settle ----------
@router.post("/markets/{market_id}/resolve", response_model=MarketOut)
def propose_resolution(
    market_id: str,
    body: ResolveIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Proposer marks the outcome, opening the dispute window."""
    market = db.get(Market, market_id)
    if not market:
        raise HTTPException(status_code=404, detail="market not found")
    member = require_membership(db, market.group_id, user)

    if member.id != market.proposer_id:
        raise HTTPException(status_code=403, detail="only the market proposer can resolve")
    if market.status not in (MarketStatus.OPEN, MarketStatus.CLOSED):
        raise HTTPException(status_code=409, detail=f"cannot resolve a {market.status} market")
    if _aware(market.closes_at) > utcnow():
        raise HTTPException(status_code=409, detail="market has not closed yet")

    market.proposed_outcome = Outcome(body.outcome).value
    if body.outcome == "SCALAR":
        if body.yes_percent is None:
            raise HTTPException(status_code=422, detail="SCALAR outcome requires yes_percent")
        market.proposed_fraction = (Decimal(str(body.yes_percent)) / Decimal("100")).quantize(Decimal("0.0001"))
    else:
        market.proposed_fraction = None
    market.resolution_proposed_at = utcnow()
    market.status = MarketStatus.RESOLVING
    record_event(
        db, "market_resolved", actor_user_id=user.id, group_id=market.group_id,
        market_id=market.id, outcome=market.proposed_outcome,
        fraction=(str(market.proposed_fraction) if market.proposed_fraction is not None else None),
        market_question=market.question, actor_name=user.name,
    )
    db.commit()
    db.refresh(market)
    return _serialize_market(db, market)


@router.post("/markets/{market_id}/dispute", response_model=MarketOut)
def dispute(
    market_id: str,
    body: DisputeIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Any member may dispute during the window; escalates to a group vote."""
    market = db.get(Market, market_id)
    if not market:
        raise HTTPException(status_code=404, detail="market not found")
    member = require_membership(db, market.group_id, user)

    if market.status != MarketStatus.RESOLVING:
        raise HTTPException(status_code=409, detail="market is not in the dispute window")

    group = db.get(Group, market.group_id)
    deadline = _aware(market.resolution_proposed_at) + timedelta(hours=group.dispute_window_hours)
    if utcnow() > deadline:
        raise HTTPException(status_code=409, detail="dispute window has closed")

    db.add(Dispute(market_id=market.id, raiser_id=member.id, reason=body.reason))
    market.status = MarketStatus.DISPUTED
    db.commit()
    db.refresh(market)
    return _serialize_market(db, market)


@router.post("/markets/{market_id}/vote", response_model=MarketOut)
def vote(
    market_id: str,
    body: VoteIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """One vote per member on a disputed market (re-voting updates your choice)."""
    market = db.get(Market, market_id)
    if not market:
        raise HTTPException(status_code=404, detail="market not found")
    member = require_membership(db, market.group_id, user)

    if market.status != MarketStatus.DISPUTED:
        raise HTTPException(status_code=409, detail="market is not under dispute")

    existing = db.scalar(
        select(Vote).where(Vote.market_id == market.id, Vote.membership_id == member.id)
    )
    if existing:
        existing.choice = Outcome(body.choice).value
    else:
        db.add(Vote(market_id=market.id, membership_id=member.id, choice=Outcome(body.choice).value))
    db.commit()
    db.refresh(market)
    return _serialize_market(db, market)


def _apply_settlement(db: Session, market: Market, outcome: str, fraction: Decimal | None = None) -> None:
    """Run the engine, write payouts, credit balances, mark resolved."""
    group = db.get(Group, market.group_id)
    payouts = settle(_stakes(market), outcome, rake=group.rake, yes_fraction=fraction)

    for b in market.bets:
        p = payouts.get(b.id, Decimal("0"))
        b.payout = p
        if p > 0:
            member = db.get(Membership, b.membership_id)
            member.balance = member.balance + p
            record_txn(db, member, p, TxnKind.PAYOUT, market_id=market.id)

    market.outcome = outcome
    market.outcome_fraction = fraction if outcome == "SCALAR" else None
    market.resolved_at = utcnow()
    market.status = MarketStatus.RESOLVED
    record_event(
        db, "market_settled", group_id=market.group_id, market_id=market.id,
        outcome=outcome,
        fraction=(str(fraction) if fraction is not None and outcome == "SCALAR" else None),
        market_question=market.question,
    )


@router.post("/markets/{market_id}/settle", response_model=MarketOut)
def settle_market(
    market_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Finalize a market.

    * RESOLVING -> settles once the dispute window has elapsed with no disputes.
    * DISPUTED  -> tallies member votes; majority wins, ties VOID.
    """
    market = db.get(Market, market_id)
    if not market:
        raise HTTPException(status_code=404, detail="market not found")
    member = require_membership(db, market.group_id, user)

    if market.status == MarketStatus.RESOLVING:
        group = db.get(Group, market.group_id)
        deadline = _aware(market.resolution_proposed_at) + timedelta(
            hours=group.dispute_window_hours
        )
        # The proposer may force-settle early (skip the wait); everyone else must
        # let the dispute window elapse so there's a chance to contest.
        is_proposer = member.id == market.proposer_id
        if utcnow() < deadline and not is_proposer:
            raise HTTPException(
                status_code=409,
                detail="dispute window still open; only the proposer can settle early",
            )
        _apply_settlement(db, market, market.proposed_outcome, market.proposed_fraction)

    elif market.status == MarketStatus.DISPUTED:
        counts = Counter(v.choice for v in market.votes)
        if not counts:
            raise HTTPException(status_code=409, detail="no votes cast yet")
        top = counts.most_common()
        # tie between the top two choices -> VOID (refund all)
        outcome = "VOID" if len(top) > 1 and top[0][1] == top[1][1] else top[0][0]
        _apply_settlement(db, market, outcome)

    else:
        raise HTTPException(status_code=409, detail=f"cannot settle a {market.status} market")

    db.commit()
    db.refresh(market)

    # Notify all members that the market has settled (best-effort).
    try:
        group = db.get(Group, market.group_id)
        everyone = _group_member_user_ids(db, market.group_id)
        send_push_to_users(
            db, everyone,
            title=f"{market.question} resolved",
            body=f"Outcome: {market.outcome}",
            url=f"/#/market/{market.id}",
        )
    except Exception:
        pass

    return _serialize_market(db, market)


# ---------- photo evidence ----------
@router.post("/markets/{market_id}/evidence", response_model=MarketOut)
def upload_evidence(
    market_id: str,
    file: UploadFile,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Attach a proof image (jpg/png/webp, <=6MB) to a market. Group members only."""
    market = db.get(Market, market_id)
    if not market:
        raise HTTPException(status_code=404, detail="market not found")
    require_membership(db, market.group_id, user)

    ext = _ALLOWED_IMAGE_EXT.get((file.content_type or "").lower())
    if not ext:
        raise HTTPException(status_code=400, detail="file must be a jpg, png, or webp image")

    data = file.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    if len(data) > _MAX_EVIDENCE_BYTES:
        raise HTTPException(status_code=400, detail="image too large (max 6MB)")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}.{ext}"
    (UPLOAD_DIR / filename).write_bytes(data)

    market.evidence_url = f"/static/uploads/{filename}"
    record_event(
        db, "evidence_uploaded", actor_user_id=user.id, group_id=market.group_id,
        market_id=market.id, evidence_url=market.evidence_url,
    )
    db.commit()
    db.refresh(market)
    return _serialize_market(db, market)
