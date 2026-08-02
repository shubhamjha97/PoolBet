# PoolBet 🎲

Parimutuel prediction markets for friend groups. Everyone pools credits, anyone
proposes a YES/NO market, people bet against each other, and when it resolves the
**winning side splits the entire pot** in proportion to their stake.

- **Parimutuel** — no order book, no liquidity provider. Odds emerge from the pool:
  implied P(YES) = `yes_pool / (yes_pool + no_pool)`.
- **Play credits** — no real money, so no gambling/payments legal surface.
- **Trust-but-verify resolution** — the market's proposer marks the outcome, then a
  **dispute window** opens. Undisputed → it settles. Disputed → it goes to a group vote.

## Stack

FastAPI + SQLAlchemy. Runs zero-config on **SQLite**; point `DATABASE_URL` at
**Postgres** for production. The economic model is an isolated, unit-tested module
(`app/engine.py`) so the settlement math stays server-authoritative.

## Run locally

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open **http://localhost:8000/docs** for the interactive API.

## Database migrations (Alembic)

The app still boots by calling `Base.metadata.create_all` on startup, so no
migration step is required for local/dev use. Alembic is provided **additively**
for managed schema changes. `env.py` is wired to `app.database.Base.metadata` and
reads the same `DATABASE_URL` as the app.

```bash
alembic upgrade head          # apply migrations to DATABASE_URL (defaults to sqlite)
alembic revision --autogenerate -m "describe change"   # after editing models
```

The `baseline` migration represents the full current schema.

## Push notifications (Web Push / VAPID)

VAPID keys are read from `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
if set, otherwise generated once and persisted to `.vapid.json` so they are stable
across restarts. The browser fetches the key from `GET /push/public-key`.

## Test

```bash
pytest -q
```

Covers the parimutuel engine (proportional splits, rake, VOID/one-sided/no-winner
refunds, credit conservation under rounding) and the full API lifecycle.

## Core flow

```
POST /users                          -> create user, get API token
POST /groups                         -> create group + pool in (creator auto-joins)
POST /groups/join                    -> join by invite code, receive starting credits
POST /groups/{id}/markets            -> propose a YES/NO market with a close time
POST /markets/{id}/bets              -> stake YES or NO (draws down your balance)
POST /markets/{id}/resolve           -> proposer marks outcome (opens dispute window)
POST /markets/{id}/dispute           -> any member contests -> escalates to a vote
POST /markets/{id}/vote              -> members vote on a disputed market
POST /markets/{id}/settle            -> finalize: credit payouts to winners
GET  /groups/{id}/leaderboard        -> season standings by balance
```

Authenticate every request except `POST /users` with either header:

```
Authorization: Bearer <api_token>
X-API-Token: <api_token>
```

## Market lifecycle

```
OPEN ──(closes_at passes, proposer resolves)──▶ RESOLVING
                                                   │
                        ┌──────────────────────────┴───────────────┐
                (no dispute, window elapses)                 (member disputes)
                        │                                          │
                        ▼                                          ▼
                    RESOLVED  ◀──(settle: majority vote)──      DISPUTED
```

## Settlement rules (`app/engine.py`)

| Situation | Result |
|---|---|
| Normal | Winners split the post-rake pot pro-rata; losers get 0 |
| `VOID` | Everyone refunded |
| No stakes on the winning side | Everyone refunded |
| One-sided market (no counterparty) | Everyone refunded |

Payouts are computed in `Decimal` and any sub-cent rounding remainder is handed to
the largest winning stake, so credits are never created or destroyed.
