"""Synthetic fixtures for transaction-witness validation."""

import hashlib
import unittest

from r7_chain_reconcile import derive
from r7_genesis_verify import verify


CASE_ID = list(range(32))
UNIT = 10 ** 21

STEPS = (
    "case",
    "buyer0-fund", "worker0-accept",
    "buyer1-fund", "worker1-accept",
    "buyer2-fund", "worker2-accept",
    "provider0-offer", "provider1-offer",
    "award",
)


def fixture():
    manifest_rows = []
    preflight_rows = []

    actors = {
        f"worker{i}": f"worker-{i}"
        for i in range(3)
    }

    for index, step in enumerate(STEPS):
        signer = "account-" + step
        tx = "tx-" + str(index)
        method = "method-" + step

        manifest_rows.append({
            "step": step,
            "signer": signer,
            "tx": tx,
            "method": method,
        })

        if step == "case":
            args = {"descriptor": {
                "dependency_deadline": 10,
                "bid_close": 11,
                "award_close": 12,
                "recovery_deadline": 15,
            }}

        elif step.startswith("buyer"):
            i = int(step[5])
            args = {"input": {
                "case_id": CASE_ID,
                "rescue_cap": str(5 * UNIT),
                "worker": actors[f"worker{i}"],
            }}

        elif step.startswith("worker"):
            i = int(step[6])
            args = {"job_id": i + 1}

        elif step.startswith("provider"):
            i = int(step[8])
            args = {"input": {
                "case_id": CASE_ID,
                "component_index": i,
                "fee": str(6 * UNIT),
                "bond_capacity": str(12 * UNIT),
                "slot_id": f"slot{i}",
            }}

        else:
            args = {"case_id": CASE_ID}

        preflight_rows.append({
            "step": step,
            "signer": signer,
            "tx": tx,
            "method": method,
            "args": args,
            "args_sha256": hashlib.sha256(
                repr(args).encode()
            ).hexdigest(),
            "block_hash": "block-" + str(index),
        })

    manifest = {
        "network": "testnet",
        "contract": "example.testnet",
        "case_id_hex": bytes(CASE_ID).hex(),
        "wasm_sha256": "a" * 64,
        "actors": actors,
        "job_ids": [1, 2, 3],
        "offer_ids": [0, 1],
        "transactions": manifest_rows,
    }

    preflight = {
        "source": "public-near-testnet-transactions",
        "contract": "example.testnet",
        "rpc_count": 2,
        "transactions": preflight_rows,
    }

    return manifest, preflight


class ChainWitnessTests(unittest.TestCase):

    def test_realistic_economic_result(self):
        manifest, preflight = fixture()
        witness = derive(manifest, preflight)

        cert = witness["genesis_certificate"]

        self.assertTrue(verify(cert))
        self.assertEqual(
            cert["minimal_coalitions"],
            [[1, 2, 3]],
        )
        self.assertEqual(
            cert["coalitions"][-1]["allocation"],
            [4 * UNIT] * 3,
        )
        self.assertEqual(
            len(witness["observations"]), 10
        )

    def test_wrong_award_case_rejected(self):
        manifest, preflight = fixture()
        preflight["transactions"][-1]["args"][
            "case_id"
        ] = [0] * 32

        with self.assertRaises(ValueError):
            derive(manifest, preflight)

    def test_underbonding_rejected(self):
        manifest, preflight = fixture()
        preflight["transactions"][-2]["args"][
            "input"
        ]["bond_capacity"] = "5"

        with self.assertRaises(ValueError):
            derive(manifest, preflight)

    def test_missing_transaction_rejected(self):
        manifest, preflight = fixture()
        preflight["transactions"].pop()

        with self.assertRaises(ValueError):
            derive(manifest, preflight)

    def test_one_rpc_not_enough(self):
        manifest, preflight = fixture()
        preflight["rpc_count"] = 1

        with self.assertRaises(ValueError):
            derive(manifest, preflight)


if __name__ == "__main__":
    unittest.main()
