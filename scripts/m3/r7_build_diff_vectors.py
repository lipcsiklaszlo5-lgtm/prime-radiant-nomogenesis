"""Build deterministic Rust/Python allocation fixtures."""

import json
from pathlib import Path

from r7_genesis import generate
from r7_genesis_verify import verify

ROOT = Path(__file__).resolve().parents[2]
MAX_U128 = (1 << 128) - 1

cases = []


def add_case(label, caps, price):
    buyers = [
        {"job_id": i + 1, "cap": cap}
        for i, cap in enumerate(caps)
    ]

    first = price // 2
    second = price - first

    offers = [
        {
            "offer_id": i,
            "component": i,
            "provider": f"provider{i}",
            "slot": f"slot{i}",
            "fee": fee,
            "bond": price,
            "ready_at": 5,
            "available": True,
        }
        for i, fee in enumerate((first, second))
    ]

    certificate = generate({
        "deadline": 10,
        "buyers": list(reversed(buyers)),
        "offers": list(reversed(offers)),
    })

    assert verify(certificate)

    full = certificate["coalitions"][-1]
    assert full["feasible"]
    assert full["capacity"] == sum(caps)
    assert sum(full["allocation"]) == price

    cases.append({
        "id": label,
        "price": str(price),
        "caps": [
            {"job_id": b["job_id"], "cap": str(b["cap"])}
            for b in buyers
        ],
        "allocation": [
            {"job_id": b["job_id"], "amount": str(amount)}
            for b, amount in zip(buyers, full["allocation"])
        ],
    })


# Anchor the test suite to the real Testnet witness.
witness = json.loads(
    (
        ROOT /
        "docs/evidence/R7-02B-01-transaction-witness.json"
    ).read_text()
)

real = witness["genesis_certificate"]
assert verify(real)

real_caps = [
    b["cap"] for b in real["input"]["buyers"]
]
real_price = real["winning_pair"]["price"]

add_case("R6-REAL-TESTNET", real_caps, real_price)

assert cases[0]["allocation"] == [
    {"job_id": i, "amount": str(4 * 10**21)}
    for i in (1, 2, 3)
]

# Explicit edge cases.
add_case("SATURATED", [1, 10, 10], 8)
add_case("REMAINDER", [10, 10, 10], 5)
add_case("SINGLE-BUYER", [12], 12)
add_case(
    "U128-LARGE",
    [MAX_U128 // 3] * 3,
    2 * (MAX_U128 // 3),
)

# Deterministic bounded matrix: 180 further cases.
for n in range(1, 7):
    for seed in range(1, 31):
        caps = [
            2 + ((seed * 17 + (i + 1) * 11 + n * 7) % 17)
            for i in range(n)
        ]

        total = sum(caps)
        price = 2 + ((seed * 5 + n) % (total - 1))

        add_case(f"N{n}-S{seed}", caps, price)

output = {
    "version": "r7-02c-allocation-v1",
    "scope": "Python/Rust capped-equal differential",
    "cases": cases,
}

path = ROOT / (
    "docs/evidence/R7-02C-allocation-vectors.json"
)
path.write_text(json.dumps(output, indent=2) + "\n")

print("PYTHON REFERENCE CASES:", len(cases))
print("REAL TESTNET ANCHOR: INCLUDED")
print("REFERENCE CERTIFICATES: VERIFIED")
