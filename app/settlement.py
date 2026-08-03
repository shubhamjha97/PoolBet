"""'Splitwise'-style debt simplification — pure functions, no DB.

Given each member's net position (positive = owed credits, negative = owes
credits), produce the MINIMAL set of transfers that settles everyone. The nets
must sum to ~0 (credits are conserved).
"""
from __future__ import annotations

# Half-a-cent: below this a net counts as settled.
_EPS = 0.005


def min_transfers(nets: dict[str, float]) -> list[tuple[str, str, float]]:
    """Greedily settle everyone with the fewest transfers.

    Repeatedly match the biggest debtor (most negative) to the biggest creditor
    (most positive), moving min(|debtor|, creditor) between them, until all nets
    are ~0. Returns a list of (from_id, to_id, amount) with amounts rounded to
    2 decimal places.
    """
    bal = {k: round(v, 2) for k, v in nets.items()}
    transfers: list[tuple[str, str, float]] = []

    while True:
        debtor = min(bal, key=lambda k: bal[k])
        creditor = max(bal, key=lambda k: bal[k])
        if bal[debtor] >= -_EPS or bal[creditor] <= _EPS:
            break
        amount = round(min(-bal[debtor], bal[creditor]), 2)
        if amount <= 0:
            break
        transfers.append((debtor, creditor, amount))
        bal[debtor] = round(bal[debtor] + amount, 2)
        bal[creditor] = round(bal[creditor] - amount, 2)

    return transfers
