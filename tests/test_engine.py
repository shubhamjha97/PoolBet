from decimal import Decimal

from app.engine import StakeIn, compute_odds, outcome_pools, settle, settle_multi


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


def test_scalar_with_rake_conserves():
    # pot 200, rake 10% -> distributable 180; YES arm 0.7*180=126, NO arm 54.
    stakes = [S("a", "YES", 100), S("b", "NO", 100)]
    payouts = settle(stakes, "SCALAR", rake=Decimal("0.1"), yes_fraction=Decimal("0.7"))
    assert payouts["a"] == Decimal("126.00")
    assert payouts["b"] == Decimal("54.00")
    assert sum(payouts.values()) == Decimal("180.00")  # pot minus rake


def test_many_bettors_conserved_to_the_cent():
    stakes = [S(f"y{i}", "YES", 7) for i in range(9)] + [S("n", "NO", 13)]
    payouts = settle(stakes, "YES")
    assert sum(payouts.values()) == Decimal("76.00")  # 9*7 + 13, nothing lost


def test_invalid_outcome_raises():
    try:
        settle([S("a", "YES", 1)], "MAYBE")
        assert False, "expected ValueError"
    except ValueError:
        pass


# ---------- N-way (multiple-choice) markets ----------
def test_outcome_pools_sums_per_label():
    stakes = [S("a", "Alice", 300), S("b", "Alice", 100), S("c", "Bob", 200)]
    pools = outcome_pools(stakes)
    assert pools == {"Alice": Decimal("400"), "Bob": Decimal("200")}


def test_settle_multi_winner_splits_post_rake_pot():
    # Alice pool 400 (a=300,b=100), Bob 200, Carol 100 -> total 700. Alice wins, 5% rake.
    stakes = [S("a", "Alice", 300), S("b", "Alice", 100), S("c", "Bob", 200), S("d", "Carol", 100)]
    payouts = settle_multi(stakes, "Alice", rake=Decimal("0.05"))
    # rake = 700*0.05 = 35 -> distributable 665, split within Alice's 400 pool.
    assert payouts["a"] == Decimal("498.75")   # 300/400 * 665
    assert payouts["b"] == Decimal("166.25")   # 100/400 * 665
    assert payouts["c"] == Decimal("0")
    assert payouts["d"] == Decimal("0")
    assert sum(payouts.values()) == Decimal("665.00")  # total minus rake taken


def test_settle_multi_no_winner_refunds_and_ignores_rake():
    stakes = [S("a", "Alice", 300), S("b", "Bob", 200)]
    payouts = settle_multi(stakes, "Carol", rake=Decimal("0.05"))  # nobody picked Carol
    assert payouts == {"a": Decimal("300"), "b": Decimal("200")}   # full refund, no rake


def test_settle_multi_one_sided_refunds():
    stakes = [S("a", "Alice", 300), S("b", "Alice", 100)]  # everyone on the winner, no counterparty
    payouts = settle_multi(stakes, "Alice", rake=Decimal("0.05"))
    assert payouts == {"a": Decimal("300"), "b": Decimal("100")}


def test_settle_multi_conserved_to_the_cent_with_rake():
    stakes = [S(f"w{i}", "Win", 33) for i in range(7)] + [S(f"l{i}", "Lose", 51) for i in range(3)]
    total = sum(s.amount for s in stakes)
    payouts = settle_multi(stakes, "Win", rake=Decimal("0.03"))
    rake_amount = (total * Decimal("0.03")).quantize(Decimal("0.01"))
    assert sum(payouts.values()) == total - rake_amount
