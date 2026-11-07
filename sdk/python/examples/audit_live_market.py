#!/usr/bin/env python3
"""
Nomogenesis Shield — Live Testnet Market Audit Example.

This script executes a read-only independent cryptographic audit of the completed
Nomogenesis R7 V2 rescue market on public NEAR Testnet.

Verifications performed:
  1. NEAR RPC connectivity and deployed bytecode code hash verification
  2. Rescue case exists and is in terminal 'Closed' state
  3. Binary component payloads validated and authenticated against Merkle commitments
  4. Quantity × Unit Price total deterministically reconstructed (verifies exact 632)
  5. Historical worker jobs verified as Completed with zero held rewards
  6. Financial liabilities verified (34 UNIT claimable, 0 pending)
  7. Rescue escrow verified as 0 UNIT
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure local source tree is importable if package is not yet installed
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from nomogenesis import (
    DEFAULT_EXPECTED_CODE_HASH,
    DEFAULT_HISTORICAL_CASE_ID,
    DEFAULT_TESTNET_CONTRACT,
    Shield,
)


def main() -> int:
    print("\n[+] Initializing Nomogenesis Shield for NEAR Testnet...")
    shield = Shield(
        network="testnet",
        contract_id=DEFAULT_TESTNET_CONTRACT,
        expected_code_hash=DEFAULT_EXPECTED_CODE_HASH,
    )

    case_id = DEFAULT_HISTORICAL_CASE_ID
    print(f"[+] Auditing historical completed rescue case: {case_id}")
    print(f"[+] Contract: {shield.contract_id}")

    try:
        report = shield.audit_case(
            case_id=case_id,
            expected_code_hash=DEFAULT_EXPECTED_CODE_HASH,
            expected_result=632,
        )
    except Exception as exc:
        print(f"[!] Audit failed with unexpected exception: {exc}")
        return 1

    print("\n" + str(report) + "\n")

    if report.passed:
        print("[SUCCESS] All on-chain assertions and cryptographic proofs VERIFIED.")
        return 0
    else:
        print("[FAILURE] Audit failed one or more verification checks.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
