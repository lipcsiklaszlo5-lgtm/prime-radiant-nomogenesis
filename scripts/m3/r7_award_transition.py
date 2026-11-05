"""R7-02B/03: read-only award-state reconciliation."""

import json
from pathlib import Path

from r7_genesis import hash_of
from r7_genesis_verify import verify
from r7_historical_probe import historical_view, rpc, check

ROOT = Path(__file__).resolve().parents[2]


def view(block, contract, method, args=None):
    return historical_view(block, contract, method, args or {})


def main():
    manifest = json.loads(
        (ROOT / "docs/evidence/R6-05-public.json").read_text()
    )
    witness = json.loads(
        (ROOT / "docs/evidence/R7-02B-01-transaction-witness.json")
        .read_text()
    )
    history = json.loads(
        Path("/workspaces/nomogenesis-r7-historical-state.json")
        .read_text()
    )

    cert = witness["genesis_certificate"]
    contract = manifest["contract"]
    parent = history["predecessor_block"]
    execution = history["execution_block"]
    bundle = manifest["bundle_id"]

    check(verify(cert), "certificate verification")
    check(witness["contract"] == contract, "contract")
    check(history["contract"] == contract, "historical contract")
    check(
        history["award_transaction"] == witness["award_tx"],
        "award transaction"
    )
    check(
        witness["witness_hash"] == hash_of(
            "R7_CHAIN_WITNESS",
            {k: v for k, v in witness.items()
             if k != "witness_hash"}
        ),
        "witness integrity"
    )

    # Establish the exact execution-block reference.
    block = rpc("block", {"block_id": execution})
    check(block["header"]["hash"] == execution, "execution block")
    check(block["header"]["prev_hash"] == parent, "parent block")

    timestamp = int(block["header"]["timestamp"])
    before = history["case"]

    check(
        before["bid_close"] <= timestamp < before["award_close"],
        "award time window"
    )
    check(before["phase"] == "Open", "pre-award case")
    check(before["awarded_bundle_id"] is None, "already awarded")
    check(before["job_ids"] == manifest["job_ids"], "job list")
    check(before["offer_ids"] == manifest["offer_ids"], "offer list")

    case_id = list(bytes.fromhex(manifest["case_id_hex"]))

    after = view(
        execution, contract, "get_rescue_case",
        {"case_id": case_id}
    )

    check(after["phase"] == "BundleAwarded", "post-award case")
    check(after["awarded_bundle_id"] == bundle, "bundle ID")
    check(after["job_ids"] == before["job_ids"], "post jobs")
    check(after["offer_ids"] == before["offer_ids"], "post offers")

    check(
        view(parent, contract, "has_rescue_bundle",
             {"bundle_id": bundle}) is False,
        "bundle already existed"
    )
    check(
        view(execution, contract, "has_rescue_bundle",
             {"bundle_id": bundle}) is True,
        "bundle was not created"
    )
    check(
        view(parent, contract, "next_rescue_bundle_id") == bundle,
        "prior bundle counter"
    )
    check(
        view(execution, contract, "next_rescue_bundle_id") == bundle + 1,
        "post bundle counter"
    )

    # Compare actual locked mandates with Genesis allocation.
    full = next(
        row for row in cert["coalitions"]
        if row["job_ids"] == manifest["job_ids"]
    )

    check(full["feasible"], "full coalition infeasible")

    allocations = dict(zip(full["job_ids"], full["allocation"]))
    price = cert["winning_pair"]["price"]

    check(sum(allocations.values()) == price, "allocation sum")

    refunds = {}

    for job, mandate in zip(history["jobs"], history["mandates"]):
        job_id = job["id"]
        check(
            job_id in allocations and mandate["job_id"] == job_id,
            "historical job mismatch"
        )
        check(
            job["phase"] == "Accepted"
            and mandate["phase"] == "Open",
            "job eligibility"
        )

        old_cap = int(mandate["held_principal"])
        expected_cap = next(
            buyer["cap"] for buyer in cert["input"]["buyers"]
            if buyer["job_id"] == job_id
        )
        check(old_cap == expected_cap, "original cap")

        locked = view(
            execution, contract, "get_rescue_mandate",
            {"job_id": job_id}
        )

        check(locked["phase"] == "Locked", "mandate lock")
        check(locked["locked_bundle_id"] == bundle, "mandate bundle")
        check(
            int(locked["held_principal"]) == allocations[job_id],
            "locked principal"
        )
        check(
            int(locked["locked_allocation"]) == allocations[job_id],
            "locked allocation"
        )

        account = job["buyer"]
        refunds[account] = (
            refunds.get(account, 0)
            + old_cap - allocations[job_id]
        )

    # Verify both independent provider-capacity locks.
    for offer in history["offers"]:
        offer_id = offer["id"]
        expected = next(
            x for x in cert["input"]["offers"]
            if x["offer_id"] == offer_id
        )

        check(offer["phase"] == "Open", "pre-offer phase")
        check(
            offer["provider"] == expected["provider"]
            and offer["slot_id"] == expected["slot"],
            "offer identity"
        )
        check(int(offer["fee"]) == expected["fee"], "offer fee")
        check(int(offer["held_bond"]) >= price, "prior bond")

        slot = {
            "provider": offer["provider"],
            "slot_id": offer["slot_id"]
        }

        check(
            view(parent, contract, "capacity_lock_holder", slot)
            is None,
            "slot occupied before award"
        )
        check(
            view(execution, contract, "capacity_lock_holder", slot)
            == {"M3RescueOffer": offer_id},
            "capacity lock mismatch"
        )

        locked = view(
            execution, contract, "get_rescue_offer",
            {"offer_id": offer_id}
        )

        check(locked["phase"] == "Locked", "offer lock")
        check(locked["locked_bundle_id"] == bundle, "offer bundle")
        check(int(locked["held_bond"]) == price, "bond lock amount")

        account = offer["provider"]
        refunds[account] = (
            refunds.get(account, 0)
            + int(offer["held_bond"]) - price
        )

    # Every credit must have a corresponding escrow reduction.
    total_refunds = sum(refunds.values())

    for account, expected_delta in refunds.items():
        balance_before = int(view(
            parent, contract, "get_claimable",
            {"account": account}
        ))
        balance_after = int(view(
            execution, contract, "get_claimable",
            {"account": account}
        ))

        check(
            balance_after - balance_before == expected_delta,
            "claimable delta: " + account
        )

    escrow_before = int(
        view(parent, contract, "m3_totals")["rescue_escrow"]
    )
    escrow_after = int(
        view(execution, contract, "m3_totals")["rescue_escrow"]
    )

    claims_before = int(view(parent, contract, "claimable_total"))
    claims_after = int(view(execution, contract, "claimable_total"))

    check(
        escrow_before - escrow_after == total_refunds,
        "escrow delta"
    )
    check(
        claims_after - claims_before == total_refunds,
        "claimable delta"
    )
    check(
        escrow_before + claims_before
        == escrow_after + claims_after,
        "liability conservation"
    )

    unit = int(manifest["unit_yocto"])

    evidence = {
        "version": "r7-02b-03-award-transition",
        "network": "testnet",
        "contract": contract,
        "award_tx": witness["award_tx"],
        "predecessor_block": parent,
        "execution_block": execution,
        "genesis_certificate_hash": cert["certificate_hash"],
        "witness_hash": witness["witness_hash"],
        "selected_pair": cert["winning_pair"],
        "allocations": [
            {"job_id": i, "amount": allocations[i]}
            for i in manifest["job_ids"]
        ],
        "total_refunds": str(total_refunds),
        "escrow_before": str(escrow_before),
        "escrow_after": str(escrow_after),
        "claimable_before": str(claims_before),
        "claimable_after": str(claims_after),
        "limitations": [
            "Single archival RPC provider",
            "No locally verified Merkle state proof",
            "Block-level view is not an isolated receipt-state proof",
            "No independent agent operators established"
        ]
    }

    evidence["evidence_hash"] = hash_of(
        "R7_AWARD_TRANSITION", evidence
    )

    path = ROOT / (
        "docs/evidence/R7-02B-03-award-transition.json"
    )
    path.write_text(json.dumps(evidence, indent=2) + "\n")

    print("AWARD EXECUTION WINDOW: PASS")
    print("BUNDLE CREATED: PASS")
    print("BUYER ALLOCATIONS:", [
        allocations[i] // unit for i in manifest["job_ids"]
    ])
    print("CAPACITY LOCKS: 2/2 PASS")
    print("REFUNDS IN UNIT:", total_refunds // unit)
    print("LIABILITY CONSERVATION: PASS")
    print("EVIDENCE:", path)
    print("R7-02B/03: PASS")


if __name__ == "__main__":
    main()
