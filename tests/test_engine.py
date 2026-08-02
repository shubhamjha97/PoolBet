from decimal import Decimal

from app.engine import StakeIn, compute_odds, settle


def S(bet_id, side, amount):
    return StakeIn(bet_id=bet_id, side=side, amount=Decimal(str(amount)))


def test_odds_reflect_pool_shares():
    stakes = [S("a", "YES", 200), S("b", "NO", 100)]
    odds = compute_odds(stakes)
    assert odds.yes_pool == Decimal("200")
    assert odds.no_pool == Decimal("100")
    assert odds.total == Decimal("300")
    assert odds.yes_prob == Decimal("0.6667")
    assert odds.no_prob == Decimal("0.3333")


def test_empty_market_has_no_odds():
    odds = compute_odds([])
    assert odds.yes_prob is None and odds.no_prob is None


def test_basic_proportional_split():
    # YES pool 200 (a=20, c=180), NO pool 100. Outcome YES -> YES splits 300.
    stakes = [S("a", "YES", 20), S("c", "YES", 180), S("b", "NO", 100)]
    payouts = settle(stakes, "YES")
    assert payouts["a"] == Decimal("30.00")   # 20/200 * 300
    assert payouts["c"] == Decimal("270.00")  # 180/200 * 300
    assert payouts["b"] == Decimal("0")
    # conservation: total in == total out
    assert sum(payouts.values()) == Decimal("300.00")


def test_void_refunds_everyone():
    stakes = [S("a", "YES", 20), S("b", "NO", 100)]
    payouts = settle(stakes, "VOID")
    assert payouts == {"a": Decimal("20"), "b": Decimal("100")}


def test_no_winners_refunds_everyone():
    # Everyone bet NO, but outcome is YES -> nobody to pay, refund all.
    stakes = [S("a", "NO", 20), S("b", "NO", 100)]
    payouts = settle(stakes, "YES")
    assert payouts == {"a": Decimal("20"), "b": Decimal("100")}


def test_one_sided_market_refunds_everyone():
    # Only YES stakes; no counterparty -> refund all even though YES wins.
    stakes = [S("a", "YES", 20), S("b", "YES", 100)]
    payouts = settle(stakes, "YES")
    assert payouts == {"a": Decimal("20"), "b": Decimal("100")}


def test_rake_is_taken_from_pot():
    stakes = [S("a", "YES", 100), S("b", "NO", 100)]
    payouts = settle(stakes, "YES", rake=Decimal("0.05"))
    # pot 200, rake 10 -> winner gets 190
    assert payouts["a"] == Decimal("190.00")
    assert payouts["b"] == Decimal("0")
    assert sum(payouts.values()) == Decimal("190.00")


def test_conservation_with_rounding_remainder():
    # 3-way winning split of a pot that doesn't divide evenly.
    stakes = [
        S("a", "YES", 10),
        S("b", "YES", 10),
        S("c", "YES", 10),
        S("d", "NO", 1),
    ]
    payouts = settle(stakes, "YES")
    total_pot = Decimal("31.00")
    # No credits created or destroyed despite the awkward division.
    assert sum(payouts.values()) == total_pot
    # Remainder goes to the largest winner (tie broken by bet_id -> "c").
    assert payouts["c"] >= payouts["a"]


def test_scalar_splits_pot_by_fraction():
    # YES 200 (a=20,c=180), NO 100. Resolve at YES 65%.
    stakes = [S("a", "YES", 20), S("c", "YES", 180), S("b", "NO", 100)]
    payouts = settle(stakes, "SCALAR", yes_fraction=Decimal("0.65"))
    # YES side splits 0.65*300 = 195; NO side splits 0.35*300 = 105.
    assert payouts["a"] == Decimal("19.50")   # 20/200 * 195
    assert payouts["c"] == Decimal("175.50")  # 180/200 * 195
    assert payouts["b"] == Decimal("105.00")  # sole NO gets the whole NO arm
    assert sum(payouts.values()) == Decimal("300.00")  # fully conserved


def test_scalar_endpoints_match_binary():
    stakes = [S("a", "YES", 100), S("b", "NO", 100)]
    assert settle(stakes, "SCALAR", yes_fraction=Decimal("1")) == settle(stakes, "YES")
    assert settle(stakes, "SCALAR", yes_fraction=Decimal("0")) == settle(stakes, "NO")


def test_scalar_one_sided_refunds():
    stakes = [S("a", "YES", 100), S("b", "YES", 50)]
    assert settle(stakes, "SCALAR", yes_fraction=Decimal("0.5")) == {"a": Decimal("100"), "b": Decimal("50")}


def test_scalar_requires_and_validates_fraction():
    stakes = [S("a", "YES", 1), S("b", "NO", 1)]
    for bad in (None, Decimal("1.5"), Decimal("-0.1")):
        try:
            settle(stakes, "SCALAR", yes_fraction=bad)
            assert False, f"expected ValueError for {bad}"
        except ValueError:
            pass


def test_invalid_outcome_raises():
    try:
        settle([S("a", "YES", 1)], "MAYBE")
        assert False, "expected ValueError"
    except ValueError:
        pass
