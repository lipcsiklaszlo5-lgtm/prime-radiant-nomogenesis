"""R7-06A: offline deterministic policy-to-Genesis formation.

Synthetic preference inputs only. No network, wallet,
contract writes or real autonomous ownership.
"""

from r7_genesis import generate, hash_of
from r7_genesis_schema import (
    MAX_U128,
    MAX_U64,
    normalize_input,
)
from r7_genesis_verify import verify


def require_fields(value, expected, name):
    if type(value) is not dict or set(value) != set(expected):
        raise ValueError(f"invalid {name} schema")


def unsigned(value, upper=MAX_U128):
    if type(value) is not int or not 0 <= value <= upper:
        raise ValueError("invalid unsigned integer")
    return value


def form(snapshot):
    """Build a declared-utility coalition proposal."""

    require_fields(
        snapshot,
        ("deadline", "buyers", "offers"),
        "market",
    )

    deadline = unsigned(snapshot["deadline"], MAX_U64)
    buyers = snapshot["buyers"]
    offers = snapshot["offers"]

    if type(buyers) is not list or not 1 <= len(buyers) <= 6:
        raise ValueError("buyer count outside 1..6")

    if type(offers) is not list or len(offers) > 6:
        raise ValueError("offer count exceeds 6")

    buyer_decisions = []

    for b in buyers:
        require_fields(
            b,
            (
                "job_id",
                "cap",
                "value",
                "outside_option",
                "active",
            ),
            "buyer",
        )

        job = unsigned(b["job_id"], MAX_U64)
        cap = unsigned(b["cap"])
        value = unsigned(b["value"])
        outside = unsigned(b["outside_option"])

        if type(b["active"]) is not bool:
            raise ValueError("invalid buyer activity")

        willing = (
            b["active"]
            and value > outside
            and cap > 0
        )

        limit = (
            min(cap, value - outside)
            if willing else 0
        )

        buyer_decisions.append({
            "job_id": job,
            "willing": willing,
            "effective_cap": limit,
            "incremental_value": max(
                0, value - outside
            ),
            "reason": (
                "accept" if willing
                else "reject_policy"
            ),
        })

    seller_decisions = []

    for o in offers:
        require_fields(
            o,
            (
                "offer_id",
                "component",
                "provider",
                "slot",
                "fee",
                "bond",
                "ready_at",
                "available",
                "cost_floor",
            ),
            "supplier",
        )

        floor = unsigned(o["cost_floor"])
        fee = unsigned(o["fee"])

        if type(o["available"]) is not bool:
            raise ValueError(
                "invalid provider availability"
            )

        willing = (
            o["available"]
            and fee >= floor
        )

        seller_decisions.append({
            "offer_id": unsigned(
                o["offer_id"], MAX_U64
            ),
            "willing": willing,
            "stated_margin": (
                fee - floor if willing else None
            ),
            "reason": (
                "accept" if willing
                else "reject_policy"
            ),
        })

    buyer_decisions.sort(
        key=lambda x: x["job_id"]
    )

    seller_decisions.sort(
        key=lambda x: x["offer_id"]
    )

    jobs = {
        b["job_id"]: b
        for b in buyers
    }

    by_offer = {
        o["offer_id"]: o
        for o in offers
    }

    normalized = normalize_input({
        "deadline": deadline,
        "buyers": [
            {
                "job_id": d["job_id"],
                "cap": d["effective_cap"],
            }
            for d in buyer_decisions
        ],
        "offers": [
            {
                "offer_id": o["offer_id"],
                "component": o["component"],
                "provider": o["provider"],
                "slot": o["slot"],
                "fee": o["fee"],
                "bond": o["bond"],
                "ready_at": o["ready_at"],
                "available": next(
                    d["willing"]
                    for d in seller_decisions
                    if d["offer_id"] == o["offer_id"]
                ),
            }
            for o in offers
        ],
    })

    if (
        len(jobs) != len(buyers)
        or len(by_offer) != len(offers)
    ):
        raise ValueError(
            "duplicate agent identifiers"
        )

    if sum(
        b["incremental_value"]
        for b in buyer_decisions
    ) > MAX_U128:
        raise ValueError(
            "aggregate value overflow"
        )

    canonical_source = {
        "deadline": deadline,
        "buyers": sorted(
            buyers,
            key=lambda x: x["job_id"],
        ),
        "offers": sorted(
            offers,
            key=lambda x: x["offer_id"],
        ),
    }

    certificate = generate(normalized)

    if not verify(certificate):
        raise ValueError(
            "Genesis verifier rejected certificate"
        )

    best = certificate["winning_pair"]
    candidates = []

    if best is not None:
        pair = [
            by_offer[offer_id]
            for offer_id in best["offers"]
        ]

        for row in certificate["coalitions"]:
            if not row["feasible"]:
                continue

            participants = [
                jobs[i]
                for i in row["job_ids"]
            ]

            if any(
                p["active"] is False
                or p["value"] <= p["outside_option"]
                or p["cap"] == 0
                for p in participants
            ):
                continue

            allocation = row["allocation"]

            if any(
                amount == 0
                for amount in allocation
            ):
                continue

            utilities = [
                p["value"]
                - p["outside_option"]
                - payment
                for p, payment in zip(
                    participants,
                    allocation,
                )
            ]

            if min(utilities) < 0:
                raise ValueError(
                    "buyer rationality violated"
                )

            total_surplus = (
                sum(
                    p["value"]
                    - p["outside_option"]
                    for p in participants
                )
                - sum(
                    p["cost_floor"]
                    for p in pair
                )
            )

            candidates.append({
                "job_ids": row["job_ids"],
                "payments": allocation,
                "buyer_utility_margins": utilities,
                "supplier_margins": [
                    p["fee"] - p["cost_floor"]
                    for p in pair
                ],
                "stated_incremental_surplus":
                    total_surplus,
                "pair": best["offers"],
                "price": best["price"],
            })

    candidates.sort(
        key=lambda c: (
            -c["stated_incremental_surplus"],
            len(c["job_ids"]),
            c["job_ids"],
        )
    )

    chosen = (
        candidates[0]
        if candidates else None
    )

    newly_fundable = (
        chosen is not None
        and len(chosen["job_ids"]) >= 2
        and all(
            d["effective_cap"] < chosen["price"]
            for d in buyer_decisions
            if d["willing"]
        )
    )

    return {
        "version": "formation-v0-synthetic",
        "source_hash": hash_of(
            "FORMATION_POLICY_V0",
            canonical_source,
        ),
        "buyer_decisions": buyer_decisions,
        "supplier_decisions": seller_decisions,
        "genesis_certificate": certificate,
        "minimal_coalitions":
            certificate["minimal_coalitions"],
        "candidate_count": len(candidates),
        "selected": chosen,
        "newly_fundable_under_declared_limits":
            bool(newly_fundable),
        "onchain_execution_ready": False,
        "limitations": [
            "Synthetic declared preferences",
            "No independent agent owners",
            "No signed participant authorizations",
            "No on-chain subset selection",
            "Unmodelled risk and capital costs",
            "No incentive compatibility proof",
            "No coalition-stability proof",
        ],
    }
