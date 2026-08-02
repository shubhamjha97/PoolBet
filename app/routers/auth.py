from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import LoginIn, SignupIn, UserOut
from ..security import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=UserOut, status_code=201)
def signup(body: SignupIn, db: Session = Depends(get_db)):
    """Create an account. Names are unique — a taken name is a 409, not a duplicate."""
    name = body.name.strip()
    existing = db.scalar(select(User).where(func.lower(User.name) == name.lower()))
    if existing:
        raise HTTPException(status_code=409, detail="that name is taken — log in instead")

    user = User(name=name, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut(id=user.id, name=user.name, api_token=user.api_token)


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    """Log back into an existing account by name + password."""
    user = db.scalar(select(User).where(func.lower(User.name) == body.name.strip().lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="wrong name or password")
    return UserOut(id=user.id, name=user.name, api_token=user.api_token)
