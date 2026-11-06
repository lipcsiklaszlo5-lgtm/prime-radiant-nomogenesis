"""Independently recompute certificate outcomes."""

import json
import sys
from pathlib import Path
from r7_genesis import hash_of
from r7_genesis_schema import normalize_input, MAX_U128


def same_json(left, right):
    """Compare JSON values without Python bool/int coercion."""
    return json.dumps(
        left, sort_keys=True, separators=(",", ":"), allow_nan=False
    ) == json.dumps(
        right, sort_keys=True, separators=(",", ":"), allow_nan=False
    )


def verify(cert):
    try:
        required = {
            "version", "input", "input_hash",
            "winning_pair", "coalitions",
            "minimal_coalitions", "certificate_hash",
        }

        if type(cert) is not dict or set(cert) != required:
            return False

        if cert["version"] != "genesis-v1-offchain":
            return False

        data = cert["input"]
        if normalize_input(data) != data:
            return False

        if cert["input_hash"] != hash_of(
            "GENESIS_INPUT", data
        ):
            return False

        body = {
            k: v for k, v in cert.items()
            if k != "certificate_hash"
        }

        if cert["certificate_hash"] != hash_of(
            "GENESIS_CERT", body
        ):
            return False

        # Recalculate eligible provider pairs.
        offers = data["offers"]
        candidates = []

        for x in offers:
            for y in offers:
                price = x["fee"] + y["fee"]
                if price > MAX_U128:
                    continue

                if (
                    x["component"] == 0
                    and y["component"] == 1
                    and x["provider"] != y["provider"]
                    and (x["provider"], x["slot"])
                    != (y["provider"], y["slot"])
                    and x["available"]
                    and y["available"]
                    and x["ready_at"] <= data["deadline"]
                    and y["ready_at"] <= data["deadline"]
                    and x["bond"] >= price
                    and y["bond"] >= price
                ):
                    candidates.append((
                        price, x["offer_id"], y["offer_id"]
                    ))

        best = min(candidates) if candidates else None

        expected_pair = {
            "price": best[0],
            "offers": [best[1], best[2]],
        } if best else None

        if not same_json(cert["winning_pair"], expected_pair):
            return False

        buyers = data["buyers"]

        if not 1 <= len(buyers) <= 6 or len(offers) > 6:
            return False

        if buyers != sorted(
            buyers, key=lambda b: b["job_id"]
        ):
            return False

        if offers != sorted(
            offers, key=lambda o: o["offer_id"]
        ):
            return False

        if len({b["job_id"] for b in buyers}) != len(buyers):
            return False

        if len({o["offer_id"] for o in offers}) != len(offers):
            return False

        rows = []
        winners = set()

        for mask in range(1, 1 << len(buyers)):
            selected = [
                buyers[i] for i in range(len(buyers))
                if mask & (1 << i)
            ]

            caps = [b["cap"] for b in selected]
            feasible = bool(best) and sum(caps) >= best[0]
            amount = None

            if feasible:
                winners.add(mask)
                amount = [0] * len(caps)
                rest = best[0]

                while rest:
                    active = [
                        j for j in range(len(caps))
                        if amount[j] < caps[j]
                    ]
                    share, extra = divmod(
                        rest, len(active)
                    )
                    paid = 0

                    for rank, j in enumerate(active):
                        transfer = min(
                            caps[j] - amount[j],
                            share + int(rank < extra)
                        )
                        amount[j] += transfer
                        paid += transfer

                    if not paid:
                        return False

                    rest -= paid

            rows.append({
                "mask": mask,
                "job_ids": [
                    b["job_id"] for b in selected
                ],
                "capacity": sum(caps),
                "feasible": feasible,
                "allocation": amount,
            })

        minimal = [
            r["job_ids"]
            for r in rows
            if r["mask"] in winners
            and all(
                sub not in winners
                for sub in range(1, r["mask"])
                if sub & r["mask"] == sub
            )
        ]

        return (
            same_json(cert["coalitions"], rows)
            and same_json(cert["minimal_coalitions"], minimal)
        )

    except (
        ValueError, TypeError, KeyError,
        ZeroDivisionError, OverflowError
    ):
        return False


if __name__ == "__main__":
    certificate = json.loads(
        Path(sys.argv[1]).read_text()
    )
    result = verify(certificate)

    print(
        "GENESIS VERIFY:",
        "PASS" if result else "FAIL"
    )
    sys.exit(0 if result else 1)
