"""Tests for economic participation equilibria."""

import copy
import json
import unittest

from r7_06c_competition import SIGNED
from r7_participation_equilibria import (
    assess,
    build_report,
)


def market():
    return copy.deepcopy(
        json.loads(SIGNED.read_text())["market"]
    )


def three_buyer_market():
    data = market()
    data["buyers"][2]["outside_option"] = 0
    return data


class EquilibriumTests(unittest.TestCase):

    def test_enumerates_every_profile(self):
        result = assess(market(), True)

        self.assertEqual(
            result["profile_count"], 8
        )

        self.assertEqual(
            [r["mask"] for r in result["profiles"]],
            list(range(8)),
        )

    def test_two_pivotal_buyers_can_remain_stable(self):
        result = assess(market(), True)

        # Buyers 1 and 2 participate.
        profile = result["profiles"][3]

        self.assertTrue(profile["recovered"])
        self.assertTrue(profile["unilaterally_stable"])
        self.assertEqual(
            profile["selected_jobs"], [1, 2]
        )
        self.assertEqual(
            profile["price"], 11
        )

    def test_three_buyer_full_coalition_is_unstable(self):
        result = assess(
            three_buyer_market(), True
        )

        full = result["profiles"][7]

        self.assertTrue(full["recovered"])
        self.assertEqual(
            full["selected_jobs"], [1, 2, 3]
        )
        self.assertFalse(
            full["unilaterally_stable"]
        )

        exits = full["profitable_deviations"]

        self.assertEqual(len(exits), 3)
        self.assertTrue(all(
            exit["action"] == "opt_out"
            and exit["recovery_after"]
            and exit["utility_gain"] > 0
            for exit in exits
        ))

    def test_two_payers_and_free_rider_are_stable(self):
        result = assess(
            three_buyer_market(), True
        )

        profile = result["profiles"][3]

        self.assertTrue(profile["recovered"])
        self.assertTrue(profile["unilaterally_stable"])
        self.assertEqual(
            profile["selected_jobs"], [1, 2]
        )

        outsider = profile["utilities"][2]
        payment = profile["payments"][2]

        self.assertEqual(
            outsider["utility"], 10
        )
        self.assertEqual(
            payment["amount"], 0
        )

    def test_excludable_full_coalition_is_stable(self):
        result = assess(
            three_buyer_market(), False
        )

        full = result["profiles"][7]

        self.assertTrue(full["recovered"])
        self.assertTrue(
            full["unilaterally_stable"]
        )

    def test_coordination_failure_is_possible(self):
        result = assess(
            three_buyer_market(), True
        )

        empty = result["profiles"][0]

        self.assertFalse(empty["recovered"])
        self.assertTrue(
            empty["unilaterally_stable"]
        )

    def test_deterministic_reconstruction(self):
        data = market()

        first = build_report(data, "test")
        second = build_report(data, "test")

        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
