"""Google Sign-In (scaffold, env-gated).

Enabled only when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set in the env;
otherwise the routes return 503 so startup never crashes. On success we mint our
own api_token and hand it back to the SPA in the URL fragment.

NOTE: Apple Sign-In is intentionally NOT implemented. It requires a *paid* Apple
Developer account (a Services ID, a private key, and a per-request client-secret
JWT signed with ES256) plus a form_post callback — out of scope for this scaffold.
"""
import os
import secrets

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, record_event

router = APIRouter(prefix="/auth/google", tags=["auth"])

_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


def _client_id() -> str | None:
    return os.environ.get("GOOGLE_CLIENT_ID")


def _client_secret() -> str | None:
    return os.environ.get("GOOGLE_CLIENT_SECRET")


def _require_configured() -> None:
    if not (_client_id() and _client_secret()):
        raise HTTPException(status_code=503, detail="Google login not configured")


def _redirect_uri(request: Request) -> str:
    # Callback lives at this router's callback path on the current host.
    return str(request.url_for("google_callback"))


@router.get("/login")
def google_login(request: Request):
    _require_configured()
    state = secrets.token_urlsafe(16)
    params = {
        "client_id": _client_id(),
        "redirect_uri": _redirect_uri(request),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    url = httpx.URL(_AUTH_URL, params=params)
    return RedirectResponse(str(url))


@router.get("/callback", name="google_callback")
def google_callback(
    request: Request,
    code: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    _require_configured()
    if error or not code:
        raise HTTPException(status_code=400, detail=error or "missing authorization code")

    # Exchange the code for tokens, then read the OIDC userinfo.
    with httpx.Client(timeout=10.0) as http:
        token_resp = http.post(
            _TOKEN_URL,
            data={
                "code": code,
                "client_id": _client_id(),
                "client_secret": _client_secret(),
                "redirect_uri": _redirect_uri(request),
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="token exchange failed")
        access_token = token_resp.json().get("access_token")
        info = http.get(
            _USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
        ).json()

    sub = info.get("sub")
    email = info.get("email")
    name = info.get("name") or email or "Google User"
    if not sub:
        raise HTTPException(status_code=400, detail="no subject in Google profile")

    # Find or create: prefer google_sub, fall back to matching an existing email/name.
    user = db.scalar(select(User).where(User.google_sub == sub))
    created = False
    if not user and email:
        user = db.scalar(select(User).where(func.lower(User.name) == email.lower()))
    if user:
        if not user.google_sub:
            user.google_sub = sub
    else:
        # Ensure a unique display name.
        base = name
        candidate = base
        n = 1
        while db.scalar(select(User).where(func.lower(User.name) == candidate.lower())):
            n += 1
            candidate = f"{base} {n}"
        user = User(name=candidate, google_sub=sub)
        db.add(user)
        created = True
    db.flush()
    if created:
        record_event(db, "user_signup", actor_user_id=user.id, method="google")
    db.commit()
    db.refresh(user)

    # Hand the token to the SPA via the URL fragment; JS reads it and stores it.
    return RedirectResponse(url=f"/#/token={user.api_token}")
