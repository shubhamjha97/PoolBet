import asyncio
import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from ..database import SessionLocal
from ..live import broker
from ..models import Membership, User

router = APIRouter(tags=["live"])


@router.get("/groups/{group_id}/stream")
async def group_stream(group_id: str, token: str = Query(...)):
    """Server-Sent Events stream of a group's live activity. Members only.

    EventSource can't set Authorization headers, so the api_token is passed as a
    query param and validated here.
    """
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.api_token == token))
        if not user:
            raise HTTPException(status_code=401, detail="invalid token")
        member = db.scalar(
            select(Membership).where(
                Membership.group_id == group_id, Membership.user_id == user.id
            )
        )
        if not member:
            raise HTTPException(status_code=403, detail="not a member")

    async def gen():
        q = broker.add(group_id)
        try:
            yield "retry: 3000\n\n"  # tell EventSource to reconnect after 3s
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=20)
                    yield f"data: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"  # comment heartbeat keeps the connection warm
        finally:
            broker.remove(group_id, q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
