import enum
import secrets
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

# Store credits as fixed-precision decimals (18,2). Never floats — money math.
Credits = Numeric(18, 2)


def _uuid() -> str:
    return str(uuid.uuid4())


def _token() -> str:
    return secrets.token_urlsafe(24)


def _invite_code() -> str:
    # Short, human-shareable, unambiguous (no 0/O/1/I).
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))


# Word lists for stable-per-user anonymous nicknames ("Silent Otter").
_NICK_ADJECTIVES = (
    "Silent", "Brave", "Clever", "Swift", "Lucky", "Sly", "Mellow",
    "Bold", "Quiet", "Nimble", "Wily", "Jolly", "Fuzzy", "Cosmic",
    "Sneaky", "Gentle", "Rowdy", "Plucky", "Dapper", "Frosty",
)
_NICK_ANIMALS = (
    "Otter", "Falcon", "Badger", "Lynx", "Heron", "Marmot", "Panda",
    "Wombat", "Ferret", "Raven", "Gecko", "Bison", "Moose", "Koala",
    "Mongoose", "Puffin", "Narwhal", "Meerkat", "Tapir", "Fox",
)


def random_nickname() -> str:
    """A random 'Adjective Animal' handle for anonymous bettors."""
    return f"{secrets.choice(_NICK_ADJECTIVES)} {secrets.choice(_NICK_ANIMALS)}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Side(str, enum.Enum):
    YES = "YES"
    NO = "NO"


class Outcome(str, enum.Enum):
    YES = "YES"
    NO = "NO"
    VOID = "VOID"      # market cancelled — all stakes refunded
    SCALAR = "SCALAR"  # fractional: YES side takes `fraction` of the pot, NO the rest


class MarketStatus(str, enum.Enum):
    OPEN = "OPEN"            # accepting bets
    CLOSED = "CLOSED"        # past closesAt, awaiting resolution
    RESOLVING = "RESOLVING"  # outcome proposed, dispute window open
    DISPUTED = "DISPUTED"    # a member disputed — goes to a vote
    RESOLVED = "RESOLVED"    # settled, payouts credited


class TxnKind(str, enum.Enum):
    GRANT = "GRANT"      # starting credits on joining a group
    BET = "BET"          # stake debited when placing a bet
    PAYOUT = "PAYOUT"    # winnings credited at settlement


class AccessStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    DENIED = "DENIED"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    # OAuth (Google) subject id — set when the account was created via social login.
    google_sub: Mapped[str | None] = mapped_column(String, unique=True, nullable=True, index=True)
    is_admin: Mapped[bool] = mapped_column(nullable=False, default=False)
    api_token: Mapped[str] = mapped_column(String, unique=True, default=_token, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    memberships: Mapped[list["Membership"]] = relationship(back_populates="user")


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    invite_code: Mapped[str] = mapped_column(String, unique=True, default=_invite_code, index=True)
    starting_credits: Mapped[Decimal] = mapped_column(Credits, nullable=False)
    dispute_window_hours: Mapped[int] = mapped_column(nullable=False, default=12)
    rake: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False, default=Decimal("0"))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    memberships: Mapped[list["Membership"]] = relationship(back_populates="group")
    markets: Mapped[list["Market"]] = relationship(back_populates="group")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_user"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    balance: Mapped[Decimal] = mapped_column(Credits, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    group: Mapped["Group"] = relationship(back_populates="memberships")
    user: Mapped["User"] = relationship(back_populates="memberships")
    bets: Mapped[list["Bet"]] = relationship(back_populates="membership")


class Market(Base):
    __tablename__ = "markets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), nullable=False, index=True)
    proposer_id: Mapped[str] = mapped_column(ForeignKey("memberships.id"), nullable=False)
    question: Mapped[str] = mapped_column(String, nullable=False)
    rules: Mapped[str | None] = mapped_column(Text, nullable=True)  # optional resolution criteria / fine print
    evidence_url: Mapped[str | None] = mapped_column(String, nullable=True)  # /static/uploads/<file> proof image
    closes_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[MarketStatus] = mapped_column(String, nullable=False, default=MarketStatus.OPEN)

    proposed_outcome: Mapped[Outcome | None] = mapped_column(String, nullable=True)
    proposed_fraction: Mapped[Decimal | None] = mapped_column(Numeric(6, 4), nullable=True)  # YES share 0..1 for SCALAR
    resolution_proposed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    outcome: Mapped[Outcome | None] = mapped_column(String, nullable=True)
    outcome_fraction: Mapped[Decimal | None] = mapped_column(Numeric(6, 4), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    group: Mapped["Group"] = relationship(back_populates="markets")
    bets: Mapped[list["Bet"]] = relationship(back_populates="market")
    disputes: Mapped[list["Dispute"]] = relationship(back_populates="market")
    votes: Mapped[list["Vote"]] = relationship(back_populates="market")


class Bet(Base):
    __tablename__ = "bets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    market_id: Mapped[str] = mapped_column(ForeignKey("markets.id"), nullable=False, index=True)
    membership_id: Mapped[str] = mapped_column(ForeignKey("memberships.id"), nullable=False, index=True)
    side: Mapped[Side] = mapped_column(String, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Credits, nullable=False)
    payout: Mapped[Decimal | None] = mapped_column(Credits, nullable=True)  # set at settlement
    anonymous: Mapped[bool] = mapped_column(nullable=False, default=False)
    nickname: Mapped[str | None] = mapped_column(String, nullable=True)  # stable per (market, membership)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    market: Mapped["Market"] = relationship(back_populates="bets")
    membership: Mapped["Membership"] = relationship(back_populates="bets")


class Dispute(Base):
    __tablename__ = "disputes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    market_id: Mapped[str] = mapped_column(ForeignKey("markets.id"), nullable=False, index=True)
    raiser_id: Mapped[str] = mapped_column(ForeignKey("memberships.id"), nullable=False)
    reason: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    market: Mapped["Market"] = relationship(back_populates="disputes")


class Vote(Base):
    __tablename__ = "votes"
    __table_args__ = (UniqueConstraint("market_id", "membership_id", name="uq_market_voter"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    market_id: Mapped[str] = mapped_column(ForeignKey("markets.id"), nullable=False, index=True)
    membership_id: Mapped[str] = mapped_column(ForeignKey("memberships.id"), nullable=False)
    choice: Mapped[Outcome] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    market: Mapped["Market"] = relationship(back_populates="votes")


class Transaction(Base):
    """Append-only ledger of balance changes — powers P&L history charts."""
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), nullable=False, index=True)
    membership_id: Mapped[str] = mapped_column(ForeignKey("memberships.id"), nullable=False, index=True)
    market_id: Mapped[str | None] = mapped_column(ForeignKey("markets.id"), nullable=True)
    kind: Mapped[TxnKind] = mapped_column(String, nullable=False)  # GRANT | BET | PAYOUT
    delta: Mapped[Decimal] = mapped_column(Credits, nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Credits, nullable=False)
    # Client-side microsecond timestamp — server_default now() only has second
    # resolution, which is too coarse to order a grant + bet placed back-to-back.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AccessRequest(Base):
    """A non-member's request to join a group; approved by the group creator."""
    __tablename__ = "access_requests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[AccessStatus] = mapped_column(String, nullable=False, default=AccessStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Event(Base):
    """Append-only commit log of domain + telemetry events. Never mutated."""
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    # Client-side microsecond timestamp so back-to-back events order deterministically.
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    group_id: Mapped[str | None] = mapped_column(ForeignKey("groups.id"), nullable=True, index=True)
    market_id: Mapped[str | None] = mapped_column(ForeignKey("markets.id"), nullable=True, index=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class PushSubscription(Base):
    """A browser Web Push subscription owned by a user (one row per endpoint)."""
    __tablename__ = "push_subscriptions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(String, nullable=False)
    auth: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Snapshot(Base):
    """A point-in-time full dump of the domain tables, taken after each event.

    `data` is {table_name: [row_dicts]} with JSON-safe values (Decimals->str,
    datetimes->iso). Used to roll the whole app state back to a logged point.
    """
    __tablename__ = "snapshots"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    label: Mapped[str] = mapped_column(String, nullable=False)
    after_event_id: Mapped[str | None] = mapped_column(ForeignKey("events.id"), nullable=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class IdempotencyKey(Base):
    """Dedupe key for at-most-once mutations. A retried request carrying the same
    Idempotency-Key won't be processed (or logged) twice — the unique constraint
    makes concurrent duplicates race to a single winner."""
    __tablename__ = "idempotency_keys"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    key: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def record_event(
    db,
    type: str,
    actor_user_id: str | None = None,
    group_id: str | None = None,
    market_id: str | None = None,
    **payload,
) -> None:
    """Append a domain/telemetry event to the commit log."""
    db.add(
        Event(
            type=type,
            actor_user_id=actor_user_id,
            group_id=group_id,
            market_id=market_id,
            payload=payload,
        )
    )


def record_txn(db, membership: "Membership", delta: Decimal, kind: TxnKind, market_id: str | None = None) -> None:
    """Append a ledger entry, snapshotting the membership's current balance."""
    db.add(
        Transaction(
            group_id=membership.group_id,
            membership_id=membership.id,
            market_id=market_id,
            kind=kind.value if isinstance(kind, TxnKind) else kind,
            delta=delta,
            balance_after=membership.balance,
        )
    )
