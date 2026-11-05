"""Reproduce public NEAR Genesis evidence from a fresh workspace.

Default: fetch public transactions and archival state again.
--offline: verify recorded evidence without network access.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from r7_genesis import hash_of
from r7_genesis_verify import verify

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts/m3"

RECORDED_WITNESS = ROOT / (
    "docs/evidence/R7-02B-01-transaction-witness.json"
)
RECORDED_AWARD = ROOT / (
    "docs/evidence/R7-02B-03-award-transition.json"
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def equal_json(a, b):
    return json.dumps(
        a, sort_keys=True, separators=(",", ":"), allow_nan=False
    ) == json.dumps(
        b, sort_keys=True, separators=(",", ":"), allow_nan=False
    )


def validate(witness, award):
    """Check internal integrity and cross-document consistency."""

    cert = witness["genesis_certificate"]

    require(verify(cert), "invalid Genesis Certificate")
    require(
        witness["witness_hash"] == hash_of(
            "R7_CHAIN_WITNESS",
            {k: v for k, v in witness.items()
             if k != "witness_hash"},
        ),
        "witness hash mismatch",
    )
    require(
        award["evidence_hash"] == hash_of(
            "R7_AWARD_TRANSITION",
            {k: v for k, v in award.items()
             if k != "evidence_hash"},
        ),
        "award evidence hash mismatch",
    )

    require(
        witness["network"] == award["network"] == "testnet",
        "network mismatch",
    )
    require(
        witness["contract"] == award["contract"],
        "contract mismatch",
    )
    require(
        witness["award_tx"] == award["award_tx"],
        "award transaction mismatch",
    )
    require(
        witness["witness_hash"] == award["witness_hash"],
        "witness reference mismatch",
    )
    require(
        cert["certificate_hash"]
        == award["genesis_certificate_hash"],
        "certificate reference mismatch",
    )

    observations = witness["observations"]
    require(len(observations) == 10, "transaction count")
    require(
        len({row["tx"] for row in observations}) == 10,
        "duplicate transactions",
    )

    buyers = cert["input"]["buyers"]
    job_ids = [row["job_id"] for row in buyers]

    full = [
        row for row in cert["coalitions"]
        if row["job_ids"] == job_ids
    ]
    require(
        len(full) == 1 and full[0]["feasible"],
        "full coalition invalid",
    )

    allocations = [
        {"job_id": job_id, "amount": amount}
        for job_id, amount in zip(
            job_ids, full[0]["allocation"]
        )
    ]

    require(
        equal_json(allocations, award["allocations"]),
        "allocation mismatch",
    )
    require(
        equal_json(
            cert["winning_pair"], award["selected_pair"]
        ),
        "selected pair mismatch",
    )

    price = cert["winning_pair"]["price"]
    offers = cert["input"]["offers"]
    selected_ids = set(cert["winning_pair"]["offers"])

    expected_refunds = (
        sum(b["cap"] for b in buyers) - price
        + sum(
            o["bond"] - price
            for o in offers if o["offer_id"] in selected_ids
        )
    )

    refunds = int(award["total_refunds"])
    require(
        refunds == expected_refunds,
        "refund calculation mismatch",
    )

    old_escrow = int(award["escrow_before"])
    new_escrow = int(award["escrow_after"])
    old_claims = int(award["claimable_before"])
    new_claims = int(award["claimable_after"])

    require(
        old_escrow - new_escrow == refunds,
        "escrow delta mismatch",
    )
    require(
        new_claims - old_claims == refunds,
        "claimable delta mismatch",
    )
    require(
        old_escrow + old_claims == new_escrow + new_claims,
        "liability conservation mismatch",
    )

    return True


def replay_online():
    """Regenerate evidence without touching committed artifacts."""

    with tempfile.TemporaryDirectory(
        prefix="nomogenesis-genesis-replay-"
    ) as directory:

        temporary = Path(directory)
        preflight = temporary / "preflight.json"
        witness_path = temporary / "witness.json"
        history_path = temporary / "history.json"
        award_path = temporary / "award.json"

        env = dict(os.environ)
        env.update({
            "NMG_R7_PREFLIGHT_PATH": str(preflight),
            "NMG_R7_WITNESS_PATH": str(witness_path),
            "NMG_R7_HISTORY_PATH": str(history_path),
            "NMG_R7_AWARD_PATH": str(award_path),
            "NMG_R7_ARCHIVE_PACE_FILE": str(temporary / "archive-pace.txt"),
        })

        stages = (
            "r7_chain_probe.py",
            "r7_chain_reconcile.py",
            "r7_historical_probe.py",
            "r7_award_transition.py",
        )

        for index, name in enumerate(stages, 1):
            print(
                f"\n=== REPLAY STAGE {index}/4: {name} ===",
                flush=True,
            )

            subprocess.run(
                [sys.executable, "-B", "-u", str(SCRIPTS / name)],
                cwd=ROOT,
                env=env,
                check=True,
            )

        fresh_witness = json.loads(witness_path.read_text())
        fresh_award = json.loads(award_path.read_text())

        validate(fresh_witness, fresh_award)

        recorded_witness = json.loads(
            RECORDED_WITNESS.read_text()
        )
        recorded_award = json.loads(
            RECORDED_AWARD.read_text()
        )

        require(
            equal_json(fresh_witness, recorded_witness),
            "public transaction witness drift",
        )
        require(
            equal_json(fresh_award, recorded_award),
            "historical award evidence drift",
        )

        print("LIVE TRANSACTION REPLAY: PASS")
        print("ARCHIVAL STATE REPLAY: PASS")
        print("COMMITTED EVIDENCE COMPARISON: PASS")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--offline",
        action="store_true",
        help="check recorded evidence without new RPC queries",
    )
    args = parser.parse_args()

    if args.offline:
        validate(
            json.loads(RECORDED_WITNESS.read_text()),
            json.loads(RECORDED_AWARD.read_text()),
        )
        print("OFFLINE ARTIFACT INTEGRITY: PASS")
        print("LIVE NETWORK REPLAY: NOT PERFORMED")
    else:
        replay_online()

    print("GENESIS PUBLIC REPLAY: PASS")


if __name__ == "__main__":
    main()
