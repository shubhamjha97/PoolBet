"""Web Push (VAPID) support: stable key management + best-effort sends.

VAPID keys come from env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT)
or are generated once and persisted to .vapid.json so they survive restarts.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid02
from pywebpush import WebPushException, webpush
from sqlalchemy import select

from .models import PushSubscription

_VAPID_FILE = Path(__file__).resolve().parent.parent / ".vapid.json"

# Module-level cache, populated by init_vapid() at startup.
_public_key: str | None = None
_vapid: Vapid02 | None = None
_subject: str = "mailto:admin@poolbet.local"


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _application_server_key(vapid: Vapid02) -> str:
    """The base64url-encoded uncompressed public point browsers subscribe with."""
    raw = vapid.public_key.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    return _b64url(raw)


def _raw_private(vapid: Vapid02) -> str:
    priv = vapid.private_key.private_numbers().private_value
    return _b64url(priv.to_bytes(32, "big"))


def init_vapid() -> None:
    """Load/generate VAPID keys once. Safe to call multiple times."""
    global _public_key, _vapid, _subject

    _subject = os.environ.get("VAPID_SUBJECT", _subject)

    env_priv = os.environ.get("VAPID_PRIVATE_KEY")
    if env_priv:
        vapid = Vapid02.from_raw(env_priv.strip().encode())
        _vapid = vapid
        _public_key = os.environ.get("VAPID_PUBLIC_KEY") or _application_server_key(vapid)
        return

    # Persisted keypair (generate + write on first run).
    if _VAPID_FILE.exists():
        data = json.loads(_VAPID_FILE.read_text())
        vapid = Vapid02.from_raw(data["private_key"].encode())
        _vapid = vapid
        _public_key = data.get("public_key") or _application_server_key(vapid)
        return

    vapid = Vapid02()
    vapid.generate_keys()
    _vapid = vapid
    _public_key = _application_server_key(vapid)
    _VAPID_FILE.write_text(
        json.dumps(
            {"public_key": _public_key, "private_key": _raw_private(vapid)}, indent=2
        )
    )


def public_key() -> str:
    if _public_key is None:
        init_vapid()
    return _public_key or ""


def send_push_to_users(db, user_ids, title: str, body: str, url: str = "/") -> None:
    """Best-effort push to every subscription of the given users.

    Never raises: individual failures are swallowed; a 404/410 (gone) prunes the
    dead subscription. Callers should still wrap this in try/except defensively.
    """
    if _vapid is None:
        init_vapid()
    if _vapid is None or not user_ids:
        return

    payload = json.dumps({"title": title, "body": body, "url": url})
    subs = db.scalars(
        select(PushSubscription).where(PushSubscription.user_id.in_(list(user_ids)))
    ).all()

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=_vapid,
                vapid_claims={"sub": _subject},
            )
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):
                db.delete(sub)
        except Exception:
            # Network / encoding issue — swallow, pushes are non-critical.
            pass

    try:
        db.commit()
    except Exception:
        db.rollback()
