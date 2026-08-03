from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..models import Membership, Transaction, TxnKind, User
from ..schemas import PortfolioPoint, PortfolioSeries, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    """Who am I? Used by the client to restore a session from a stored token."""
    return UserOut(id=user.id, name=user.name, api_token=user.api_token)


@router.get("/me/portfolio", response_model=PortfolioSeries)
def my_portfolio(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """The user's total credits over time across every group. A running sum of
    all their ledger deltas equals their total holdings at each point, since each
    membership starts at zero and every grant/bet/payout is a delta."""
    rows = db.execute(
        select(Transaction.created_at, Transaction.delta, Transaction.kind)
        .join(Membership, Membership.id == Transaction.membership_id)
        .where(Membership.user_id == user.id)
        .order_by(Transaction.created_at.asc(), Transaction.id.asc())
    ).all()

    points: list[PortfolioPoint] = []
    running = Decimal("0")
    granted = Decimal("0")
    for created_at, delta, kind in rows:
        running += delta
        if kind == TxnKind.GRANT.value:
            granted += delta
        points.append(PortfolioPoint(t=created_at.isoformat(), v=float(running)))

    return PortfolioSeries(
        points=points,
        balance=float(running),
        start=float(granted),
        pnl=float(running - granted),
    )
