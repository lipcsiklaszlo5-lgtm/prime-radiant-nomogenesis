import unittest

from r7_genesis import generate, hash_of
from r7_genesis_verify import verify


def scenario():
    return {
        "deadline": 10,
        "buyers": [
            {"job_id": i, "cap": 5}
            for i in (1, 2, 3)
        ],
        "offers": [
            {
                "offer_id": 1,
                "component": 0,
                "provider": "a",
                "slot": "s1",
                "fee": 6,
                "bond": 12,
                "ready_at": 5,
                "available": True,
            },
            {
                "offer_id": 2,
                "component": 1,
                "provider": "b",
                "slot": "s2",
                "fee": 6,
                "bond": 12,
                "ready_at": 5,
                "available": True,
            },
        ],
    }


class Tests(unittest.TestCase):

    def test_minimal_coalition(self):
        cert = generate(scenario())

        self.assertTrue(verify(cert))
        self.assertEqual(len(cert["coalitions"]), 7)
        self.assertEqual(
            cert["minimal_coalitions"], [[1, 2, 3]]
        )
        self.assertEqual(
            cert["coalitions"][-1]["allocation"],
            [4, 4, 4]
        )

    def test_infeasible(self):
        data = scenario()
        data["buyers"][0]["cap"] = 0

        self.assertEqual(
            generate(data)["minimal_coalitions"], []
        )

    def test_bad_bond(self):
        data = scenario()
        data["offers"][1]["bond"] = 11

        self.assertIsNone(
            generate(data)["winning_pair"]
        )

    def test_input_order(self):
        data = scenario()
        data["buyers"].reverse()
        data["offers"].reverse()

        self.assertEqual(
            generate(data),
            generate(scenario())
        )

    def test_forged_certificate_with_valid_hash(self):
        cert = generate(scenario())
        cert["minimal_coalitions"] = [[1, 2]]

        body = {
            k: v for k, v in cert.items()
            if k != "certificate_hash"
        }

        cert["certificate_hash"] = hash_of(
            "GENESIS_CERT", body
        )

        self.assertFalse(verify(cert))


if __name__ == "__main__":
    unittest.main()
