"""Deterministic full-certificate fixtures for Rust."""

import json
from pathlib import Path

from r7_genesis import generate
from r7_genesis_verify import verify
from test_r7_genesis import scenario

ROOT = Path(__file__).resolve().parents[2]
cases = []


def add(name, data):
    cert = generate(data)
    assert verify(cert)
    cases.append({"name": name, "certificate": cert})


add("reference", scenario())

data = scenario()
for buyer in data["buyers"]:
    buyer["cap"] = 7
add("multiple-minimal", data)

data = scenario()
data["buyers"][0]["cap"] = 12
add("single-capable", data)

data = scenario()
data["buyers"][0]["cap"] = 0
add("insufficient", data)

data = scenario()
data["offers"][1]["bond"] = 11
add("underbonded", data)

data = scenario()
data["offers"].extend([
    {
        **data["offers"][0],
        "offer_id": 3,
        "provider": "c",
        "slot": "s3",
    },
    {
        **data["offers"][1],
        "offer_id": 4,
        "provider": "d",
        "slot": "s4",
    },
])
add("equal-price-tie", data)

path = ROOT / (
    "docs/evidence/R7-02C-certificate-fixtures.json"
)
path.write_text(json.dumps({"cases": cases}, indent=2) + "\n")

print("FULL PYTHON CERTIFICATE FIXTURES:", len(cases))
print("PYTHON VERIFIER: PASS")
