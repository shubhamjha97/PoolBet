"""Shared rate limiter. A blanket per-IP default guards every route against
automated hammering; sensitive endpoints (auth) add tighter per-route limits.
Disabled in tests via POOLBET_RATELIMIT=0.
"""
import os

from slowapi import Limiter
from slowapi.util import get_remote_address

_enabled = os.environ.get("POOLBET_RATELIMIT", "1") != "0"

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["300/minute"],
    enabled=_enabled,
)
