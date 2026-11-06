"""Explain bounded supplier competition and verify clearing.

Uses the existing Genesis formation result, then
independently enumerates and ranks complete provider pairs.

Offline synthetic economics; no NEAR transactions.
"""

import copy
import json
import subprocess
import sys
from pathlib import Path

from r7_genesis import hash_of
from r7_genesis_schema import MAX_U128
from r7_06_formation import form

ROOT = Path(__file__).resolve().parents[2]

SIGNED = ROOT / (
    "docs/evidence/"
    "R7-06B-synthetic-signed-decisions.json"
)

OUTPUT = ROOT / (
    "docs/evidence/"
    "R7-06C-competition-audit.json"
)


def audit(market, origin_hash="synthetic-test"):
    """Construct a deterministic explanatory clearing witness."""

    formation = form(market)

    offers = sorted(
        market["offers"],
        key=lambda o: o["offer_id"],
    )

    left = [
        o for o in offers
        if o["component"] == 0
    ]

    right = [
        o for o in offers
        if o["component"] == 1
    ]

    rows = []

    for a in left:
        for b in right:
            price = a["fee"] + b["fee"]
            reasons = []

            if not a["available"] or not b["available"]:
                reasons.append("unavailable_provider")

            if (
                a["fee"] < a["cost_floor"]
                or b["fee"] < b["cost_floor"]
            ):
                reasons.append("supplier_policy_refusal")

            if (
                a["ready_at"] > market["deadline"]
                or b["ready_at"] > market["deadline"]
            ):
                reasons.append("missed_deadline")

            if a["provider"] == b["provider"]:
                reasons.append("same_provider")

            if a["slot"] == b["slot"]:
                reasons.append("capacity_slot_conflict")

            if price > MAX_U128:
                reasons.append("pair_price_overflow")

            if (
                a["bond"] < price
                or b["bond"] < price
            ):
                reasons.append("insufficient_provider_bond")

            rows.append({
                "offers": [
                    a["offer_id"],
                    b["offer_id"],
                ],
                "price": price,
                "eligible": not reasons,
                "reasons": reasons,
            })

    eligible = sorted(
        (r for r in rows if r["eligible"]),
        key=lambda r: (
            r["price"],
            r["offers"][0],
            r["offers"][1],
        ),
    )

    expected = (
        {
            "price": eligible[0]["price"],
            "offers": eligible[0]["offers"],
        }
        if eligible else None
    )

    actual = formation[
        "genesis_certificate"
    ]["winning_pair"]

    if actual != expected:
        raise ValueError(
            "Independent provider ranking contradicts Genesis"
        )

    selected = formation["selected"]

    if selected is not None:
        if selected["pair"] != expected["offers"]:
            raise ValueError(
                "Selected coalition uses wrong provider pair"
            )

        if selected["price"] != expected["price"]:
            raise ValueError(
                "Selected coalition has incorrect price"
            )

        if sum(selected["payments"]) != expected["price"]:
            raise ValueError(
                "Buyer payments do not cover clearing price"
            )

        if any(
            utility < 0
            for utility in selected[
                "buyer_utility_margins"
            ]
        ):
            raise ValueError(
                "Buyer worse than declared outside option"
            )

    if not left or not right:
        market_reason = "missing_required_component"
    elif expected is None:
        market_reason = "no_admissible_provider_pair"
    elif selected is None:
        market_reason = "no_voluntary_funded_coalition"
    else:
        market_reason = "voluntary_coalition_formed"

    body = {
        "version": "r7-06c-offline-competition-v1",
        "origin_report_hash": origin_hash,
        "market_hash": formation["source_hash"],
        "examined_pair_count": len(rows),
        "admissible_pair_count": len(eligible),
        "pair_evidence": rows,
        "clearing_order": [
            r["offers"] for r in eligible
        ],
        "winning_pair": expected,
        "selected_formation": selected,
        "genesis_certificate_hash":
            formation["genesis_certificate"][
                "certificate_hash"
            ],
        "market_reason": market_reason,
        "limitations": [
            "Declared synthetic provider costs",
            "No independent owner identities",
            "Pair enumeration is bounded to six offers",
            "No incentive compatibility proof",
            "No physical capacity attestation",
            "No on-chain subset selection",
            "No new NEAR settlement executed",
        ],
    }

    return {
        **body,
        "witness_hash": hash_of(
            "R7_06C_COMPETITION",
            body,
        ),
    }


def verify_witness(witness, market, origin_hash):
    """Reject any altered winner, rationale or economics."""

    return type(witness) is dict and witness == audit(
        market, origin_hash
    )


def signed_source():
    """Fail closed unless the entire R7-06B transcript verifies."""

    cmd = [
        "node",
        "scripts/m3/r7_06_swarm.cjs",
        "--verify",
        str(SIGNED),
    ]

    result = subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=90,
        check=False,
    )

    if result.returncode:
        raise RuntimeError(
            "R7-06B signature verification failed:\n"
            + result.stderr
            + result.stdout
        )

    print(
        "SIGNED SEVEN-AGENT SOURCE: PASS"
    )

    return json.loads(SIGNED.read_text())


def main():
    if len(sys.argv) > 2:
        raise ValueError(
            "usage: r7_06c_competition.py [--verify]"
        )

    verify_only = len(sys.argv) == 2

    if verify_only and sys.argv[1] != "--verify":
        raise ValueError("unknown argument")

    report = signed_source()

    market = report["market"]

    result = audit(
        market,
        report["report_hash"],
    )

    if verify_only:
        recorded = json.loads(
            OUTPUT.read_text()
        )

        if not verify_witness(
            recorded,
            market,
            report["report_hash"],
        ):
            raise ValueError(
                "Competitive clearing evidence mismatch"
            )
    else:
        with OUTPUT.open("x") as f:
            json.dump(
                result,
                f,
                indent=2,
                sort_keys=True,
            )
            f.write("\n")

    expected = {
        "price": 11,
        "offers": [3, 2],
    }

    assert result["winning_pair"] == expected

    assert result["examined_pair_count"] == 4
    assert result["admissible_pair_count"] == 2

    assert result["clearing_order"] == [
        [3, 2],
        [1, 2],
    ]

    assert result["selected_formation"]["job_ids"] == [
        1, 2
    ]

    assert result["selected_formation"]["payments"] == [
        6, 5
    ]

    print(
        "PAIRS EXAMINED:",
        result["examined_pair_count"]
    )

    for row in result["pair_evidence"]:
        print(
            "PAIR",
            row["offers"],
            "PRICE",
            row["price"],
            "ELIGIBLE" if row["eligible"] else
            "REJECTED " + ",".join(row["reasons"]),
        )

    print(
        "WINNING PAIR:",
        result["winning_pair"]
    )

    print(
        "COALITION:",
        result["selected_formation"]["job_ids"]
    )

    print(
        "WITNESS SHA256:",
        result["witness_hash"]
    )

    print(
        "R7-06C COMPETITIVE CLEARING:",
        "VERIFIED" if verify_only else "GENERATED"
    )


if __name__ == "__main__":
    main()
