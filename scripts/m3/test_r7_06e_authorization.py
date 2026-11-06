"""R7-06E: actual M3 source assumptions and modeled mismatches."""

import copy
import json
import unittest

from r7_06c_competition import SIGNED
from r7_06e_authorization import (
    assess,
    build_report,
    inspect_contract,
    project,
)


def reference():
    return copy.deepcopy(
        json.loads(SIGNED.read_text())["market"]
    )


class AuthorizationBoundaryTests(unittest.TestCase):

    def test_rust_contract_assumptions_are_still_true(self):
        result = inspect_contract()

        self.assertEqual(len(result["checks"]), 5)
        self.assertTrue(all(result["checks"].values()))

    def test_only_two_selected_jobs_is_conditionally_compatible(self):
        result = assess(
            reference(), [1, 2], [1, 2, 3]
        )

        self.assertTrue(
            result["matches_offchain_formation"]
        )

        self.assertEqual(
            result["hypothetical_m3_prediction"][
                "allocations"
            ],
            [
                {"job_id": 1, "amount": 6},
                {"job_id": 2, "amount": 5},
            ],
        )

        self.assertFalse(
            result["proven_onchain_execution"]
        )

    def test_three_accepted_jobs_are_not_two_buyer_award(self):
        result = assess(
            reference(), [1, 2, 3], [1, 2, 3]
        )

        self.assertFalse(
            result["matches_offchain_formation"]
        )

        self.assertEqual(
            result["hypothetical_m3_prediction"][
                "allocations"
            ],
            [
                {"job_id": 1, "amount": 4},
                {"job_id": 2, "amount": 4},
                {"job_id": 3, "amount": 3},
            ],
        )

        self.assertEqual(
            result["unwilling_funded_jobs"],
            [3],
        )

    def test_buyer_revocation_can_change_eligible_set(self):
        result = assess(
            reference(), [1, 2, 3],
            [1, 2, 3], [3]
        )

        self.assertTrue(
            result["matches_offchain_formation"]
        )

        self.assertTrue(
            result["requires_actual_onchain_revocations"]
        )

        self.assertFalse(
            result["proven_near_authorization"]
        )

    def test_refusing_provider_cannot_be_treated_as_valid_if_posted(self):
        result = assess(
            reference(), [1, 2], [1, 2, 3, 4]
        )

        self.assertFalse(
            result["matches_offchain_formation"]
        )

        self.assertEqual(
            result["hypothetical_m3_prediction"][
                "winning_pair"
            ],
            {"price": 9, "offers": [3, 4]},
        )

        self.assertEqual(
            result["selected_refusing_offers"],
            [4],
        )

    def test_buyer_withdrawal_can_destroy_funding(self):
        result = assess(
            reference(), [1, 2],
            [1, 2, 3], [2]
        )

        self.assertFalse(
            result["matches_offchain_formation"]
        )

        self.assertIsNone(
            result["hypothetical_m3_prediction"][
                "winning_pair"
            ]
        )

    def test_onchain_cap_may_overcharge_relative_to_value(self):
        m = reference()

        m["buyers"][0]["outside_option"] = 6

        result = assess(
            m, [1, 2], [1, 2, 3]
        )

        self.assertFalse(
            result["matches_offchain_formation"]
        )

        self.assertEqual(
            result["over_willingness_jobs"],
            [1],
        )

    def test_empty_eligible_set_has_no_award(self):
        result = project(
            reference(), [1, 2],
            [1, 2, 3], [1, 2]
        )

        self.assertIsNone(result["winning_pair"])
        self.assertEqual(result["allocations"], [])

    def test_revocation_without_funded_job_rejected(self):
        with self.assertRaises(ValueError):
            project(
                reference(),
                [1, 2],
                [1, 2, 3],
                [3],
            )

    def test_unknown_provider_rejected(self):
        with self.assertRaises(ValueError):
            project(
                reference(),
                [1, 2],
                [99],
            )

    def test_model_is_deterministic_and_tamper_sensitive(self):
        m = reference()
        first = build_report(
            m, "signed", "competition", "economics"
        )

        second = build_report(
            m, "signed", "competition", "economics"
        )

        self.assertEqual(first, second)

        forged = copy.deepcopy(first)
        forged["scenarios"][
            "only_selected_enrolled"
        ]["matches_offchain_formation"] = False

        self.assertNotEqual(
            first, forged
        )


if __name__ == "__main__":
    unittest.main()
