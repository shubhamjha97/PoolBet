"""Parimutuel settlement engine — pure functions, no DB.

The whole economic model lives here so it can be unit-tested in isolation and
stays server-authoritative. A "market" is a pool: everyone stakes on YES or NO,
and when it resolves the winning side splits the *entire* pot in proportion to
their stake (minus an optional house rake).
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal

CENT = Decimal("0.01")


@dataclass(frozen=True)
class StakeIn:
    """A single stake going into settlement."""
    bet_id: str
    side: str        # "YES" | "NO"
    amount: Decimal


@dataclass(frozen=True)
class Odds:
    yes_pool: Decimal
    no_pool: Decimal
    total: Decimal
    # Implied probability of YES = yes_pool / total (the group's crowd estimate).
    yes_prob: Decimal | None
    no_prob: Decimal | None


def compute_odds(stakes: list[StakeIn]) -> Odds:
    yes_pool = sum((s.amount for s in stakes if s.side == "YES"), Decimal("0"))
    no_pool = sum((s.amount for s in stakes if s.side == "NO"), Decimal("0"))
    total = yes_pool + no_pool
    if total == 0:
        return Odds(Decimal("0"), Decimal("0"), Decimal("0"), None, None)
    yes_prob = (yes_pool / total).quantize(Decimal("0.0001"))
    return Odds(yes_pool, no_pool, total, yes_prob, Decimal("1.0000") - yes_prob)


def _refund_all(stakes: list[StakeIn]) -> dict[str, Decimal]:
    return {s.bet_id: s.amount for s in stakes}


def _distribute(payouts: dict[str, Decimal], side: list[StakeIn], pool: Decimal, target: Decimal) -> None:
    """Split `target` credits among `side` pro-rata to stake, in place.

    Any sub-cent rounding remainder goes to the largest stake (ties broken by
    bet_id) so the side's payouts sum to exactly `target`.
    """
    if target <= 0 or pool <= 0 or not side:
        return
    allocated = Decimal("0")
    for s in side:
        p = ((s.amount / pool) * target).quantize(CENT, rounding=ROUND_DOWN)
        payouts[s.bet_id] = p
        allocated += p
    remainder = target - allocated
    if remainder > 0:
        top = max(side, key=lambda s: (s.amount, s.bet_id))
        payouts[top.bet_id] += remainder


def settle(
    stakes: list[StakeIn],
    outcome: str,
    rake: Decimal = Decimal("0"),
    yes_fraction: Decimal | float | str | None = None,
) -> dict[str, Decimal]:
    """Return {bet_id: payout} for the given outcome.

    Outcomes:
      * "YES" / "NO"  -> the whole (post-rake) pot goes to that side (== 100% / 0%).
      * "SCALAR"      -> fractional settlement: the YES side collectively takes
                         `yes_fraction` (0..1) of the post-rake pot and the NO side
                         takes the rest, each split pro-rata within the side. So a
                         "losing" side can still recover part of its stake.
      * "VOID"        -> refund every stake (rake never applies).

    Refund-all guards (return every stake untouched):
      * VOID, or
      * one-sided market — either side has no stakes (no counterparty exists).

    Conservation: sum(payouts) == total pot minus the rake actually taken.
    """
    if outcome not in ("YES", "NO", "VOID", "SCALAR"):
        raise ValueError(f"invalid outcome: {outcome!r}")

    if outcome == "VOID":
        return _refund_all(stakes)

    if outcome == "YES":
        p = Decimal("1")
    elif outcome == "NO":
        p = Decimal("0")
    else:  # SCALAR
        if yes_fraction is None:
            raise ValueError("SCALAR outcome requires yes_fraction")
        p = Decimal(str(yes_fraction))
        if p < 0 or p > 1:
            raise ValueError(f"yes_fraction must be in [0, 1], got {p}")

    odds = compute_odds(stakes)

    # One-sided market -> no counterparty on either arm -> refund everyone.
    if odds.yes_pool == 0 or odds.no_pool == 0:
        return _refund_all(stakes)

    rake_amount = (odds.total * rake).quantize(CENT, rounding=ROUND_DOWN)
    distributable = odds.total - rake_amount

    # Split the pot between the two arms by the fraction, conserving exactly.
    yes_target = (distributable * p).quantize(CENT, rounding=ROUND_DOWN)
    no_target = distributable - yes_target

    payouts: dict[str, Decimal] = {s.bet_id: Decimal("0") for s in stakes}
    _distribute(payouts, [s for s in stakes if s.side == "YES"], odds.yes_pool, yes_target)
    _distribute(payouts, [s for s in stakes if s.side == "NO"], odds.no_pool, no_target)
    return payouts


def outcome_pools(stakes: list[StakeIn]) -> dict[str, Decimal]:
    """Total staked on each outcome label (for N-way markets; `side` holds the label)."""
    pools: dict[str, Decimal] = {}
    for s in stakes:
        pools[s.side] = pools.get(s.side, Decimal("0")) + s.amount
    return pools


def settle_multi(
    stakes: list[StakeIn],
    winning: str,
    rake: Decimal = Decimal("0"),
) -> dict[str, Decimal]:
    """N-way parimutuel: everyone who staked on `winning` splits the entire
    (post-rake) pot pro-rata to their stake; everyone else gets nothing. `side`
    on each StakeIn carries the outcome label.

    Refund-all guards (rake never applies): no stakes, no one on the winning
    outcome, or everyone on the winning outcome (no counterparty).

    Conservation: sum(payouts) == total pot minus the rake actually taken.
    """
    total = sum((s.amount for s in stakes), Decimal("0"))
    winners = [s for s in stakes if s.side == winning]
    win_pool = sum((s.amount for s in winners), Decimal("0"))
    if total == 0 or win_pool == 0 or win_pool == total:
        return _refund_all(stakes)

    rake_amount = (total * rake).quantize(CENT, rounding=ROUND_DOWN)
    distributable = total - rake_amount

    payouts: dict[str, Decimal] = {s.bet_id: Decimal("0") for s in stakes}
    _distribute(payouts, winners, win_pool, distributable)
    return payouts
