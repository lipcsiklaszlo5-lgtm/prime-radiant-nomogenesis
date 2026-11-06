"""R7-06C pair ranking and economic evidence tests."""

import copy
import json
import random
import unittest
from pathlib import Path

from r7_06c_competition import (
    SIGNED,
    audit,
    verify_witness,
)


def reference():
    return copy.deepcopy(
        json.loads(
            SIGNED.read_text()
        )["market"]
    )


def pair(result, ids):
    return next(
        x for x in result["pair_evidence"]
        if x["offers"] == ids
    )


class CompetitionTests(unittest.TestCase):

    def test_signed_market_four_candidate_pairs(self):
        r = audit(reference())

        self.assertEqual(
            r["examined_pair_count"], 4
        )

        self.assertEqual(
            r["admissible_pair_count"], 2
        )

        self.assertEqual(
            r["clearing_order"],
            [[3, 2], [1, 2]],
        )

        self.assertEqual(
            r["winning_pair"],
            {"price": 11, "offers": [3, 2]},
        )

        self.assertEqual(
            r["selected_formation"]["payments"],
            [6, 5],
        )

    def test_cheapest_nominal_offer_is_refused(self):
        r = audit(reference())

        self.assertEqual(
            pair(r, [3, 4])["price"],
            9,
        )

        self.assertIn(
            "supplier_policy_refusal",
            pair(r, [3, 4])["reasons"],
        )

        self.assertEqual(
            r["winning_pair"]["price"],
            11,
        )

    def test_supplier_lowers_floor_and_wins(self):
        m = reference()
        m["offers"][3]["cost_floor"] = 4

        r = audit(m)

        self.assertEqual(
            r["winning_pair"],
            {"price": 9, "offers": [3, 4]},
        )

        self.assertEqual(
            r["selected_formation"]["payments"],
            [5, 4],
        )

    def test_underbonded_cheapest_offer_rejected(self):
        m = reference()

        m["offers"].append({
            "offer_id": 5,
            "component": 0,
            "provider": "provider-epsilon",
            "slot": "slot-epsilon",
            "fee": 1,
            "bond": 1,
            "ready_at": 1,
            "available": True,
            "cost_floor": 0,
        })

        r = audit(m)

        self.assertIn(
            "insufficient_provider_bond",
            pair(r, [5, 2])["reasons"],
        )

        self.assertEqual(
            r["winning_pair"]["offers"],
            [3, 2],
        )

    def test_late_winner_falls_back_to_next(self):
        m = reference()
        m["offers"][2]["ready_at"] = 3

        r = audit(m)

        self.assertIn(
            "missed_deadline",
            pair(r, [3, 2])["reasons"],
        )

        self.assertEqual(
            r["winning_pair"],
            {"price": 12, "offers": [1, 2]},
        )

    def test_provider_identity_conflict_rejected(self):
        m = reference()

        m["offers"][1]["provider"] = (
            m["offers"][2]["provider"]
        )

        r = audit(m)

        self.assertIn(
            "same_provider",
            pair(r, [3, 2])["reasons"],
        )

        self.assertEqual(
            r["winning_pair"]["offers"],
            [1, 2],
        )

    def test_capacity_slot_conflict_rejected(self):
        m = reference()

        m["offers"][1]["slot"] = (
            m["offers"][2]["slot"]
        )

        r = audit(m)

        self.assertIn(
            "capacity_slot_conflict",
            pair(r, [3, 2])["reasons"],
        )

        self.assertEqual(
            r["winning_pair"]["offers"],
            [1, 2],
        )

    def test_equal_price_tie_uses_offer_ids(self):
        m = reference()

        m["offers"].append({
            "offer_id": 5,
            "component": 0,
            "provider": "provider-epsilon",
            "slot": "slot-epsilon",
            "fee": 5,
            "bond": 12,
            "ready_at": 1,
            "available": True,
            "cost_floor": 3,
        })

        r = audit(m)

        self.assertEqual(
            r["clearing_order"][:2],
            [[3, 2], [5, 2]],
        )

        self.assertEqual(
            r["winning_pair"]["offers"],
            [3, 2],
        )

    def test_max_six_offers_yields_nine_pairs(self):
        m = reference()

        m["offers"] += [
            {
                "offer_id": 5,
                "component": 0,
                "provider": "provider-epsilon",
                "slot": "slot-epsilon",
                "fee": 8,
                "bond": 20,
                "ready_at": 1,
                "available": True,
                "cost_floor": 6,
            },
            {
                "offer_id": 6,
                "component": 1,
                "provider": "provider-zeta",
                "slot": "slot-zeta",
                "fee": 8,
                "bond": 20,
                "ready_at": 1,
                "available": True,
                "cost_floor": 6,
            },
        ]

        r = audit(m)

        self.assertEqual(
            r["examined_pair_count"], 9
        )

        self.assertEqual(
            r["winning_pair"]["offers"],
            [3, 2],
        )

    def test_all_providers_unavailable(self):
        m = reference()

        for offer in m["offers"]:
            offer["available"] = False

        r = audit(m)

        self.assertIsNone(r["winning_pair"])
        self.assertIsNone(r["selected_formation"])

        self.assertEqual(
            r["market_reason"],
            "no_admissible_provider_pair",
        )

    def test_no_voluntary_buyer_coalition(self):
        m = reference()

        for buyer in m["buyers"]:
            buyer["active"] = False

        r = audit(m)

        self.assertIsNotNone(r["winning_pair"])
        self.assertIsNone(r["selected_formation"])

        self.assertEqual(
            r["market_reason"],
            "no_voluntary_funded_coalition",
        )

    def test_missing_required_component(self):
        m = reference()

        for offer in m["offers"]:
            offer["component"] = 0

        r = audit(m)

        self.assertEqual(
            r["examined_pair_count"], 0
        )

        self.assertEqual(
            r["market_reason"],
            "missing_required_component",
        )

    def test_reordered_market_is_identical(self):
        m = reference()
        n = copy.deepcopy(m)

        n["buyers"].reverse()
        n["offers"].reverse()

        self.assertEqual(
            audit(m), audit(n)
        )

    def test_forged_winner_and_reasons_rejected(self):
        m = reference()
        valid = audit(m, "signed-reference")

        changed = copy.deepcopy(valid)
        changed["winning_pair"]["price"] = 9

        self.assertFalse(
            verify_witness(
                changed, m, "signed-reference"
            )
        )

        changed = copy.deepcopy(valid)

        changed["pair_evidence"][0][
            "reasons"
        ].append("fake_reason")

        self.assertFalse(
            verify_witness(
                changed, m, "signed-reference"
            )
        )

    def test_forged_source_or_economics_rejected(self):
        m = reference()
        valid = audit(m, "signed-reference")

        self.assertFalse(
            verify_witness(
                valid, m, "wrong-origin"
            )
        )

        altered = copy.deepcopy(valid)

        altered["selected_formation"][
            "payments"
        ][0] += 1

        self.assertFalse(
            verify_witness(
                altered, m, "signed-reference"
            )
        )

    def test_duplicate_offer_id_fails_closed(self):
        m = reference()
        m["offers"][1]["offer_id"] = 1

        with self.assertRaises(ValueError):
            audit(m)

    def test_large_pair_price_cannot_overflow(self):
        m = reference()

        m["offers"][0]["fee"] = 1 << 127
        m["offers"][0]["bond"] = (1 << 128) - 1

        m["offers"][1]["fee"] = 1 << 127
        m["offers"][1]["bond"] = (1 << 128) - 1

        r = audit(m)

        self.assertIn(
            "pair_price_overflow",
            pair(r, [1, 2])["reasons"],
        )

    def test_deterministic_adversarial_sweep(self):
        rng = random.Random(20261106)

        for _ in range(100):
            m = reference()

            for offer in m["offers"]:
                offer["fee"] = rng.randint(1, 20)
                offer["cost_floor"] = rng.randint(0, 20)
                offer["bond"] = rng.randint(0, 35)
                offer["ready_at"] = rng.randint(1, 3)
                offer["available"] = bool(
                    rng.randint(0, 1)
                )

            r = audit(m)

            self.assertLessEqual(
                r["examined_pair_count"], 9
            )

            self.assertTrue(
                verify_witness(
                    r, m, "synthetic-test"
                )
            )


if __name__ == "__main__":
    unittest.main()
