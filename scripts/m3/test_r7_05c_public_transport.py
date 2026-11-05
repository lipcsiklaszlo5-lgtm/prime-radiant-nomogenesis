"""Guard the Genesis Certificate against JS number coercion."""

import json
import unittest
from pathlib import Path

from r7_genesis import generate
from r7_genesis_verify import verify


ROOT = Path(__file__).resolve().parents[2]

CERTIFICATE_PATH = ROOT / (
    "docs/evidence/R7-05C-genesis-certificate.json"
)


class CertificateTransportTests(unittest.TestCase):

    def test_certificate_retains_exact_u128_values(self):
        wrapper = json.loads(
            CERTIFICATE_PATH.read_text()
        )

        cert = wrapper["genesis_certificate"]

        self.assertTrue(
            verify(cert),
            "Original certificate must verify"
        )

        self.assertEqual(
            cert["certificate_hash"],
            "bedbdab514ff49e11be8a5585e38ac20"
            "a94d9ac74f4b6a4cbe165fcb794e864c",
        )

        for buyer in cert["input"]["buyers"]:
            self.assertIs(
                type(buyer["cap"]),
                int,
            )

            self.assertEqual(
                buyer["cap"],
                7 * 10**21,
            )

        for offer in cert["input"]["offers"]:
            self.assertIs(type(offer["fee"]), int)
            self.assertIs(type(offer["bond"]), int)

            self.assertEqual(
                offer["fee"],
                6 * 10**21,
            )

            self.assertEqual(
                offer["bond"],
                12 * 10**21,
            )

    def test_complete_certificate_reconstruction(self):
        cert = json.loads(
            CERTIFICATE_PATH.read_text()
        )["genesis_certificate"]

        rebuilt = generate(cert["input"])

        self.assertEqual(rebuilt, cert)

        self.assertEqual(
            rebuilt["minimal_coalitions"],
            [[4, 5], [4, 6], [5, 6]],
        )

        self.assertEqual(
            rebuilt["coalitions"][-1]["allocation"],
            [4 * 10**21] * 3,
        )


if __name__ == "__main__":
    unittest.main()
