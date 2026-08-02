from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# ---------- auth / users ----------
class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=4, max_length=200)


class LoginIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    id: str
    name: str
    api_token: str  # bearer credential — persist client-side to stay logged in


# ---------- groups ----------
class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    starting_credits: Decimal | None = None
    dispute_window_hours: int | None = Field(default=None, ge=0, le=168)
    rake: Decimal | None = Field(default=None, ge=0, le=Decimal("0.2"))


class MemberOut(BaseModel):
    membership_id: str
    user_id: str
    name: str
    balance: Decimal


class GroupOut(BaseModel):
    id: str
    name: str
    invite_code: str
    starting_credits: Decimal
    dispute_window_hours: int
    rake: Decimal
    members: list[MemberOut]


class GroupJoin(BaseModel):
    invite_code: str


# ---------- markets ----------
class MarketCreate(BaseModel):
    question: str = Field(min_length=3, max_length=280)
    closes_at: datetime
    rules: str | None = Field(default=None, max_length=2000)


class BetOut(BaseModel):
    id: str
    side: str
    amount: Decimal
    payout: Decimal | None
    member_name: str          # nickname when anonymous, else the real user name
    is_anonymous: bool
    created_at: datetime


class MarketOut(BaseModel):
    id: str
    group_id: str
    question: str
    rules: str | None
    evidence_url: str | None
    status: str
    closes_at: datetime
    proposer_name: str
    proposer_user_id: str | None
    yes_pool: Decimal
    no_pool: Decimal
    yes_prob: Decimal | None
    no_prob: Decimal | None
    proposed_outcome: str | None
    proposed_fraction: Decimal | None
    outcome: str | None
    outcome_fraction: Decimal | None
    bets: list[BetOut]


# ---------- bets / resolution ----------
class BetCreate(BaseModel):
    side: str = Field(pattern="^(YES|NO)$")
    amount: Decimal = Field(gt=0)
    anonymous: bool = False


class ResolveIn(BaseModel):
    outcome: str = Field(pattern="^(YES|NO|VOID|SCALAR)$")
    # Required when outcome == SCALAR: the YES side's share of the pot, 0–100.
    yes_percent: float | None = Field(default=None, ge=0, le=100)


class DisputeIn(BaseModel):
    reason: str = Field(min_length=3, max_length=280)


class VoteIn(BaseModel):
    choice: str = Field(pattern="^(YES|NO|VOID)$")


class MessageOut(BaseModel):
    detail: str


# ---------- ledger / P&L ----------
class PnlPoint(BaseModel):
    t: str          # ISO8601 timestamp
    balance: float


class PnlSeries(BaseModel):
    user_id: str
    name: str
    series: list[PnlPoint]


# ---------- previews / access requests ----------
class GroupPreview(BaseModel):
    id: str
    name: str
    member_count: int


class MarketPreview(BaseModel):
    market_id: str
    question: str
    group_id: str
    group_name: str
    is_member: bool


class AccessRequestOut(BaseModel):
    id: str
    user_id: str
    name: str
    created_at: datetime


class AccessRequestStatusOut(BaseModel):
    id: str
    group_id: str
    user_id: str
    status: str
    created_at: datetime


# ---------- events / telemetry ----------
class EventIn(BaseModel):
    type: str = Field(min_length=1, max_length=80)
    payload: dict | None = None


class OkOut(BaseModel):
    ok: bool


class TimelineItem(BaseModel):
    id: str
    ts: str  # ISO8601 timestamp
    type: str
    actor_name: str | None
    market_id: str | None
    payload: dict


# ---------- push notifications ----------
class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeIn(BaseModel):
    endpoint: str
    keys: PushKeys


class PushUnsubscribeIn(BaseModel):
    endpoint: str


class PublicKeyOut(BaseModel):
    public_key: str


# ---------- admin / commit log ----------
class AdminEventOut(BaseModel):
    id: str
    ts: str  # ISO8601 timestamp
    type: str
    actor_name: str | None
    group_id: str | None
    market_id: str | None
    payload: dict


class SnapshotOut(BaseModel):
    id: str
    created_at: str  # ISO8601 timestamp
    label: str
    after_event_id: str | None


class RollbackIn(BaseModel):
    snapshot_id: str


class RollbackOut(BaseModel):
    ok: bool
    restored: dict[str, int]


class AdminMeOut(BaseModel):
    is_admin: bool
