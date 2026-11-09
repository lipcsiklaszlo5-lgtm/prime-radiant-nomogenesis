#!/usr/bin/env python3
"""Audit the actual completed run, rather than a fixed historical balance."""
import argparse
from dataclasses import asdict
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from nomogenesis import Shield, UNIT, DEFAULT_EXPECTED_CODE_HASH


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("evidence", type=Path)
    parser.add_argument("--rpc", action="append")
    args = parser.parse_args()
    evidence = json.loads(args.evidence.read_text())
    shield = Shield(network=evidence["network"], contract_id=evidence["contract"],
                    rpc_endpoints=args.rpc, expected_code_hash=DEFAULT_EXPECTED_CODE_HASH)
    report = shield.audit_case(case_id=evidence["case_id"], expected_result=632,
                              expected_claimable_yocto=evidence["terminal"]["claimable"],
                              expected_pending_yocto=0, expected_escrow_yocto=0)
    print(report)
    if not report.passed:
        return 1
    assert len(evidence["transactions"]) == 19
    assert int(evidence["terminal"]["claimable"]) - int(evidence["prior_claimable"]) == 19 * UNIT
    with args.evidence.with_name("sdk-audit.json").open("x") as output:
        json.dump(asdict(report), output, indent=2)
    print("PYTHON_SDK_COMPLETED_RUN_AUDIT: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
