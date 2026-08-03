"""In-process pub/sub for live activity (SSE).

Events are recorded in sync request handlers (worker threads); SSE streams run on
the asyncio loop. `publish` bridges the two via loop.call_soon_threadsafe, so a
bet placed by one member fans out to every member watching that group's stream.
Single-process only (fine for one uvicorn worker); swap for Redis/Redpanda to scale.
"""
from __future__ import annotations

import asyncio
from typing import Any


class Broker:
    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def add(self, group_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._subs.setdefault(group_id, set()).add(q)
        return q

    def remove(self, group_id: str, q: asyncio.Queue) -> None:
        subs = self._subs.get(group_id)
        if subs:
            subs.discard(q)
            if not subs:
                self._subs.pop(group_id, None)

    def publish(self, group_id: str, data: dict[str, Any]) -> None:
        loop = self._loop
        if loop is None or not group_id:
            return

        def _put() -> None:
            for q in list(self._subs.get(group_id, ())):
                try:
                    q.put_nowait(data)
                except asyncio.QueueFull:
                    pass

        try:
            loop.call_soon_threadsafe(_put)
        except RuntimeError:
            pass


broker = Broker()
