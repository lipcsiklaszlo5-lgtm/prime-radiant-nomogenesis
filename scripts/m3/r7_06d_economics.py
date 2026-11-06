"""R7-06D: falsifiable synthetic economic comparisons.

Same beneficiaries, same declared recovery benefit.
Separate supplier fees, resource cost and capital charge.
Non-excludable recovery is an explicit extra assumption.
No NEAR writes, real ROI or coalition-proofness claims.
"""

import copy
import json
import sys
from pathlib import Path

from r7_genesis import generate, hash_of
from r7_genesis_schema import MAX_U128, MAX_U64
from r7_06_formation import form
from r7_06c_competition import (
    OUTPUT as COMPETITION,
    audit,
    signed_source,
    verify_witness,
)

ROOT = Path(__file__).resolve().parents[2]

OUTPUT = ROOT / (
    "docs/evidence/R7-06D-economic-counterfactuals.json"
)

OPTION_KEYS = {
    "available",
    "ready_at",
    "price",
    "resource_cost",
    "capital_charge",
    "locked_capital",
}


def uint(value, upper=MAX_U128):
    if type(value) is not int or not 0 <= value <= upper:
        raise ValueError("invalid unsigned assumption")
    return value


def assumptions():
    return {
        "standby": {
            "available": True,
            "ready_at": 0,
            "price": 14,
            "resource_cost": 9,
            "capital_charge": 0,
            "locked_capital": 14,
        },
        "spot": {
            "available": True,
            "ready_at": 3,
            "price": 8,
            "resource_cost": 5,
            "capital_charge": 0,
            "locked_capital": 8,
        },
    }


def validate_options(options):
    if (
        type(options) is not dict
        or set(options) != {"standby", "spot"}
    ):
        raise ValueError("invalid counterfactual schema")

    for option in options.values():
        if (
            type(option) is not dict
            or set(option) != OPTION_KEYS
        ):
            raise ValueError("invalid alternative schema")

        if type(option["available"]) is not bool:
            raise ValueError("invalid availability")

        uint(option["ready_at"], MAX_U64)

        for key in (
            "price", "resource_cost",
            "capital_charge", "locked_capital"
        ):
            uint(option[key])

        if option["price"] < 2:
            raise ValueError("two-component price too small")

        if option["resource_cost"] > option["price"]:
            raise ValueError("negative assumed supplier margin")

        total = (
            option["price"] + option["capital_charge"]
        )

        if total > MAX_U128:
            raise ValueError("total alternative cost overflow")

        if option["locked_capital"] < total:
            raise ValueError("understated assumed capital lock")


def beneficiaries(market):
    selected = []

    for buyer in market["buyers"]:
        if (
            buyer["active"]
            and buyer["cap"] > 0
            and buyer["value"] > buyer["outside_option"]
        ):
            selected.append({
                "job_id": buyer["job_id"],
                "effective_cap": min(
                    buyer["cap"],
                    buyer["value"] - buyer["outside_option"]
                ),
                "incremental_value":
                    buyer["value"] - buyer["outside_option"],
            })

    return sorted(selected, key=lambda x: x["job_id"])


def allocate_alternative(price, group):
    """Reuse Genesis for hypothetical capped-equal prices.

    Artificial comparator offers are used ONLY as an
    allocation oracle, never as signed real market bids.
    """

    if not group:
        return None

    if price < 2 or price > MAX_U128:
        raise ValueError("invalid comparator price")

    snapshot = {
        "deadline": 1,
        "buyers": [
            {
                "job_id": b["job_id"],
                "cap": b["effective_cap"],
            }
            for b in group
        ],
        "offers": [
            {
                "offer_id": 900,
                "component": 0,
                "provider": "comparator-a",
                "slot": "comparator-slot-a",
                "fee": 1,
                "bond": price,
                "ready_at": 0,
                "available": True,
            },
            {
                "offer_id": 901,
                "component": 1,
                "provider": "comparator-b",
                "slot": "comparator-slot-b",
                "fee": price - 1,
                "bond": price,
                "ready_at": 0,
                "available": True,
            },
        ],
    }

    cert = generate(snapshot)

    row = next(
        r for r in cert["coalitions"]
        if r["job_ids"] == [
            b["job_id"] for b in group
        ]
    )

    return row["allocation"] if row["feasible"] else None


def outcome(group, price, supplier_cost,
            capital_charge, locked_capital, payments,
            strategy):
    benefit = sum(b["incremental_value"] for b in group)

    if len(payments) != len(group):
        raise ValueError("wrong beneficiary coverage")

    if sum(payments) != price + capital_charge:
        raise ValueError("cash payments do not balance")

    margins = [
        b["incremental_value"] - payment
        for b, payment in zip(group, payments)
    ]

    if any(v < 0 for v in margins):
        raise ValueError("individual rationality failed")

    buyer_net = sum(margins)
    supplier_margin = price - supplier_cost

    surplus = buyer_net + supplier_margin

    if surplus != benefit - supplier_cost - capital_charge:
        raise ValueError("economic accounting mismatch")

    return {
        "strategy": strategy,
        "feasible": True,
        "service_delivered": True,
        "beneficiaries": [b["job_id"] for b in group],
        "buyer_payments": payments,
        "buyer_net": buyer_net,
        "supplier_margin": supplier_margin,
        "declared_social_surplus": surplus,
        "buyer_cash_outlay": sum(payments),
        "assumed_locked_capital": locked_capital,
        "reason": "feasible_under_declared_assumptions",
    }


def failed(strategy, reason, delivered=False):
    return {
        "strategy": strategy,
        "feasible": False,
        "service_delivered": delivered,
        "beneficiaries": [],
        "buyer_payments": [],
        "buyer_net": 0,
        "supplier_margin": 0,
        "declared_social_surplus": 0,
        "buyer_cash_outlay": 0,
        "assumed_locked_capital": 0,
        "reason": reason,
    }


def evaluate(market, options):
    validate_options(options)

    formation = form(market)
    competition = audit(market)

    group = beneficiaries(market)
    ids = [b["job_id"] for b in group]

    selected = formation["selected"]

    # Do not compare recovery of different job sets
    # while claiming identical service coverage.
    if selected is not None and selected["job_ids"] != ids:
        raise ValueError(
            "formation and comparator beneficiary sets differ"
        )

    results = {}

    results["no_recovery"] = {
        **failed("no_recovery", "outside_option_only"),
        "feasible": True,
    }

    winning = competition["winning_pair"]

    if selected is None:
        results["nomogenesis"] = failed(
            "nomogenesis",
            "no_voluntary_funded_coalition",
        )
    else:
        by_offer = {
            o["offer_id"]: o
            for o in market["offers"]
        }

        costs = sum(
            by_offer[i]["cost_floor"]
            for i in winning["offers"]
        )

        results["nomogenesis"] = outcome(
            group,
            selected["price"],
            costs,
            0,
            3 * selected["price"],
            selected["payments"],
            "nomogenesis",
        )

    if winning is None or not group:
        results["individual"] = failed(
            "individual",
            "no_eligible_service_or_buyer",
        )
    else:
        payer = next(
            (
                i for i, b in enumerate(group)
                if b["effective_cap"] >= winning["price"]
            ),
            None,
        )

        if payer is None:
            results["individual"] = failed(
                "individual",
                "no_individual_buyer_can_pay",
            )
        else:
            payments = [0] * len(group)
            payments[payer] = winning["price"]

            by_offer = {
                o["offer_id"]: o
                for o in market["offers"]
            }

            costs = sum(
                by_offer[i]["cost_floor"]
                for i in winning["offers"]
            )

            results["individual"] = outcome(
                group,
                winning["price"],
                costs,
                0,
                3 * winning["price"],
                payments,
                "individual",
            )

    for name in ("standby", "spot"):
        option = options[name]

        if not option["available"]:
            results[name] = failed(
                name, "service_unavailable"
            )
            continue

        if option["ready_at"] > market["deadline"]:
            results[name] = failed(
                name, "missed_recovery_deadline"
            )
            continue

        total = (
            option["price"]
            + option["capital_charge"]
        )

        payments = allocate_alternative(
            total, group
        )

        if payments is None:
            results[name] = failed(
                name, "insufficient_voluntary_budget"
            )
            continue

        results[name] = outcome(
            group,
            option["price"],
            option["resource_cost"],
            option["capital_charge"],
            option["locked_capital"],
            payments,
            name,
        )

    best_surplus = max(
        row["declared_social_surplus"]
        for row in results.values()
        if row["feasible"]
    )

    winners = sorted(
        name for name, row in results.items()
        if (
            row["feasible"]
            and row["declared_social_surplus"]
                == best_surplus
        )
    )

    return {
        "market_hash": formation["source_hash"],
        "beneficiaries": ids,
        "assumed_incremental_benefit": sum(
            b["incremental_value"] for b in group
        ),
        "strategies": results,
        "best_declared_surplus": best_surplus,
        "best_strategies": winners,
        "limitations": [
            "Synthetic declared values and supplier costs",
            "Same beneficiary coverage is assumed",
            "Standby and spot services are hypothetical",
            "Delivery quality equivalence is assumed",
            "Alternative counterparty risks are not priced",
            "Locked capital is reported, not fully priced",
            "No measured economic surplus or real revenue",
        ],
    }


def unilateral_exits(market):
    """Test withdrawal under excludable/nonexcludable benefit."""

    formation = form(market)
    chosen = formation["selected"]

    if chosen is None:
        return []

    by_job = {
        b["job_id"]: b
        for b in market["buyers"]
    }

    rows = []

    for job_id, payment, current_utility in zip(
        chosen["job_ids"],
        chosen["payments"],
        chosen["buyer_utility_margins"],
    ):
        alternate = copy.deepcopy(market)

        for buyer in alternate["buyers"]:
            if buyer["job_id"] == job_id:
                buyer["active"] = False

        residual = form(alternate)["selected"]

        incremental = (
            by_job[job_id]["value"]
            - by_job[job_id]["outside_option"]
        )

        # Explicit assumption: a common dependency may
        # benefit nonpaying jobs if others restore it.
        nonexcludable_payoff = (
            incremental if residual is not None else 0
        )

        rows.append({
            "exiting_job": job_id,
            "current_payment": payment,
            "current_incremental_utility": current_utility,
            "residual_coalition":
                residual["job_ids"] if residual else None,
            "residual_recovery_feasible":
                residual is not None,
            "exit_payoff_if_excludable": 0,
            "exit_payoff_if_nonexcludable":
                nonexcludable_payoff,
            "profitable_free_ride_if_nonexcludable":
                nonexcludable_payoff > current_utility,
        })

    return rows


def build_report(market, competition_hash, origin_hash):
    base = assumptions()

    standby = copy.deepcopy(base)
    standby["standby"].update({
        "price": 9,
        "resource_cost": 6,
        "locked_capital": 9,
    })

    spot = copy.deepcopy(base)
    spot["spot"].update({
        "ready_at": 1,
        "price": 8,
        "resource_cost": 5,
        "locked_capital": 8,
    })

    cases = {
        "joint_reference": evaluate(market, base),
        "standby_wins": evaluate(market, standby),
        "spot_wins": evaluate(market, spot),
    }

    sweep = []

    for price in range(6, 17):
        scenario = copy.deepcopy(base)

        scenario["standby"].update({
            "price": price,
            "resource_cost": price - 2,
            "locked_capital": price,
        })

        result = evaluate(market, scenario)

        sweep.append({
            "standby_price": price,
            "standby_resource_cost": price - 2,
            "winners": result["best_strategies"],
            "nomogenesis_surplus":
                result["strategies"]["nomogenesis"][
                    "declared_social_surplus"
                ],
            "standby_surplus":
                result["strategies"]["standby"][
                    "declared_social_surplus"
                ] if result["strategies"]["standby"][
                    "feasible"
                ] else None,
        })

    expanded = copy.deepcopy(market)

    for buyer in expanded["buyers"]:
        if buyer["job_id"] == 3:
            buyer["outside_option"] = 0

    body = {
        "version": "r7-06d-economic-model-v1",
        "source_signed_report_hash": origin_hash,
        "source_competition_hash": competition_hash,
        "reference_market_hash": form(market)[
            "source_hash"
        ],
        "model_assumptions": base,
        "counterfactuals": cases,
        "standby_sensitivity": sweep,
        "signed_market_exit_analysis":
            unilateral_exits(market),
        "three_buyer_free_rider_stress": {
            "source": "synthetic_modification_not_signed",
            "formation": form(expanded)["selected"],
            "exits": unilateral_exits(expanded),
        },
        "limitations": [
            "All alternative prices and resource costs are assumed",
            "Source market signed; counterfactual changes unsigned",
            "Shared-dependency spillover is a model assumption",
            "Only unilateral exits examined, not coalition-proofness",
            "Opportunity cost of locked capital is not calibrated",
            "No real-world production, market demand or ROI evidence",
            "No NEAR transactions or on-chain coalition selection",
        ],
    }

    return {
        **body,
        "evidence_hash": hash_of(
            "R7_06D_ECONOMIC_EVIDENCE",
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
        raise ValueError(
            "R7-06C competition source mismatch"
        )

    report = build_report(
        signed["market"],
        competition["witness_hash"],
        signed["report_hash"],
    )

    if len(sys.argv) == 2:
        if json.loads(OUTPUT.read_text()) != report:
            raise ValueError(
                "economic evidence reconstruction mismatch"
            )

        print("REPRODUCED ECONOMIC EVIDENCE: PASS")
    else:
        with OUTPUT.open("x") as file:
            json.dump(
                report,
                file,
                indent=2,
                sort_keys=True,
            )
            file.write("\n")

        print("ECONOMIC EVIDENCE GENERATED: PASS")

    for name, row in report["counterfactuals"].items():
        print(
            name,
            "BEST:",
            row["best_strategies"],
            "SURPLUS:",
            row["best_declared_surplus"],
        )

    exits = report[
        "three_buyer_free_rider_stress"
    ]["exits"]

    print(
        "PROFITABLE FREE-RIDING EXITS:",
        sum(
            row["profitable_free_ride_if_nonexcludable"]
            for row in exits
        ),
        "OF",
        len(exits),
    )

    print(
        "EVIDENCE SHA256:",
        report["evidence_hash"]
    )

    print("R7-06D ECONOMIC AUDIT: PASS")


if __name__ == "__main__":
    main()
