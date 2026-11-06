"""R7-06D economic comparisons and deviation tests."""

import copy
import json
import unittest

from r7_06c_competition import SIGNED
from r7_06d_economics import (
    allocate_alternative,
    assumptions,
    build_report,
    evaluate,
    unilateral_exits,
)


def market():
    return copy.deepcopy(
        json.loads(SIGNED.read_text())["market"]
    )


class EconomicTests(unittest.TestCase):

    def test_same_service_reference(self):
        result = evaluate(market(), assumptions())

        self.assertEqual(
            result["beneficiaries"], [1, 2]
        )

        joint = result["strategies"]["nomogenesis"]

        self.assertEqual(joint["buyer_payments"], [6, 5])
        self.assertEqual(joint["buyer_net"], 9)
        self.assertEqual(joint["supplier_margin"], 4)

        self.assertEqual(
            joint["declared_social_surplus"], 13
        )

        self.assertEqual(
            joint["assumed_locked_capital"], 33
        )

        self.assertEqual(
            result["best_strategies"], ["nomogenesis"]
        )

    def test_independent_funding_is_infeasible(self):
        r = evaluate(market(), assumptions())

        self.assertFalse(
            r["strategies"]["individual"]["feasible"]
        )

    def test_standby_can_win(self):
        a = assumptions()

        a["standby"].update({
            "price": 9,
            "resource_cost": 6,
            "locked_capital": 9,
        })

        result = evaluate(market(), a)

        self.assertEqual(
            result["best_strategies"], ["standby"]
        )

        standby = result["strategies"]["standby"]

        self.assertEqual(
            standby["buyer_payments"], [5, 4]
        )

        self.assertEqual(
            standby["declared_social_surplus"], 14
        )

    def test_spot_can_win(self):
        a = assumptions()

        a["spot"].update({
            "ready_at": 1,
            "price": 8,
            "resource_cost": 5,
            "locked_capital": 8,
        })

        result = evaluate(market(), a)

        self.assertEqual(
            result["best_strategies"], ["spot"]
        )

        self.assertEqual(
            result["strategies"]["spot"][
                "declared_social_surplus"
            ], 15
        )

    def test_late_spot_does_not_win(self):
        result = evaluate(market(), assumptions())

        self.assertFalse(
            result["strategies"]["spot"]["feasible"]
        )

        self.assertEqual(
            result["strategies"]["spot"]["reason"],
            "missed_recovery_deadline"
        )

    def test_counterfactual_cap_limits(self):
        group = [
            {"job_id": 1, "effective_cap": 7,
             "incremental_value": 10},
            {"job_id": 2, "effective_cap": 7,
             "incremental_value": 10},
        ]

        self.assertEqual(
            allocate_alternative(9, group),
            [5, 4]
        )

        self.assertIsNone(
            allocate_alternative(15, group)
        )

    def test_no_hidden_third_buyer_subsidy(self):
        m = market()
        m["buyers"][2]["active"] = True
        m["buyers"][2]["outside_option"] = 0

        result = evaluate(m, assumptions())

        self.assertEqual(
            result["beneficiaries"], [1, 2, 3]
        )

        self.assertEqual(
            result["strategies"]["nomogenesis"][
                "buyer_payments"
            ], [4, 4, 3]
        )

    def test_signed_two_buyer_market_exit_breaks_rescue(self):
        rows = unilateral_exits(market())

        self.assertEqual(len(rows), 2)

        self.assertTrue(all(
            row["residual_coalition"] is None
            for row in rows
        ))

        self.assertFalse(any(
            row["profitable_free_ride_if_nonexcludable"]
            for row in rows
        ))

    def test_three_buyer_market_has_free_rider_problem(self):
        m = market()
        m["buyers"][2]["outside_option"] = 0

        rows = unilateral_exits(m)

        self.assertEqual(len(rows), 3)

        self.assertTrue(all(
            row["residual_recovery_feasible"]
            for row in rows
        ))

        self.assertTrue(all(
            row["profitable_free_ride_if_nonexcludable"]
            for row in rows
        ))

    def test_excludable_exit_is_not_profitable(self):
        m = market()
        m["buyers"][2]["outside_option"] = 0

        rows = unilateral_exits(m)

        self.assertTrue(all(
            row["exit_payoff_if_excludable"]
            < row["current_incremental_utility"]
            for row in rows
        ))

    def test_capital_charge_reduces_realized_surplus(self):
        a = assumptions()

        a["standby"].update({
            "price": 9,
            "resource_cost": 6,
            "capital_charge": 2,
            "locked_capital": 11,
        })

        r = evaluate(market(), a)

        standby = r["strategies"]["standby"]

        self.assertEqual(
            standby["buyer_cash_outlay"], 11
        )

        self.assertEqual(
            standby["declared_social_surplus"], 12
        )

        self.assertEqual(
            r["best_strategies"], ["nomogenesis"]
        )

    def test_infeasible_alternative_does_not_claim_welfare(self):
        a = assumptions()

        a["standby"]["available"] = False
        a["spot"]["available"] = False

        r = evaluate(market(), a)

        self.assertEqual(
            r["strategies"]["standby"][
                "declared_social_surplus"
            ], 0
        )

        self.assertEqual(
            r["best_strategies"], ["nomogenesis"]
        )

    def test_invalid_hypothetical_price_fails_closed(self):
        for invalid in (True, -1, 1.5, 1 << 129):
            a = assumptions()
            a["standby"]["price"] = invalid

            with self.assertRaises(ValueError):
                evaluate(market(), a)

    def test_invalid_cost_or_capital_fails_closed(self):
        a = assumptions()
        a["spot"]["resource_cost"] = 100

        with self.assertRaises(ValueError):
            evaluate(market(), a)

        a = assumptions()
        a["standby"]["locked_capital"] = 1

        with self.assertRaises(ValueError):
            evaluate(market(), a)

    def test_unapproved_assumption_fields_rejected(self):
        a = assumptions()
        a["spot"]["unsupported_claim"] = True

        with self.assertRaises(ValueError):
            evaluate(market(), a)

    def test_sensitivity_contains_wins_and_losses(self):
        report = build_report(
            market(),
            "competition-test",
            "signed-test",
        )

        sweep = report["standby_sensitivity"]

        self.assertEqual(len(sweep), 11)

        by_price = {
            x["standby_price"]: x
            for x in sweep
        }

        self.assertEqual(
            by_price[6]["winners"], ["standby"]
        )

        self.assertEqual(
            by_price[9]["winners"],
            ["nomogenesis", "standby"]
        )

        self.assertEqual(
            by_price[14]["winners"],
            ["nomogenesis"]
        )

    def test_deterministic_economic_proof(self):
        a = build_report(
            market(),
            "competition-test",
            "signed-test",
        )

        b = build_report(
            market(),
            "competition-test",
            "signed-test",
        )

        self.assertEqual(a, b)

        self.assertEqual(
            len(a["evidence_hash"]), 64
        )


if __name__ == "__main__":
    unittest.main()
