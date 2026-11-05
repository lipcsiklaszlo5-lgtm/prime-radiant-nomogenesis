"""Test recorded-evidence validation and forgery rejection."""

import copy
import json
import unittest

from r7_genesis import hash_of
from r7_public_replay import (
    RECORDED_AWARD,
    RECORDED_WITNESS,
    validate,
)


def records():
    return (
        json.loads(RECORDED_WITNESS.read_text()),
        json.loads(RECORDED_AWARD.read_text()),
    )


def rehash_award(award):
    award["evidence_hash"] = hash_of(
        "R7_AWARD_TRANSITION",
        {k: v for k, v in award.items()
         if k != "evidence_hash"},
    )


class ReplayTests(unittest.TestCase):

    def test_original_records(self):
        witness, award = records()
        self.assertTrue(validate(witness, award))

    def test_changed_allocation_even_if_rehashed(self):
        witness, award = records()
        award["allocations"][0]["amount"] += 1
        rehash_award(award)

        with self.assertRaises(ValueError):
            validate(witness, award)

    def test_changed_contract_even_if_rehashed(self):
        witness, award = records()
        award["contract"] = "impostor.testnet"
        rehash_award(award)

        with self.assertRaises(ValueError):
            validate(witness, award)

    def test_forged_financial_delta(self):
        witness, award = records()
        award["escrow_after"] = str(
            int(award["escrow_after"]) + 1
        )
        rehash_award(award)

        with self.assertRaises(ValueError):
            validate(witness, award)

    def test_corrupt_witness(self):
        witness, award = records()
        witness = copy.deepcopy(witness)
        witness["witness_hash"] = "0" * 64

        with self.assertRaises(ValueError):
            validate(witness, award)


if __name__ == "__main__":
    unittest.main()
