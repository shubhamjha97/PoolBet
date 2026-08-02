"""Shared request dependencies: auth + membership lookup helpers."""
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Membership, User


def current_user(
    authorization: str | None = Header(default=None),
    x_api_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Authenticate via `Authorization: Bearer <token>` or `X-API-Token`."""
    token = x_api_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="missing API token")

    user = db.scalar(select(User).where(User.api_token == token))
    if not user:
        raise HTTPException(status_code=401, detail="invalid API token")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    """Gate admin-only endpoints. 403 unless the user has the admin flag."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="admin only")
    return user


def require_membership(db: Session, group_id: str, user: User) -> Membership:
    m = db.scalar(
        select(Membership).where(
            Membership.group_id == group_id, Membership.user_id == user.id
        )
    )
    if not m:
        raise HTTPException(status_code=403, detail="not a member of this group")
    return m
