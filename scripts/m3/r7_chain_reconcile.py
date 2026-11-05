"""Transaction-derived Genesis witness.

Not an authenticated pre-award market snapshot.
"""

import json
from pathlib import Path

from r7_genesis import generate, hash_of
from r7_genesis_verify import verify

ROOT = Path(__file__).resolve().parents[2]

STEPS = (
    "case",
    "buyer0-fund", "worker0-accept",
    "buyer1-fund", "worker1-accept",
    "buyer2-fund", "worker2-accept",
    "provider0-offer", "provider1-offer",
    "award",
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def decimal(value, name):
    require(
        type(value) is str
        and value.isascii()
        and value.isdecimal()
        and (value == "0" or not value.startswith("0")),
        name,
    )

    amount = int(value)
    require(
        0 <= amount < (1 << 128),
        name + " exceeds u128",
    )
    return amount


def derive(manifest, preflight):
    """Derive the selected-case economic witness."""

    require(manifest["network"] == "testnet", "network")
    require(
        preflight["contract"] == manifest["contract"],
        "contract mismatch",
    )
    require(
        preflight["source"] == "public-near-testnet-transactions",
        "source",
    )
    require(preflight["rpc_count"] == 2, "RPC count")

    rows = preflight["transactions"]

    require(
        type(rows) is list and len(rows) == len(STEPS),
        "transaction count",
    )

    indexed = {row["step"]: row for row in rows}

    require(
        len(indexed) == len(STEPS)
        and set(indexed) == set(STEPS),
        "missing or duplicate transaction",
    )

    manifest_rows = {
        row["step"]: row
        for row in manifest["transactions"]
    }

    for step in STEPS:
        observed = indexed[step]
        expected = manifest_rows[step]

        for key in ("tx", "signer", "method"):
            require(
                observed[key] == expected[key],
                step + " " + key,
            )

        require(
            type(observed["args"]) is dict,
            step + " arguments",
        )
        require(
            type(observed["args_sha256"]) is str
            and len(observed["args_sha256"]) == 64,
            step + " argument hash",
        )
        require(
            type(observed["block_hash"]) is str
            and bool(observed["block_hash"]),
            step + " block hash",
        )

    case_id = list(
        bytes.fromhex(manifest["case_id_hex"])
    )

    require(len(case_id) == 32, "case ID")

    descriptor = indexed["case"]["args"]["descriptor"]
    deadline = descriptor["recovery_deadline"]

    require(
        type(deadline) is int
        and 0 < deadline < (1 << 64),
        "recovery deadline",
    )

    require(
        descriptor["dependency_deadline"]
        < descriptor["bid_close"]
        < descriptor["award_close"]
        < deadline,
        "case timeline",
    )

    require(
        indexed["award"]["args"]["case_id"] == case_id,
        "award case",
    )

    # Derive buyers from signed funding transactions.
    buyers = []

    for i in range(3):
        funded = indexed[
            f"buyer{i}-fund"
        ]["args"]["input"]

        job_id = manifest["job_ids"][i]

        require(
            funded["case_id"] == case_id,
            "buyer case",
        )
        require(
            indexed[f"worker{i}-accept"]["args"]["job_id"]
            == job_id,
            "accepted job",
        )
        require(
            funded["worker"] ==
            manifest["actors"][f"worker{i}"],
            "worker identity",
        )

        cap = decimal(
            funded["rescue_cap"], "rescue_cap"
        )
        require(cap > 0, "zero cap")

        buyers.append({
            "job_id": job_id,
            "cap": cap,
        })

    # Derive provider terms from signed offers.
    offers = []

    for i in range(2):
        row = indexed[f"provider{i}-offer"]
        args = row["args"]["input"]

        require(
            args["case_id"] == case_id,
            "offer case",
        )
        require(
            args["component_index"] == i,
            "component mismatch",
        )

        fee = decimal(args["fee"], "fee")
        bond = decimal(
            args["bond_capacity"], "bond_capacity"
        )

        require(
            fee > 0 and bond >= fee,
            "unfunded offer",
        )

        offers.append({
            "offer_id": manifest["offer_ids"][i],
            "component": i,
            "provider": row["signer"],
            "slot": args["slot_id"],
            "fee": fee,
            "bond": bond,

            # Surrogate deadline, NOT measured readiness.
            "ready_at": deadline,

            # Inferred from successful historical award.
            "available": True,
        })

    snapshot = {
        "deadline": deadline,
        "buyers": buyers,
        "offers": offers,
    }

    certificate = generate(snapshot)

    require(
        verify(certificate),
        "Genesis verification failed",
    )

    pair = certificate["winning_pair"]

    require(pair is not None, "no viable pair")
    require(
        pair["offers"] == manifest["offer_ids"],
        "awarded pair mismatch",
    )
    require(
        bool(certificate["minimal_coalitions"]),
        "no feasible coalition",
    )

    witness = {
        "version": "r7-02b-01-transaction-derived",
        "network": "testnet",
        "contract": manifest["contract"],
        "case_id_hex": manifest["case_id_hex"],
        "contract_wasm_sha256": manifest["wasm_sha256"],
        "award_tx": indexed["award"]["tx"],

        "observations": [
            {
                key: indexed[step][key]
                for key in (
                    "step", "tx", "block_hash",
                    "args_sha256",
                )
            }
            for step in STEPS
        ],

        "genesis_certificate": certificate,

        "provenance": (
            "10 cross-RPC-checked historical "
            "transaction arguments"
        ),

        "limitations": [
            "Not an authenticated pre-award snapshot",
            "Full historical eligibility unverified",
            "Historical slot occupancy unverified",
            "Offer availability inferred from award",
            "Ready-at is a deadline surrogate",
            "Unobserved market alternatives excluded",
            "Actor independence not established",
        ],
    }

    witness["witness_hash"] = hash_of(
        "R7_CHAIN_WITNESS", witness
    )

    return witness


def main():
    manifest = json.loads(
        (ROOT / "docs/evidence/R6-05-public.json")
        .read_text()
    )

    preflight = json.loads(
        Path(
            "/workspaces/nomogenesis-r7-chain-preflight.json"
        ).read_text()
    )

    witness = derive(manifest, preflight)

    destination = ROOT / (
        "docs/evidence/"
        "R7-02B-01-transaction-witness.json"
    )

    destination.write_text(
        json.dumps(witness, indent=2) + "\n"
    )

    cert = witness["genesis_certificate"]
    unit = int(manifest["unit_yocto"])

    allocations = cert["coalitions"][-1]["allocation"]

    print("OBSERVED TRANSACTIONS:", len(
        witness["observations"]
    ))
    print("MINIMAL COALITIONS:",
          cert["minimal_coalitions"])
    print("ALLOCATION IN UNIT:",
          [amount // unit for amount in allocations])
    print("WINNING PRICE IN UNIT:",
          cert["winning_pair"]["price"] // unit)
    print("CERTIFICATE VERIFY:",
          "PASS" if verify(cert) else "FAIL")
    print("WITNESS SHA256:",
          witness["witness_hash"])
    print("FULL HISTORICAL STATE VERIFIED: NO")
    print("R7-02B/01 TRANSACTION WITNESS: PASS")


if __name__ == "__main__":
    main()
