"""Strict, deterministic input boundary for Genesis V1."""

MAX_U64 = (1 << 64) - 1
MAX_U128 = (1 << 128) - 1


def uint(value, upper, name):
    if type(value) is not int or not 0 <= value <= upper:
        raise ValueError(f"invalid {name}")
    return value


def fields(obj, names, name):
    if type(obj) is not dict or set(obj) != set(names):
        raise ValueError(f"invalid {name} schema")


def identifier(value, name):
    if (
        type(value) is not str
        or not 1 <= len(value) <= 128
        or any(not 33 <= ord(c) <= 126 for c in value)
    ):
        raise ValueError(f"invalid {name}")
    return value


def normalize_input(data):
    """Validate exact fields, return canonical sorted snapshot."""

    fields(data, ("deadline", "buyers", "offers"), "input")

    deadline = uint(data["deadline"], MAX_U64, "deadline")
    buyers = data["buyers"]
    offers = data["offers"]

    if type(buyers) is not list or not 1 <= len(buyers) <= 6:
        raise ValueError("buyer count")

    if type(offers) is not list or len(offers) > 6:
        raise ValueError("offer count")

    canonical_buyers = []

    for b in buyers:
        fields(b, ("job_id", "cap"), "buyer")

        canonical_buyers.append({
            "job_id": uint(b["job_id"], MAX_U64, "job_id"),
            "cap": uint(b["cap"], MAX_U128, "cap"),
        })

    canonical_buyers.sort(key=lambda b: b["job_id"])

    if len({b["job_id"] for b in canonical_buyers}) != len(canonical_buyers):
        raise ValueError("duplicate job_id")

    if sum(b["cap"] for b in canonical_buyers) > MAX_U128:
        raise ValueError("aggregate cap overflow")

    canonical_offers = []

    for o in offers:
        fields(o, (
            "offer_id", "component", "provider", "slot",
            "fee", "bond", "ready_at", "available"
        ), "offer")

        component = uint(o["component"], 1, "component")
        fee = uint(o["fee"], MAX_U128, "fee")

        if fee == 0:
            raise ValueError("zero fee")

        if type(o["available"]) is not bool:
            raise ValueError("invalid availability")

        canonical_offers.append({
            "offer_id": uint(o["offer_id"], MAX_U64, "offer_id"),
            "component": component,
            "provider": identifier(o["provider"], "provider"),
            "slot": identifier(o["slot"], "slot"),
            "fee": fee,
            "bond": uint(o["bond"], MAX_U128, "bond"),
            "ready_at": uint(o["ready_at"], MAX_U64, "ready_at"),
            "available": o["available"],
        })

    canonical_offers.sort(key=lambda o: o["offer_id"])

    if len({o["offer_id"] for o in canonical_offers}) != len(canonical_offers):
        raise ValueError("duplicate offer_id")

    return {
        "deadline": deadline,
        "buyers": canonical_buyers,
        "offers": canonical_offers,
    }
