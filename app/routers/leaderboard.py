"""Group leaderboard: standings ranked by realized P&L, plus per-member win/loss
records, hot streaks, and earned badges.

Mirrors the settlement handler's realized-net math (balance minus GRANT deltas,
plus stake still locked in unresolved markets) so open bets aren't scored as
losses, and derives wins/losses/streaks from the Transaction ledger (BET/PAYOUT
rows carry a market_id) the way `_apply_settlement` records them.
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_membership
from ..models import (
    Bet,
    Group,
    Market,
    MarketStatus,
    Membership,
    Transaction,
    TxnKind,
    User,
)

router = APIRouter(prefix="/groups", tags=["leaderboard"])


class LeaderboardEntry(BaseModel):
    user_id: str
    name: str
    balance: str          # credits, fixed 2dp (kept a string for exact money display)
    pnl: float            # realized net: balance - grants + stake locked in open markets
    roi: float            # pnl / total granted (0 when nothing granted)
    wins: int
    losses: int
    streak: int           # consecutive most-recent resolved markets profited on
    badges: list[str]


def _money(v: Decimal) -> str:
    return str(Decimal(v).quantize(Decimal("0.01")))


@router.get("/{group_id}/leaderboard", response_model=list[LeaderboardEntry])
def group_leaderboard(
    group_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Ranked standings (best P&L first) with win/loss records, streaks + badges.

    Members only. 404 if the group is missing, 403 for non-members.
    """
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="group not found")
    require_membership(db, group_id, user)

    members = db.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(Membership.group_id == group_id)
    ).all()

    # Total credits granted per membership (GRANT ledger deltas).
    grant_rows = db.execute(
        select(Transaction.membership_id, func.coalesce(func.sum(Transaction.delta), 0))
        .where(
            Transaction.group_id == group_id,
            Transaction.kind == TxnKind.GRANT.value,
        )
        .group_by(Transaction.membership_id)
    ).all()
    granted = {mid: Decimal(v) for mid, v in grant_rows}

    # Stake still locked in markets that haven't resolved (add back to realized net).
    open_stake_rows = db.execute(
        select(Bet.membership_id, func.coalesce(func.sum(Bet.amount), 0))
        .join(Market, Market.id == Bet.market_id)
        .join(Membership, Membership.id == Bet.membership_id)
        .where(
            Membership.group_id == group_id,
            Market.status != MarketStatus.RESOLVED,
        )
        .group_by(Bet.membership_id)
    ).all()
    open_stake = {mid: Decimal(v) for mid, v in open_stake_rows}

    # Per (membership, market) net from the ledger: sum of BET (negative) + PAYOUT
    # (positive) deltas == payouts collected minus stakes wagered on that market.
    net_rows = db.execute(
        select(
            Transaction.membership_id,
            Transaction.market_id,
            func.coalesce(func.sum(Transaction.delta), 0),
        )
        .where(
            Transaction.group_id == group_id,
            Transaction.market_id.isnot(None),
            Transaction.kind.in_([TxnKind.BET.value, TxnKind.PAYOUT.value]),
        )
        .group_by(Transaction.membership_id, Transaction.market_id)
    ).all()

    # Largest single winning payout per membership (for the "whale" badge).
    payout_rows = db.execute(
        select(Transaction.membership_id, func.max(Transaction.delta))
        .where(
            Transaction.group_id == group_id,
            Transaction.kind == TxnKind.PAYOUT.value,
        )
        .group_by(Transaction.membership_id)
    ).all()
    best_payout = {mid: Decimal(v) for mid, v in payout_rows if v is not None}

    # Resolved markets: order key (for streaks) + winning outcome.
    resolved = db.execute(
        select(Market.id, Market.outcome, Market.resolved_at, Market.created_at)
        .where(Market.group_id == group_id, Market.status == MarketStatus.RESOLVED)
    ).all()
    resolved_ids = {mid for mid, _o, _r, _c in resolved}
    order_key = {mid: (r or c) for mid, _o, r, c in resolved}
    outcome_by = {mid: o for mid, o, _r, _c in resolved}

    # Staked totals per side, per resolved market (to spot the minority side).
    pool_rows = db.execute(
        select(Bet.market_id, Bet.side, func.coalesce(func.sum(Bet.amount), 0))
        .join(Market, Market.id == Bet.market_id)
        .where(Market.group_id == group_id, Market.status == MarketStatus.RESOLVED)
        .group_by(Bet.market_id, Bet.side)
    ).all()
    pools: dict[str, dict[str, Decimal]] = {}
    for mkt, side, amt in pool_rows:
        pools.setdefault(mkt, {})[side] = Decimal(amt)

    def _minority_win(mkt: str) -> bool:
        """True when the market's winning side had strictly less stake than the loser."""
        winner = outcome_by.get(mkt)
        if winner not in ("YES", "NO"):
            return False
        loser = "NO" if winner == "YES" else "YES"
        p = pools.get(mkt, {})
        return p.get(winner, Decimal(0)) < p.get(loser, Decimal(0))

    # Nets grouped by membership, limited to resolved markets.
    nets_by_member: dict[str, list[tuple[str, Decimal]]] = {}
    for mid, mkt, net in net_rows:
        if mkt in resolved_ids:
            nets_by_member.setdefault(mid, []).append((mkt, Decimal(net)))

    entries: list[dict] = []
    for m, u in members:
        pnl = (
            m.balance
            - granted.get(m.id, Decimal(0))
            + open_stake.get(m.id, Decimal(0))
        )
        g = granted.get(m.id, Decimal(0))
        roi = float(pnl / g) if g else 0.0

        resolved_nets = nets_by_member.get(m.id, [])
        wins = sum(1 for _mkt, net in resolved_nets if net > 0)
        losses = sum(1 for _mkt, net in resolved_nets if net < 0)

        # Streak: most-recent resolved markets first, count leading profits.
        streak = 0
        for _mkt, net in sorted(
            resolved_nets, key=lambda t: order_key.get(t[0]), reverse=True
        ):
            if net > 0:
                streak += 1
            else:
                break

        contrarian = any(
            net > 0 and _minority_win(mkt) for mkt, net in resolved_nets
        )

        entries.append(
            {
                "user_id": u.id,
                "name": u.name,
                "balance": _money(m.balance),
                "pnl": round(float(pnl), 2),
                "roi": round(roi, 4),
                "wins": wins,
                "losses": losses,
                "streak": streak,
                "membership_id": m.id,
                "contrarian": contrarian,
            }
        )

    # ---- badges, computed across the group ----
    max_pnl = max((e["pnl"] for e in entries), default=0.0)
    max_roi = max((e["roi"] for e in entries), default=0.0)
    whale_amt = max(best_payout.values(), default=Decimal(0))

    for e in entries:
        badges: list[str] = []
        if max_pnl > 0 and e["pnl"] == max_pnl:
            badges.append("leader")
        if e["streak"] >= 3:
            badges.append("hot")
        if max_roi > 0 and e["roi"] == max_roi:
            badges.append("sharp")
        if whale_amt > 0 and best_payout.get(e["membership_id"], Decimal(0)) == whale_amt:
            badges.append("whale")
        if e["contrarian"]:
            badges.append("contrarian")
        e["badges"] = badges
        del e["membership_id"]
        del e["contrarian"]

    entries.sort(key=lambda e: e["pnl"], reverse=True)
    return [LeaderboardEntry(**e) for e in entries]
