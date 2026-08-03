import os

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, record_event
from ..ratelimit import limiter
from ..schemas import LoginIn, SignupIn, UserOut
from ..security import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _admin_names() -> set[str]:
    raw = os.environ.get("POOLBET_ADMIN_NAMES", "")
    return {n.strip().lower() for n in raw.split(",") if n.strip()}


@router.post("/signup", response_model=UserOut, status_code=201)
@limiter.limit("10/minute")
def signup(request: Request, body: SignupIn, db: Session = Depends(get_db)):
    """Create an account. Names are unique — a taken name is a 409, not a duplicate."""
    name = body.name.strip()
    existing = db.scalar(select(User).where(func.lower(User.name) == name.lower()))
    if existing:
        raise HTTPException(status_code=409, detail="that name is taken — log in instead")

    # Grant admin to the very first account, or any name in POOLBET_ADMIN_NAMES.
    is_first = db.scalar(select(func.count()).select_from(User)) == 0
    is_admin = is_first or name.lower() in _admin_names()

    user = User(name=name, password_hash=hash_password(body.password), is_admin=is_admin)
    db.add(user)
    db.flush()
    record_event(db, "user_signup", actor_user_id=user.id, method="password", actor_name=user.name)
    db.commit()
    db.refresh(user)
    return UserOut(id=user.id, name=user.name, api_token=user.api_token)


@router.post("/login", response_model=UserOut)
@limiter.limit("20/minute")
def login(request: Request, body: LoginIn, db: Session = Depends(get_db)):
    """Log back into an existing account by name + password."""
    user = db.scalar(select(User).where(func.lower(User.name) == body.name.strip().lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="wrong name or password")
    record_event(db, "user_login", actor_user_id=user.id, actor_name=user.name)
    db.commit()
    return UserOut(id=user.id, name=user.name, api_token=user.api_token)
