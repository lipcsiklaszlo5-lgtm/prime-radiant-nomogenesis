"""Bounded offline Genesis Engine. Synthetic inputs only."""

import hashlib
import json
from r7_genesis_schema import normalize_input, MAX_U128


def hash_of(label, value):
    blob = json.dumps(
        value, sort_keys=True, separators=(",", ":")
    ).encode()
    return hashlib.sha256(
        label.encode() + b"\0" + blob
    ).hexdigest()


def generate(data):
    normalized = normalize_input(data)
    buyers = normalized["buyers"]
    offers = normalized["offers"]
    deadline = normalized["deadline"]

    # Find cheapest complete bonded provider pair.
    pairs = []

    for a in offers:
        for b in offers:
            if (a["component"], b["component"]) != (0, 1):
                continue

            price = a["fee"] + b["fee"]
            if price > MAX_U128:
                continue

            if (
                a["available"]
                and b["available"]
                and a["provider"] != b["provider"]
                and a["slot"] != b["slot"]
                and max(a["ready_at"], b["ready_at"]) <= deadline
                and min(a["bond"], b["bond"]) >= price
            ):
                pairs.append(
                    (price, a["offer_id"], b["offer_id"])
                )

    best = min(pairs) if pairs else None
    rows = []

    # Exhaustively examine all 2^N - 1 coalitions.
    for mask in range(1, 1 << len(buyers)):
        selected = [
            b for i, b in enumerate(buyers)
            if mask & (1 << i)
        ]
        caps = [b["cap"] for b in selected]
        feasible = best is not None and sum(caps) >= best[0]

        allocation = None

        if feasible:
            allocation = [0] * len(caps)
            remaining = best[0]

            # Deterministic capped-equal water filling.
            while remaining:
                active = [
                    i for i, cap in enumerate(caps)
                    if allocation[i] < cap
                ]
                share, rem = divmod(
                    remaining, len(active)
                )
                moved = 0

                for order, i in enumerate(active):
                    add = min(
                        caps[i] - allocation[i],
                        share + (order < rem)
                    )
                    allocation[i] += add
                    moved += add

                if moved == 0:
                    raise ValueError("allocation stalled")

                remaining -= moved

        rows.append({
            "mask": mask,
            "job_ids": [b["job_id"] for b in selected],
            "capacity": sum(caps),
            "feasible": feasible,
            "allocation": allocation,
        })

    winners = {
        r["mask"] for r in rows if r["feasible"]
    }

    minimal = [
        r["job_ids"]
        for r in rows
        if r["mask"] in winners
        and not any(
            sub in winners
            for sub in range(1, r["mask"])
            if sub & r["mask"] == sub
        )
    ]

    normalized = {
        "deadline": deadline,
        "buyers": buyers,
        "offers": offers,
    }

    certificate = {
        "version": "genesis-v1-offchain",
        "input": normalized,
        "input_hash": hash_of("GENESIS_INPUT", normalized),
        "winning_pair": {
            "price": best[0],
            "offers": [best[1], best[2]],
        } if best else None,
        "coalitions": rows,
        "minimal_coalitions": minimal,
    }

    certificate["certificate_hash"] = hash_of(
        "GENESIS_CERT", certificate
    )

    return certificate
