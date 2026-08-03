"""Redpanda (Kafka API) producer — the durable, streaming commit log.

Every domain event is appended to a Redpanda topic (partitioned by group), so
the topic itself is an ordered, replayable commit log — the Kafka way. State
projections/rollback still use the local snapshot chain; Redpanda is the
authoritative event stream you can replay or fan out to other consumers.

Enabled only when REDPANDA_BROKERS is set (e.g. "localhost:9092"); otherwise a
graceful no-op so the app runs with zero infra. All calls are best-effort and
never raise into a request.

Run a broker locally:
    docker run -d --name redpanda -p 9092:9092 \\
      redpandadata/redpanda redpanda start --smp 1 --overprovisioned \\
      --node-id 0 --check=false --kafka-addr PLAINTEXT://0.0.0.0:9092 \\
      --advertise-kafka-addr PLAINTEXT://localhost:9092
    export REDPANDA_BROKERS=localhost:9092
"""
from __future__ import annotations

import json
import os
import threading

TOPIC = os.environ.get("REDPANDA_TOPIC", "poolbet.events")
BROKERS = os.environ.get("REDPANDA_BROKERS", "")

_producer = None            # None = uninitialized, False = disabled/failed
_lock = threading.Lock()


def _get_producer():
    global _producer
    if not BROKERS:
        return None
    if _producer is None:
        with _lock:
            if _producer is None:
                try:
                    from kafka import KafkaProducer

                    _producer = KafkaProducer(
                        bootstrap_servers=BROKERS.split(","),
                        value_serializer=lambda v: json.dumps(v, default=str).encode(),
                        acks=1,
                        retries=0,
                        request_timeout_ms=2000,
                        api_version_auto_timeout_ms=2000,
                    )
                except Exception:
                    _producer = False  # give up after a failed init; stay a no-op
    return _producer or None


def produce_event(event: dict) -> None:
    """Append one event to the Redpanda commit-log topic (best-effort)."""
    try:
        p = _get_producer()
        if p is None:
            return
        gid = event.get("group_id") or ""
        p.send(TOPIC, key=gid.encode() if gid else None, value=event)
    except Exception:
        pass
