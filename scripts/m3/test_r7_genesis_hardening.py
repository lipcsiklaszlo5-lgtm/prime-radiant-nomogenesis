"""Adversarial and boundary tests for Genesis V1."""

import copy
import unittest

from r7_genesis import generate, hash_of
from r7_genesis_verify import verify
from r7_genesis_schema import MAX_U64, MAX_U128
from test_r7_genesis import scenario


def rehash(cert):
    cert["input_hash"] = hash_of("GENESIS_INPUT", cert["input"])
    body = {
        k: v for k, v in cert.items()
        if k != "certificate_hash"
    }
    cert["certificate_hash"] = hash_of("GENESIS_CERT", body)


class HardeningTests(unittest.TestCase):

    def test_multiple_minimal_coalitions(self):
        data = scenario()
        for buyer in data["buyers"]:
            buyer["cap"] = 7

        cert = generate(data)

        self.assertTrue(verify(cert))
        self.assertEqual(
            cert["minimal_coalitions"],
            [[1, 2], [1, 3], [2, 3]]
        )

    def test_single_buyer_feasible(self):
        data = scenario()
        data["buyers"][0]["cap"] = 12

        cert = generate(data)
        self.assertIn([1], cert["minimal_coalitions"])
        self.assertTrue(verify(cert))

    def test_cheapest_competing_pair(self):
        data = scenario()

        data["offers"] += [
            {
                **data["offers"][0],
                "offer_id": 3,
                "fee": 4,
                "provider": "c",
                "slot": "s3",
            },
            {
                **data["offers"][1],
                "offer_id": 4,
                "fee": 5,
                "provider": "d",
                "slot": "s4",
            },
        ]

        cert = generate(data)

        self.assertEqual(
            cert["winning_pair"],
            {"price": 9, "offers": [3, 4]}
        )
        self.assertTrue(verify(cert))

    def test_provider_rejections(self):
        cases = [
            ("provider", "a"),
            ("ready_at", 11),
            ("available", False),
            ("component", 0),
        ]

        for field, value in cases:
            with self.subTest(field=field):
                data = scenario()
                data["offers"][1][field] = value

                cert = generate(data)
                self.assertIsNone(cert["winning_pair"])
                self.assertTrue(verify(cert))

    def test_distinct_providers_can_share_slot_name(self):
        data = scenario()
        data["offers"][1]["slot"] = data["offers"][0]["slot"]

        cert = generate(data)
        self.assertEqual(
            cert["winning_pair"],
            {"price": 12, "offers": [1, 2]},
        )
        self.assertTrue(verify(cert))

    def test_duplicate_ids_rejected(self):
        for kind, key in [
            ("buyers", "job_id"),
            ("offers", "offer_id"),
        ]:
            with self.subTest(kind=kind):
                data = scenario()
                data[kind][1][key] = data[kind][0][key]

                with self.assertRaises(ValueError):
                    generate(data)

    def test_bad_types_extra_fields_and_uint_boundaries(self):
        mutations = [
            ("bool_cap", lambda d: d["buyers"][0].update(cap=True)),
            ("bool_id", lambda d: d["buyers"][0].update(job_id=True)),
            ("negative", lambda d: d["buyers"][0].update(cap=-1)),
            ("float", lambda d: d["offers"][0].update(fee=6.0)),
            ("empty_provider", lambda d: d["offers"][0].update(provider="")),
            ("junk_field", lambda d: d["offers"][0].update(extra=1)),
            ("bad_component", lambda d: d["offers"][0].update(component=2)),
            ("overflow_id", lambda d: d["offers"][0].update(
                offer_id=MAX_U64 + 1
            )),
            ("overflow_cap", lambda d: d["buyers"][0].update(
                cap=MAX_U128 + 1
            )),
            ("aggregate_overflow", lambda d: d["buyers"][0].update(
                cap=MAX_U128
            )),
            ("root_junk", lambda d: d.update(junk=True)),
        ]

        for name, mutate in mutations:
            with self.subTest(name=name):
                data = scenario()
                mutate(data)

                with self.assertRaises(ValueError):
                    generate(data)

    def test_canonical_order_and_no_source_mutation(self):
        data = scenario()
        data["buyers"].reverse()
        data["offers"].reverse()

        original = copy.deepcopy(data)
        cert = generate(data)

        self.assertEqual(data, original)
        self.assertTrue(verify(cert))
        self.assertEqual(
            cert["input"]["buyers"][0]["job_id"], 1
        )

    def test_hash_recomputed_for_forged_capacity(self):
        cert = generate(scenario())
        cert["coalitions"][0]["capacity"] = 1234
        rehash(cert)

        self.assertFalse(verify(cert))

    def test_hash_recomputed_for_type_confusion(self):
        cert = generate(scenario())

        # Python True == 1, but canonical JSON does not.
        cert["coalitions"][0]["mask"] = True
        rehash(cert)

        self.assertFalse(verify(cert))

    def test_hash_recomputed_for_invalid_input(self):
        cert = generate(scenario())
        cert["input"]["buyers"][0]["cap"] = True
        rehash(cert)

        self.assertFalse(verify(cert))

    def test_pair_price_uint128_overflow(self):
        data = scenario()

        for offer in data["offers"]:
            offer["fee"] = MAX_U128
            offer["bond"] = MAX_U128

        cert = generate(data)

        self.assertIsNone(cert["winning_pair"])
        self.assertTrue(verify(cert))


if __name__ == "__main__":
    unittest.main()
