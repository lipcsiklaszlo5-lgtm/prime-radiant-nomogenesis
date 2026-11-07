"""Exhaustive bounded participation-game benchmark.

This is an offline synthetic strategic model.
It does not establish incentive compatibility.
"""

import copy
import json
import sys
from pathlib import Path

from r7_06_formation import form
from r7_06c_competition import signed_source

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs/evidence/R7-BENCH-02-equilibria.json"


def assess(market, nonexcludable):
    buyers = sorted(
        market["buyers"],
        key=lambda b: b["job_id"],
    )

    count = len(buyers)
    if not 1 <= count <= 6:
        raise ValueError("buyer count outside bounds")

    ids = [b["job_id"] for b in buyers]
    if len(set(ids)) != count:
        raise ValueError("duplicate buyer")

    profiles = []

    for mask in range(1 << count):
        state = copy.deepcopy(market)

        active = {
            buyer["job_id"]: bool(mask & (1 << i))
            for i, buyer in enumerate(buyers)
        }

        for buyer in state["buyers"]:
            buyer["active"] = active[buyer["job_id"]]

        selected = form(state)["selected"]
        recovered = selected is not None

        payments = dict(
            zip(
                selected["job_ids"],
                selected["payments"],
            )
        ) if recovered else {}

        if recovered:
            assert sum(payments.values()) == selected["price"]

        utilities = {}

        for buyer in buyers:
            job_id = buyer["job_id"]
            incremental = max(
                0,
                buyer["value"] - buyer["outside_option"],
            )

            is_payer = job_id in payments
            payment = payments.get(job_id, 0)

            if is_payer:
                assert payment <= buyer["cap"]
                assert payment <= incremental

            receives_benefit = (
                recovered
                and (
                    nonexcludable
                    or is_payer
                )
            )

            benefit = incremental if receives_benefit else 0
            utilities[job_id] = benefit - payment

            assert utilities[job_id] >= 0

        profiles.append({
            "mask": mask,
            "active_jobs": [
                job_id for job_id in ids
                if active[job_id]
            ],
            "recovered": recovered,
            "selected_jobs": (
                selected["job_ids"] if recovered else []
            ),
            "price": selected["price"] if recovered else 0,
            "payments": [
                {
                    "job_id": job_id,
                    "amount": payments.get(job_id, 0),
                }
                for job_id in ids
            ],
            "utilities": [
                {
                    "job_id": job_id,
                    "utility": utilities[job_id],
                }
                for job_id in ids
            ],
        })

    # One-agent deviations hold everybody else's
    # participation decision unchanged.
    for row in profiles:
        deviations = []

        for i, job_id in enumerate(ids):
            alternative = profiles[
                row["mask"] ^ (1 << i)
            ]

            current_utility = row["utilities"][i]["utility"]
            alternative_utility = (
                alternative["utilities"][i]["utility"]
            )

            if alternative_utility > current_utility:
                deviations.append({
                    "job_id": job_id,
                    "action": (
                        "opt_out"
                        if row["mask"] & (1 << i)
                        else "opt_in"
                    ),
                    "utility_gain": (
                        alternative_utility - current_utility
                    ),
                    "recovery_after": (
                        alternative["recovered"]
                    ),
                })

        row["profitable_deviations"] = deviations
        row["unilaterally_stable"] = not deviations

    stable = [
        row for row in profiles
        if row["unilaterally_stable"]
    ]

    return {
        "benefit_model": (
            "nonexcludable"
            if nonexcludable else "payer_excludable"
        ),
        "buyer_count": count,
        "profile_count": len(profiles),
        "stable_profile_count": len(stable),
        "stable_recovery_count": sum(
            row["recovered"] for row in stable
        ),
        "stable_no_recovery_count": sum(
            not row["recovered"] for row in stable
        ),
        "profiles": profiles,
    }


def build_report(reference, source_hash):
    expanded = copy.deepcopy(reference)

    # Explicitly hypothetical third participant.
    # This does not alter the historical signatures.
    expanded["buyers"][2]["outside_option"] = 0

    cases = {
        "historical_two_effective_buyers": reference,
        "hypothetical_three_effective_buyers": expanded,
    }

    results = {}

    for name, market in cases.items():
        results[name] = {
            "nonexcludable": assess(market, True),
            "payer_excludable": assess(market, False),
        }

    return {
        "version": "r7-bench-02-v1",
        "source_report_hash": source_hash,
        "data_type": "synthetic counterfactual",
        "equilibrium_definition": (
            "no strictly profitable unilateral "
            "participation toggle"
        ),
        "results": results,
        "limitations": [
            "All utility values are declared assumptions",
            "Third buyer scenario is not newly signed",
            "Opt-in and opt-out are the only actions",
            "Actions are simultaneous and costless",
            "No dynamic bidding or coalition deviations",
            "No provider strategic response to exits",
            "No endogenous delivery probability",
            "Excludability is assumed, not implemented",
            "No on-chain enforcement of participation",
            "No proof of dominant-strategy truthfulness",
        ],
    }


def main():
    if sys.argv[1:] not in ([], ["--verify"]):
        raise ValueError("usage: [--verify]")

    signed = signed_source()

    report = build_report(
        signed["market"],
        signed["report_hash"],
    )

    if sys.argv[1:] == ["--verify"]:
        if json.loads(OUTPUT.read_text()) != report:
            raise ValueError("benchmark evidence drift")
    else:
        with OUTPUT.open("x") as file:
            json.dump(
                report,
                file,
                indent=2,
                sort_keys=True,
            )
            file.write("\n")

    for name, models in report["results"].items():
        for model, result in models.items():
            full = result["profiles"][-1]

            print(
                "BENCHMARK",
                name,
                model,
                "profiles=" + str(result["profile_count"]),
                "stable=" + str(
                    result["stable_profile_count"]
                ),
                "stable_recoveries=" + str(
                    result["stable_recovery_count"]
                ),
                "all_active_stable=" + str(
                    full["unilaterally_stable"]
                ),
            )

    print("R7-BENCH-02 EQUILIBRIUM AUDIT: PASS")


if __name__ == "__main__":
    main()
