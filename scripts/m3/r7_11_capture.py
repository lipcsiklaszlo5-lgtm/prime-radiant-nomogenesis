#!/usr/bin/env python3
"""R7-11: independently validate and structure R7-10 evidence."""

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

EXPECTED_WASM = (
    "2730e3d0413929aa15201d27f23ce4173731745"
    "dab658c1b21f12c624cb93b9e"
)
UNIT = 10 ** 21
TX = r"(?P<tx>[1-9A-HJ-NP-Za-km-z]{40,50})"

REQUIRED = (
    "R7_SOURCE_AND_BACKUPS_ARMED: PASS",
    "NO_PRE_OUTAGE_FUNDING_OR_OFFERS: PASS",
    "R7_SOURCE_PROCESS_EXITED: PASS",
    "R7_AUTONOMOUS_OUTAGE_DETECTED: PASS",
    "AUTONOMOUS_TWO_BUYER_FUNDS: PASS",
    "AUTONOMOUS_THREE_PROVIDER_BIDS: PASS",
    "AUTONOMOUS_TWO_POLICY_REFUSALS: PASS",
    "ONCHAIN_OFFERS_COMPETITIVE_PRICE: PASS",
    "ONCHAIN_FUNDS_AND_BONDS_CONSERVED: PASS",
    "TWO_PROVIDER_MERKLE_PROOFS: PASS",
    "UNSELECTED_PROVIDER_BOND_RELEASED: PASS",
    "AUTONOMOUS_TERMINAL_SETTLEMENT: PASS",
    "TWO_AUTHENTICATED_WORKER_COMPLETIONS: PASS",
    "TERMINAL_FINANCIAL_CONSERVATION: 52=0+52",
    "R7_10_FOUR_PILLARS: PASS",
)

PATTERNS = (
    ("policy", r"AGENTSHIELD_AUTONOMOUS_DECISION: "
     r"(?P<actor>buyer-\d+) (?P<decision>ACCEPT|REJECT) "
     r"MAX_YOCTO=(?P<maximum>\d+)", 3),

    ("funding", rf"AUTONOMOUS_BUYER_FUNDED: "
     rf"(?P<actor>buyer-\d+) JOB=(?P<job>\d+) TX={TX}", 2),

    ("offer", rf"AUTONOMOUS_PROVIDER_OFFER: "
     rf"(?P<actor>provider-[a-z]+) "
     rf"OFFER=(?P<offer>\d+) TX={TX}", 3),

    ("acceptance", rf"AUTONOMOUS_WORKER_ACCEPTED: "
     rf"(?P<actor>worker\d+) JOB=(?P<job>\d+) TX={TX}", 2),

    ("consent", rf"AUTONOMOUS_BUYER_V2_CONSENT: "
     rf"(?P<actor>buyer-\d+) JOB=(?P<job>\d+) "
     rf"PAYMENT=(?P<payment>\d+) TX={TX}", 2),

    ("award", rf"AUTONOMOUS_KEEPER_ATOMIC_AWARD: "
     rf"BUNDLE=(?P<bundle>\d+) PRICE=(?P<price>\d+) "
     rf"TX={TX}", 1),

    ("backup", r"R7_BACKUP_AFTER_AWARD: "
     r"(?P<component>\d+) PID=(?P<pid>\d+)", 2),

    ("proof", rf"AUTONOMOUS_PROVIDER_PROOF: "
     rf"(?P<actor>provider-[a-z]+) "
     rf"COMPONENT=(?P<component>\d+) TX={TX}", 2),

    ("bond_release", rf"AUTONOMOUS_KEEPER_RELEASED_LOSER: "
     rf"OFFER=(?P<offer>\d+) TX={TX}", 1),

    ("settlement", rf"AUTONOMOUS_KEEPER_SETTLED: "
     rf"BUNDLE=(?P<bundle>\d+) TX={TX}", 1),

    ("completion", rf"AUTONOMOUS_WORKER_COMPLETED: "
     rf"(?P<actor>worker\d+\.test\.near) "
     rf"JOB=(?P<job>\d+) TOTAL=(?P<total>\d+) TX={TX}", 2),
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate(raw):
    lines = raw.splitlines()

    for marker in REQUIRED:
        require(lines.count(marker) == 1,
                "missing/duplicated marker: " + marker)

    require(
        "AUTONOMOUS_AGENT_FAILED:" not in raw
        and "R7_10_FOUR_PILLARS: FAIL" not in raw,
        "failure detected in execution"
    )

    groups = {}
    events = []

    for kind, pattern, expected in PATTERNS:
        matches = list(re.finditer(
            "^" + pattern + "$", raw, re.MULTILINE
        ))

        require(
            len(matches) == expected,
            f"{kind}: expected {expected}, got {len(matches)}"
        )

        groups[kind] = []

        for match in matches:
            event = {
                "type": kind,
                "log_line": raw.count("\n", 0, match.start()) + 1,
                **match.groupdict(),
            }
            groups[kind].append(event)
            events.append(event)

    decisions = {
        x["actor"]: x["decision"] for x in groups["policy"]
    }
    require(decisions == {
        "buyer-1": "ACCEPT",
        "buyer-2": "ACCEPT",
        "buyer-3": "REJECT",
    }, "buyer policies inconsistent")

    funding = {
        x["actor"]: int(x["job"]) for x in groups["funding"]
    }
    consent = {
        x["actor"]: int(x["job"]) for x in groups["consent"]
    }

    require(
        set(funding) == {"buyer-1", "buyer-2"}
        and funding == consent
        and set(funding.values()) == {0, 1},
        "funding/consent mismatch"
    )

    require(
        {x["actor"] for x in groups["offer"]} ==
        {"provider-alpha", "provider-beta", "provider-gamma"},
        "provider roster inconsistent"
    )

    require(
        {int(x["offer"]) for x in groups["offer"]} ==
        {0, 1, 2},
        "provider offer IDs inconsistent"
    )

    require(
        {x["actor"] for x in groups["proof"]} ==
        {"provider-beta", "provider-gamma"},
        "proof providers inconsistent"
    )

    for name, field in (
        ("proof", "component"),
        ("backup", "component"),
        ("acceptance", "job"),
        ("completion", "job"),
    ):
        require(
            {int(x[field]) for x in groups[name]} == {0, 1},
            name + ": incomplete coverage"
        )

    require(
        all(int(x["total"]) == 632
            for x in groups["completion"]),
        "reconstructed result mismatch"
    )

    price = int(groups["award"][0]["price"])
    payments = [
        int(x["payment"]) for x in groups["consent"]
    ]

    require(
        price == 11 * UNIT
        and sorted(payments) == [11 * UNIT // 2] * 2,
        "economic payment conservation failed"
    )

    require(
        groups["award"][0]["bundle"] ==
        groups["settlement"][0]["bundle"],
        "settlement bundle mismatch"
    )

    offer_ids = {
        row["actor"]: int(row["offer"])
        for row in groups["offer"]
    }

    released_id = int(
        groups["bond_release"][0]["offer"]
    )

    require(
        released_id == offer_ids["provider-alpha"],
        "released offer does not belong to losing provider"
    )

    require(
        released_id not in {
            offer_ids["provider-beta"],
            offer_ids["provider-gamma"],
        },
        "winning provider bond was released"
    )

    require(
        lines.count("AGENTSHIELD_CONSENT_POLICY: PASS") == 2,
        "AgentShield consent validation missing"
    )

    for actor in ("buyer-3", "provider-delta"):
        require(
            lines.count(
                "AUTONOMOUS_POLICY_REFUSAL: " + actor
            ) == 1,
            "policy refusal missing: " + actor
        )

    require(
        lines.index("R7_SOURCE_PROCESS_EXITED: PASS") <
        lines.index("AUTONOMOUS_TWO_BUYER_FUNDS: PASS"),
        "outage/funding ordering failed"
    )

    def metric(name):
        found = re.findall(
            "^" + re.escape(name) + r": (\d+)$",
            raw,
            re.MULTILINE
        )
        require(
            len(found) == 1 and int(found[0]) > 0,
            "metric missing: " + name
        )
        return int(found[0])

    events.sort(key=lambda x: x["log_line"])

    return {
        "events": events,
        "price": price,
        "payments": payments,
        "watchdog_ms": metric("R7_WATCHDOG_DETECTION_MS"),
        "recovery_ms": metric("R7_RECOVERY_WALLCLOCK_MS"),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--log", required=True, type=Path)
    parser.add_argument("--wasm", type=Path)
    parser.add_argument("--provenance", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--reference-check", action="store_true")
    args = parser.parse_args()

    log_bytes = args.log.read_bytes()
    result = validate(log_bytes.decode("utf-8"))

    if args.reference_check:
        require(
            args.wasm is None and args.output is None,
            "reference check cannot create evidence"
        )
        print("R7_11_REFERENCE_LOG_PARSER: PASS")
        return

    require(
        args.wasm is not None and args.output is not None
        and args.provenance is not None,
        "WASM and output required"
    )

    wasm_hash = hashlib.sha256(
        args.wasm.read_bytes()
    ).hexdigest()

    require(
        wasm_hash == EXPECTED_WASM,
        "deployed V2 WASM byte parity failed"
    )

    provenance = json.loads(
        args.provenance.read_text(encoding="utf-8")
    )

    require(
        provenance.get("sha256") == wasm_hash,
        "WASM provenance hash mismatch"
    )

    require(
        provenance.get("code_hash") ==
        "3dz93Y6r2ZxupsYrJokcD6PqubygQA9XYV5qbzCpd7AD",
        "Unexpected Testnet code hash"
    )

    require(
        provenance.get("contract") ==
        "nmg-r7v2-0b9a0eff20.testnet"
        and provenance.get("network") == "near-testnet",
        "Unexpected contract identity"
    )

    head = subprocess.check_output(
        ["git", "rev-parse", "HEAD"],
        text=True
    ).strip()

    evidence = {
        "schema": "nomogenesis.r7-11.evidence.v1",
        "network": "local-near-sandbox",
        "source_commit": head,
        "contract_provenance": provenance,
        "wasm_sha256": wasm_hash,
        "execution_log_sha256": hashlib.sha256(
            log_bytes
        ).hexdigest(),
        "verified_markers": list(REQUIRED),
        "events": result["events"],
        "measurements": {
            "watchdog_since_last_healthy_ms":
                result["watchdog_ms"],
            "recovery_wallclock_ms":
                result["recovery_ms"],
        },
        "economics": {
            "award_price_yocto": str(result["price"]),
            "buyer_payments_yocto": [
                str(v) for v in result["payments"]
            ],
            "terminal_escrow_units": 0,
            "terminal_claimable_units": 52,
            "conservation": "52 = 0 + 52",
        },
        "limitations": [
            "Local Sandbox; not a public Testnet execution",
            "Synthetic same-host providers",
            "Watchdog metric is since last healthy observation",
            "No independent security audit",
        ],
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".json.tmp")

    temporary.write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n",
        encoding="utf-8"
    )
    temporary.replace(args.output)

    print("R7_11_STRUCTURED_EVIDENCE: PASS")
    print("JSON_SHA256=" + hashlib.sha256(
        args.output.read_bytes()
    ).hexdigest())


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, UnicodeError,
            subprocess.CalledProcessError) as error:
        print(
            "R7_11_STRUCTURED_EVIDENCE: FAIL:",
            error,
            file=sys.stderr
        )
        sys.exit(1)
