"""Compare signed off-chain coalition with M3 V1 selection.

Models hypothetical contract states. This does NOT
authenticate current chain state, bind NEAR identities,
prove exclusion or perform a blockchain transaction.
"""

import copy
import hashlib
import json
import sys
from pathlib import Path

from r7_genesis import generate, hash_of
from r7_06_formation import form
from r7_06c_competition import (
    OUTPUT as COMPETITION,
    signed_source,
    verify_witness,
)
from r7_06d_economics import OUTPUT as ECONOMICS

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / (
    "docs/evidence/R7-06E-authorization-boundary.json"
)

RUST_FILES = {
    "lib": "src/lib.rs",
    "clearing": "src/rescue_clearing.rs",
    "award": "src/rescue_award.rs",
    "worker": "src/rescue_worker_completion.rs",
}


def inspect_contract():
    sources = {
        name: (ROOT / path).read_text()
        for name, path in RUST_FILES.items()
    }

    checks = {
        "case_id_only_award":
            "pub fn award_rescue_bundle(&mut self, case_id: Vec<u8>) -> u64"
            in sources["lib"],

        "buyer_owned_mandate_revocation":
            "pub fn revoke_open_rescue_mandate(&mut self, job_id: u64)"
            in sources["lib"]
            and 'assert_eq!(caller, job.buyer, "not rescue job buyer");'
            in sources["lib"],

        "all_open_accepted_jobs_eligible":
            "eligible_job_ids.push(*id);"
            in sources["clearing"]
            and "RescueJobPhase::Accepted"
            in sources["clearing"]
            and "RescueMandatePhase::Open"
            in sources["clearing"],

        "award_uses_eligible_job_set":
            "for job_id in &pair.eligible_job_ids"
            in sources["award"]
            and "allocate_rescue_cost(&caps, pair.total_price)"
            in sources["award"],

        "worker_completion_uses_case_not_allocation":
            "case.job_ids.contains(&job_id)"
            in sources["worker"]
            and "RescueBundlePhase::SettledSuccess"
            in sources["worker"]
            and "bundle.allocations" not in sources["worker"],
    }

    if not all(checks.values()):
        raise ValueError(
            "Rust contract assumptions changed; human review required: "
            + str(checks)
        )

    digests = {
        name: hashlib.sha256(
            sources[name].encode()
        ).hexdigest()
        for name in RUST_FILES
    }

    return {
        "checks": checks,
        "source_sha256": digests,
    }


def project(market, funded, posted, revoked=()):
    """Predict bounded M3 V1 eligible-set clearing.

    All listed funded jobs are hypothetically Accepted,
    with Open mandates unless explicitly revoked.
    All posted offers are hypothetically Open and
    unencumbered. These are NOT RPC observations.
    """

    buyers = {
        b["job_id"]: b for b in market["buyers"]
    }

    offers = {
        o["offer_id"]: o for o in market["offers"]
    }

    funded = sorted(set(funded))
    posted = sorted(set(posted))
    revoked = sorted(set(revoked))

    if not set(funded).issubset(buyers):
        raise ValueError("unknown hypothetical buyer")

    if not set(posted).issubset(offers):
        raise ValueError("unknown hypothetical offer")

    if not set(revoked).issubset(funded):
        raise ValueError("revocation without funded mandate")

    eligible = [
        job_id for job_id in funded
        if job_id not in revoked
    ]

    if not eligible:
        return {
            "eligible_jobs": [],
            "posted_offers": posted,
            "revoked_jobs": revoked,
            "winning_pair": None,
            "allocations": [],
        }

    snapshot = {
        "deadline": market["deadline"],
        "buyers": [
            {
                "job_id": job_id,
                "cap": buyers[job_id]["cap"],
            }
            for job_id in eligible
        ],
        "offers": [
            {
                key: offers[offer_id][key]
                for key in (
                    "offer_id", "component",
                    "provider", "slot", "fee",
                    "bond", "ready_at", "available"
                )
            }
            for offer_id in posted
        ],
    }

    cert = generate(snapshot)

    all_jobs = next(
        row for row in cert["coalitions"]
        if row["job_ids"] == eligible
    )

    winner = (
        cert["winning_pair"]
        if all_jobs["feasible"]
        else None
    )

    allocations = (
        [
            {
                "job_id": job_id,
                "amount": amount,
            }
            for job_id, amount in zip(
                eligible, all_jobs["allocation"]
            )
        ]
        if winner is not None
        else []
    )

    return {
        "eligible_jobs": eligible,
        "posted_offers": posted,
        "revoked_jobs": revoked,
        "winning_pair": winner,
        "allocations": allocations,
    }


def assess(market, funded, posted, revoked=()):
    target = form(market)["selected"]

    if target is None:
        raise ValueError("reference has no selected coalition")

    predicted = project(
        market, funded, posted, revoked
    )

    expected = [
        {
            "job_id": job_id,
            "amount": amount,
        }
        for job_id, amount in zip(
            target["job_ids"],
            target["payments"]
        )
    ]

    winner = predicted["winning_pair"]

    matching = (
        winner is not None
        and winner["offers"] == target["pair"]
        and winner["price"] == target["price"]
        and predicted["allocations"] == expected
    )

    buyer_by_id = {
        b["job_id"]: b for b in market["buyers"]
    }

    over_willingness = []
    unauthorized_sponsors = []

    for allocation in predicted["allocations"]:
        job_id = allocation["job_id"]
        b = buyer_by_id[job_id]

        willing_limit = (
            min(
                b["cap"],
                b["value"] - b["outside_option"]
            )
            if (
                b["active"]
                and b["value"] > b["outside_option"]
            )
            else 0
        )

        if allocation["amount"] > willing_limit:
            over_willingness.append(job_id)

        if willing_limit == 0:
            unauthorized_sponsors.append(job_id)

    offer_by_id = {
        o["offer_id"]: o for o in market["offers"]
    }

    seller_refusals = (
        [
            offer_id
            for offer_id in winner["offers"]
            if (
                not offer_by_id[offer_id]["available"]
                or offer_by_id[offer_id]["fee"]
                < offer_by_id[offer_id]["cost_floor"]
            )
        ]
        if winner else []
    )

    return {
        "hypothetical_m3_prediction": predicted,
        "matches_offchain_formation": matching,
        "over_willingness_jobs": over_willingness,
        "unwilling_funded_jobs": unauthorized_sponsors,
        "selected_refusing_offers": seller_refusals,
        "requires_actual_onchain_revocations":
            bool(revoked),
        "proven_near_authorization": False,
        "proven_onchain_execution": False,
    }


def build_report(market, signed_hash,
                 competition_hash, economic_hash):
    contract = inspect_contract()

    altered_value = copy.deepcopy(market)

    altered_value["buyers"][0][
        "outside_option"
    ] = 6

    scenarios = {
        "only_selected_enrolled": assess(
            market, [1, 2], [1, 2, 3]
        ),

        "all_three_enrolled": assess(
            market, [1, 2, 3], [1, 2, 3]
        ),

        "third_buyer_revoked_before_award": assess(
            market, [1, 2, 3], [1, 2, 3], [3]
        ),

        "seller_refusal_ignored_if_offer_posted": assess(
            market, [1, 2], [1, 2, 3, 4]
        ),

        "last_minute_buyer_withdrawal": assess(
            market, [1, 2], [1, 2, 3], [2]
        ),

        "onchain_cap_exceeds_economic_willingness": assess(
            altered_value, [1, 2], [1, 2, 3]
        ),
    }

    body = {
        "version": "r7-06e-contract-boundary-v1",
        "signed_decisions_hash": signed_hash,
        "competition_hash": competition_hash,
        "economics_hash": economic_hash,
        "rust_source_inspection": contract,
        "scenarios": scenarios,
        "findings": [
            "M3 V1 derives all eligible accepted/open funded jobs at award",
            "M3 V1 receives no caller-specified approved coalition",
            "Buyer mandate revocation is a separate signed on-chain action",
            "Permissionless award can race proposed off-chain coordination",
            "Current M3 funding cap is not the private economic willingness cap",
            "On-chain posted bids override off-chain supplier cost-floor refusal",
            "Worker completion has no allocation membership check",
            "Access to a non-excludable physical or shared benefit cannot be guaranteed by a ledger alone",
            "None of these hypothetical states is a verified NEAR execution",
        ],
        "required_next_design": [
            "Bind actors to NEAR buyer/provider identities and real funded records",
            "Bind explicit authorized job IDs, caps, expiry and exact allocations to case",
            "Verify signer authority and prevent replay before atomic award",
            "Make sponsor opt-in and withdrawal ordering unambiguous",
            "Decide worker eligibility and refunds for excluded jobs",
            "Do not claim that generic shared benefits can always be excluded",
            "Preserve M2/M3 escrow, bonds, storage and native payout invariants",
        ],
    }

    return {
        **body,
        "evidence_hash": hash_of(
            "R7_06E_CONTRACT_BOUNDARY",
            body,
        ),
    }


def main():
    if len(sys.argv) > 2 or (
        len(sys.argv) == 2
        and sys.argv[1] != "--verify"
    ):
        raise ValueError("usage: [--verify]")

    signed = signed_source()

    competition = json.loads(
        COMPETITION.read_text()
    )

    if not verify_witness(
        competition,
        signed["market"],
        signed["report_hash"],
    ):
        raise ValueError("R7-06C witness invalid")

    economic = json.loads(
        ECONOMICS.read_text()
    )

    if (
        economic["source_signed_report_hash"]
        != signed["report_hash"]
        or economic["source_competition_hash"]
        != competition["witness_hash"]
    ):
        raise ValueError("R7-06D provenance mismatch")

    report = build_report(
        signed["market"],
        signed["report_hash"],
        competition["witness_hash"],
        economic["evidence_hash"],
    )

    if len(sys.argv) == 2:
        if json.loads(OUTPUT.read_text()) != report:
            raise ValueError(
                "contract boundary reconstruction mismatch"
            )

        print("CONTRACT BOUNDARY REPRODUCTION: PASS")
    else:
        with OUTPUT.open("x") as f:
            json.dump(
                report, f,
                indent=2, sort_keys=True
            )
            f.write("\n")

        print("CONTRACT BOUNDARY WITNESS: CREATED")

    for name, row in report["scenarios"].items():
        print(
            name,
            "MATCHES:",
            row["matches_offchain_formation"],
            "OVER-WILLINGNESS:",
            row["over_willingness_jobs"],
        )

    print(
        "SOURCE INSPECTION:",
        "PASS"
    )

    print(
        "WITNESS SHA256:",
        report["evidence_hash"]
    )

    print("R7-06E/00 AUTHORIZATION BOUNDARY: PASS")


if __name__ == "__main__":
    main()
