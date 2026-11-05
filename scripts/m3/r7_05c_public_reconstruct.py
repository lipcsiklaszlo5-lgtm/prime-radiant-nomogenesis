"""Rebuild Genesis V1 from signed public Testnet calls.

Availability and ready_at remain surrogate assumptions.
This is not an authenticated historical state proof.
"""

import json
import sys
from pathlib import Path

from r7_genesis import generate
from r7_genesis_verify import verify


def reconstruct(bundle):
    evidence = bundle["evidence"]
    certificate_path = (
        Path(__file__).resolve().parents[2]
        / "docs/evidence/R7-05C-genesis-certificate.json"
    )

    wrapper = json.loads(
        certificate_path.read_text()
    )
    calls = bundle["observed"]
    cert = wrapper["genesis_certificate"]

    unit = 10 ** 21
    case_id = list(
        bytes.fromhex(evidence["case_id_hex"])
    )

    assert len(case_id) == 32
    assert calls["case"]["returned"] == case_id

    desc = calls["case"]["args"]["descriptor"]

    assert (
        desc["dependency_deadline"]
        < desc["bid_close"]
        < desc["award_close"]
        < desc["recovery_deadline"]
    )

    assert desc["descriptor_version"] == 1

    assert (
        calls["award"]["args"]["case_id"]
        == case_id
    )

    assert (
        calls["award"]["returned"]
        == evidence["bundle_id"]
    )

    assert (
        calls["settlement"]["args"]["bundle_id"]
        == evidence["bundle_id"]
    )

    assert (
        calls["withdraw"]["args"]["amount"]
        == str(20 * unit)
    )

    buyers = []

    for i, job_id in enumerate(evidence["jobs"]):
        funded = calls[f"buyer{i}-fund"]
        args = funded["args"]["input"]

        assert funded["returned"] == job_id
        assert args["case_id"] == case_id

        assert (
            args["worker"]
            == calls[f"worker{i}-accept"]["signer"]
        )

        assert (
            calls[f"worker{i}-accept"]["args"]["job_id"]
            == job_id
        )

        assert (
            calls[f"worker{i}-complete"]["args"]["job_id"]
            == job_id
        )

        assert (
            args["result_profile"]
            == "MinimumThreshold"
        )

        assert (
            int(args["worker_reward"])
            == 25 * unit
        )

        assert (
            int(args["rescue_cap"])
            == 7 * unit
        )

        buyers.append({
            "job_id": job_id,
            "cap": int(args["rescue_cap"]),
        })

    offers = []

    for i, offer_id in enumerate(evidence["offers"]):
        posted = calls[f"provider{i}-offer"]
        args = posted["args"]["input"]

        assert posted["returned"] == offer_id
        assert args["case_id"] == case_id
        assert args["component_index"] == i

        assert int(args["fee"]) == 6 * unit

        assert (
            int(args["bond_capacity"])
            == 12 * unit
        )

        assert (
            calls[f"proof{i}"]["signer"]
            == posted["signer"]
        )

        assert (
            calls[f"proof{i}"]["args"]["bundle_id"]
            == evidence["bundle_id"]
        )

        assert (
            calls[f"proof{i}"]["args"]["component_index"]
            == i
        )

        offers.append({
            "offer_id": offer_id,
            "component": i,
            "provider": posted["signer"],
            "slot": args["slot_id"],
            "fee": int(args["fee"]),
            "bond": int(args["bond_capacity"]),
            "ready_at": int(desc["bid_close"]),
            "available": True,
        })

    snapshot = {
        "deadline": int(desc["award_close"]),
        "buyers": buyers,
        "offers": offers,
    }

    expected = generate(snapshot)

    assert verify(cert)
    assert expected == cert, (
        "reconstructed certificate differs"
    )

    assert expected["minimal_coalitions"] == [
        [4, 5], [4, 6], [5, 6]
    ]

    assert expected["winning_pair"] == {
        "price": 12 * unit,
        "offers": [2, 3],
    }

    assert (
        expected["coalitions"][-1]["allocation"]
        == [4 * unit] * 3
    )

    assert (
        evidence["certificate_hash"]
        == expected["certificate_hash"]
    )

    return expected


if __name__ == "__main__":
    reconstructed = reconstruct(
        json.load(sys.stdin)
    )

    print(
        "GENESIS RECONSTRUCTED FROM SIGNED CALLS: PASS"
    )

    print(
        "MINIMAL COALITIONS:",
        reconstructed["minimal_coalitions"]
    )

    print(
        "CERTIFICATE SHA256:",
        reconstructed["certificate_hash"]
    )
