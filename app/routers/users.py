from fastapi import APIRouter, Depends

from ..deps import current_user
from ..models import User
from ..schemas import UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    """Who am I? Used by the client to restore a session from a stored token."""
    return UserOut(id=user.id, name=user.name, api_token=user.api_token)
