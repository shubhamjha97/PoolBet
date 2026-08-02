"""Snapshot chain + rollback — the Event log is the source of truth for state.

After every commit that appended an Event, we persist a full dump of the domain
tables as a Snapshot. `rollback_to` restores the whole domain state from one of
those snapshots, so the app can be rewound to any logged point. Snapshots are
pruned to the most recent MAX_SNAPSHOTS.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, event, func, select

from .database import SessionLocal
from .models import (
    AccessRequest,
    Bet,
    Dispute,
    Event,
    Group,
    Market,
    Membership,
    PushSubscription,
    Snapshot,
    Transaction,
    User,
    Vote,
    record_event,
)

MAX_SNAPSHOTS = 100

# Domain tables in FK order (parents first). Insert in this order, delete in reverse.
# Everything EXCEPT the snapshots table itself.
_DOMAIN_MODELS = [
    User,
    Group,
    Membership,
    Market,
    Bet,
    Dispute,
    Vote,
    Transaction,
    AccessRequest,
    Event,
    PushSubscription,
]


def _json_safe(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _row_dict(model, obj) -> dict:
    return {c.name: _json_safe(getattr(obj, c.name)) for c in model.__table__.columns}


def _coerce_row(model, row: dict) -> dict:
    """Turn JSON-safe values back into the column's Python type for re-insert."""
    out = {}
    for c in model.__table__.columns:
        val = row.get(c.name)
        if val is not None and isinstance(val, str):
            if isinstance(c.type, DateTime):
                val = datetime.fromisoformat(val)
            elif isinstance(c.type, Numeric):
                val = Decimal(val)
        out[c.name] = val
    return out


def _dump_tables(db) -> dict:
    data = {}
    for model in _DOMAIN_MODELS:
        rows = db.scalars(select(model)).all()
        data[model.__tablename__] = [_row_dict(model, r) for r in rows]
    return data


def _prune(db) -> None:
    keep = [
        s.id
        for s in db.scalars(
            select(Snapshot).order_by(Snapshot.created_at.desc(), Snapshot.id.desc()).limit(MAX_SNAPSHOTS)
        ).all()
    ]
    if keep:
        db.query(Snapshot).filter(~Snapshot.id.in_(keep)).delete(synchronize_session=False)


def snapshot_state(db, label: str, after_event_id: str | None = None) -> Snapshot:
    """Serialize the domain tables into a new Snapshot row (does not commit)."""
    snap = Snapshot(label=label, after_event_id=after_event_id, data=_dump_tables(db))
    db.add(snap)
    db.flush()
    _prune(db)
    return snap


def rollback_to(db, snapshot_id: str) -> dict:
    """Restore full domain state from a snapshot, then log a 'rollback' Event.

    Returns {table_name: restored_row_count}.
    """
    snap = db.get(Snapshot, snapshot_id)
    if snap is None:
        raise KeyError(snapshot_id)
    data = snap.data or {}

    # Wipe domain tables (children first), then re-insert (parents first).
    for model in reversed(_DOMAIN_MODELS):
        db.execute(model.__table__.delete())

    restored: dict[str, int] = {}
    for model in _DOMAIN_MODELS:
        rows = data.get(model.__tablename__, [])
        restored[model.__tablename__] = len(rows)
        if rows:
            db.execute(model.__table__.insert(), [_coerce_row(model, r) for r in rows])

    # The commit log keeps moving forward: append a rollback Event (ORM add, so the
    # after-commit listener snapshots the freshly-restored state too).
    record_event(db, "rollback", snapshot_id=snapshot_id, label=snap.label)
    return restored


# ---------------------------------------------------------------------------
# Auto-snapshot: after any commit that appended Event rows, persist a snapshot.
# ---------------------------------------------------------------------------
@event.listens_for(SessionLocal, "after_flush")
def _track_new_events(session, flush_context):
    new = [(o.id, o.type) for o in session.new if isinstance(o, Event)]
    if new:
        session.info.setdefault("_new_events", []).extend(new)


@event.listens_for(SessionLocal, "after_commit")
def _snapshot_after_commit(session):
    pending = session.info.pop("_new_events", None)
    if not pending:
        return
    last_id, last_type = pending[-1]
    # Snapshot the just-committed state in a fresh session so we dump durable rows.
    with SessionLocal() as s2:
        try:
            snapshot_state(s2, label=f"auto:{last_type}", after_event_id=last_id)
            s2.commit()
        except Exception:
            s2.rollback()
