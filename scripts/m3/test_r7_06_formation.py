"""R7-06A formation regression and adversarial tests."""

import copy
import unittest

from r7_06_formation import form
from r7_genesis_verify import verify


def example(caps=(5, 5, 5)):
    return {
        "deadline": 2,
        "buyers": [
            {
                "job_id": i + 1,
                "cap": cap,
                "value": 10,
                "outside_option": 0,
                "active": True,
            }
            for i, cap in enumerate(caps)
        ],
        "offers": [
            {
                "offer_id": 1,
                "component": 0,
                "provider": "alpha",
                "slot": "slot-alpha",
                "fee": 6,
                "bond": 12,
                "ready_at": 1,
                "available": True,
                "cost_floor": 4,
            },
            {
                "offer_id": 2,
                "component": 1,
                "provider": "beta",
                "slot": "slot-beta",
                "fee": 6,
                "bond": 12,
                "ready_at": 1,
                "available": True,
                "cost_floor": 4,
            },
        ],
    }


class FormationTests(unittest.TestCase):

    def test_reference_full_coalition(self):
        x = form(example())

        self.assertTrue(
            verify(x["genesis_certificate"])
        )

        self.assertEqual(
            x["minimal_coalitions"],
            [[1, 2, 3]],
        )

        self.assertEqual(
            x["selected"]["payments"],
            [4, 4, 4],
        )

        self.assertEqual(
            x["selected"]["buyer_utility_margins"],
            [6, 6, 6],
        )

        self.assertEqual(
            x["selected"]["supplier_margins"],
            [2, 2],
        )

        self.assertEqual(
            x["selected"]["stated_incremental_surplus"],
            22,
        )

        self.assertTrue(
            x["newly_fundable_under_declared_limits"]
        )

        self.assertFalse(
            x["onchain_execution_ready"]
        )

    def test_three_alternative_minimal_coalitions(self):
        x = form(example((7, 7, 7)))

        self.assertEqual(
            x["minimal_coalitions"],
            [[1, 2], [1, 3], [2, 3]],
        )

        self.assertEqual(
            x["selected"]["job_ids"],
            [1, 2, 3],
        )

        self.assertEqual(
            x["selected"]["payments"],
            [4, 4, 4],
        )

        self.assertEqual(
            x["candidate_count"],
            4,
        )

    def test_agent_refusal_changes_formation(self):
        s = example((7, 7, 7))
        s["buyers"][2]["outside_option"] = 10

        x = form(s)

        self.assertFalse(
            x["buyer_decisions"][2]["willing"]
        )

        self.assertEqual(
            x["minimal_coalitions"],
            [[1, 2]],
        )

        self.assertEqual(
            x["selected"]["job_ids"],
            [1, 2],
        )

        self.assertEqual(
            x["selected"]["payments"],
            [6, 6],
        )

    def test_all_buyers_refuse(self):
        s = example()

        for buyer in s["buyers"]:
            buyer["active"] = False

        x = form(s)

        self.assertIsNone(x["selected"])
        self.assertEqual(x["candidate_count"], 0)

        self.assertFalse(
            x["newly_fundable_under_declared_limits"]
        )

    def test_outside_option_caps_payment(self):
        s = example((7, 7, 7))
        s["buyers"][2]["outside_option"] = 7

        x = form(s)

        self.assertEqual(
            x["buyer_decisions"][2]["effective_cap"],
            3,
        )

        self.assertEqual(
            x["selected"]["payments"],
            [5, 4, 3],
        )

        self.assertTrue(all(
            value >= 0
            for value in
            x["selected"]["buyer_utility_margins"]
        ))

    def test_competing_lower_fee_provider(self):
        s = example((7, 7, 7))

        s["offers"].append({
            "offer_id": 3,
            "component": 0,
            "provider": "gamma",
            "slot": "slot-gamma",
            "fee": 5,
            "bond": 12,
            "ready_at": 1,
            "available": True,
            "cost_floor": 3,
        })

        x = form(s)

        self.assertEqual(
            x["selected"]["pair"],
            [3, 2],
        )

        self.assertEqual(
            x["selected"]["price"],
            11,
        )

    def test_underbonded_provider_filtered(self):
        s = example((7, 7, 7))

        s["offers"].append({
            "offer_id": 3,
            "component": 0,
            "provider": "gamma",
            "slot": "slot-gamma",
            "fee": 5,
            "bond": 10,
            "ready_at": 1,
            "available": True,
            "cost_floor": 3,
        })

        x = form(s)

        self.assertEqual(
            x["selected"]["pair"],
            [1, 2],
        )

    def test_seller_refuses_below_cost_floor(self):
        s = example()
        s["offers"][0]["cost_floor"] = 7

        x = form(s)

        self.assertFalse(
            x["supplier_decisions"][0]["willing"]
        )

        self.assertIsNone(x["selected"])

    def test_same_provider_rejected(self):
        s = example()
        s["offers"][1]["provider"] = s["offers"][0]["provider"]

        self.assertIsNone(form(s)["selected"])

    def test_distinct_providers_can_share_slot_name(self):
        s = example()
        s["offers"][1]["slot"] = s["offers"][0]["slot"]

        self.assertEqual(form(s)["selected"]["pair"], [1, 2])

    def test_late_component_rejected(self):
        s = example()
        s["offers"][1]["ready_at"] = 3

        self.assertIsNone(
            form(s)["selected"]
        )

    def test_individual_financing_not_new_market(self):
        s = example((12, 2, 2))
        s["buyers"][0]["value"] = 20

        x = form(s)

        self.assertIsNotNone(x["selected"])

        self.assertFalse(
            x["newly_fundable_under_declared_limits"]
        )

    def test_insufficient_voluntary_funding(self):
        x = form(example((1, 1, 1)))
        self.assertIsNone(x["selected"])

    def test_input_order_invariance(self):
        a = example((7, 7, 7))
        before = copy.deepcopy(a)

        b = copy.deepcopy(a)
        b["buyers"].reverse()
        b["offers"].reverse()

        self.assertEqual(form(a), form(b))
        self.assertEqual(a, before)

    def test_duplicate_identifiers_rejected(self):
        s = example()
        s["buyers"][1]["job_id"] = 1

        with self.assertRaises(ValueError):
            form(s)

    def test_unsafe_money_values_rejected(self):
        for bad in (True, 0.1, -1, 1 << 129):
            s = example()
            s["buyers"][0]["cap"] = bad

            with self.assertRaises(ValueError):
                form(s)

    def test_unknown_fields_rejected(self):
        s = example()

        s["buyers"][0][
            "unsafe_override"
        ] = True

        with self.assertRaises(ValueError):
            form(s)


if __name__ == "__main__":
    unittest.main()
