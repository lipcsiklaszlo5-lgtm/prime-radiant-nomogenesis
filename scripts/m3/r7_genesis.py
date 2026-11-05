"""Bounded offline Genesis Engine. Synthetic inputs only."""

import hashlib
import json


def hash_of(label, value):
    blob = json.dumps(
        value, sort_keys=True, separators=(",", ":")
    ).encode()
    return hashlib.sha256(
        label.encode() + b"\0" + blob
    ).hexdigest()


def generate(data):
    buyers = sorted(
        data["buyers"], key=lambda b: b["job_id"]
    )
    offers = sorted(
        data["offers"], key=lambda o: o["offer_id"]
    )
    deadline = data["deadline"]

    if not 1 <= len(buyers) <= 6 or len(offers) > 6:
        raise ValueError("bounds")

    if type(deadline) is not int or deadline < 0:
        raise ValueError("deadline")

    if len({b["job_id"] for b in buyers}) != len(buyers):
        raise ValueError("duplicate buyer")

    if len({o["offer_id"] for o in offers}) != len(offers):
        raise ValueError("duplicate offer")

    for b in buyers:
        if (
            type(b["job_id"]) is not int
            or type(b["cap"]) is not int
            or min(b["job_id"], b["cap"]) < 0
        ):
            raise ValueError("buyer fields")

    for o in offers:
        fields = ("offer_id", "fee", "bond", "ready_at")
        if any(
            type(o[k]) is not int or o[k] < 0
            for k in fields
        ) or o["fee"] == 0:
            raise ValueError("offer fields")

        if (
            type(o["available"]) is not bool
            or type(o["component"]) is not int
            or o["component"] not in (0, 1)
        ):
            raise ValueError("offer flags")

        if not all(
            isinstance(o[k], str) and o[k]
            for k in ("provider", "slot")
        ):
            raise ValueError("offer identity")

    # Find cheapest complete bonded provider pair.
    pairs = []

    for a in offers:
        for b in offers:
            if (a["component"], b["component"]) != (0, 1):
                continue

            price = a["fee"] + b["fee"]

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
