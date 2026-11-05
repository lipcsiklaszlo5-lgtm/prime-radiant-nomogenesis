"""Read-only reconstruction of public NEAR transaction inputs."""

import base64
import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

RPCS = (
    "https://rpc.testnet.fastnear.com",
    "https://rpc.testnet.near.org",
)

STEPS = {
    "case",
    "buyer0-fund", "buyer1-fund", "buyer2-fund",
    "worker0-accept", "worker1-accept", "worker2-accept",
    "provider0-offer", "provider1-offer",
    "award",
}


def rpc(endpoint, tx_hash, signer):
    payload = {
        "jsonrpc": "2.0",
        "id": "genesis",
        "method": "EXPERIMENTAL_tx_status",
        "params": [tx_hash, signer],
    }

    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    last_error = None

    for attempt in range(3):
        try:
            with urllib.request.urlopen(
                request, timeout=25
            ) as response:
                result = json.load(response)

            if "error" in result:
                raise ValueError(str(result["error"]))

            return result["result"]

        except (OSError, ValueError) as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(attempt + 1)

    raise RuntimeError(
        f"RPC unavailable: {endpoint}: {last_error}"
    )


def extract(result, expected, contract):
    tx = result["transaction"]

    assert tx["hash"] == expected["tx"]
    assert tx["signer_id"] == expected["signer"]
    assert tx["receiver_id"] == contract

    status = result["status"]
    assert (
        "SuccessValue" in status
        or "SuccessReceiptId" in status
    )

    for receipt in result.get("receipts_outcome", []):
        assert "Failure" not in receipt["outcome"]["status"]

    calls = [
        action["FunctionCall"]
        for action in tx["actions"]
        if "FunctionCall" in action
    ]

    assert len(calls) == 1
    call = calls[0]

    assert call["method_name"] == expected["method"]

    raw = base64.b64decode(
        call["args"], validate=True
    )
    args = json.loads(raw)

    assert isinstance(args, dict)

    return {
        "step": expected["step"],
        "tx": expected["tx"],
        "signer": expected["signer"],
        "method": expected["method"],
        "block_hash": result["transaction_outcome"]["block_hash"],
        "attached_deposit": str(call["deposit"]),
        "args_sha256": hashlib.sha256(raw).hexdigest(),
        "args": args,
    }


def main():
    manifest = json.loads(
        (ROOT / "docs/evidence/R6-05-public.json")
        .read_text()
    )

    assert manifest["network"] == "testnet"
    assert len(manifest["transactions"]) == 17

    selected = [
        item for item in manifest["transactions"]
        if item["step"] in STEPS
    ]

    assert len(selected) == 10

    results = []

    for item in selected:
        observations = [
            extract(
                rpc(endpoint, item["tx"], item["signer"]),
                item,
                manifest["contract"],
            )
            for endpoint in RPCS
        ]

        assert observations[0] == observations[1], (
            "RPC disagreement: " + item["step"]
        )

        record = observations[0]
        results.append(record)

        print("\nSTEP:", record["step"])
        print("BLOCK:", record["block_hash"])
        print("ARGUMENTS:", json.dumps(
            record["args"],
            sort_keys=True,
            ensure_ascii=False,
        )[:3000])

    output = {
        "source": "public-near-testnet-transactions",
        "contract": manifest["contract"],
        "rpc_count": len(RPCS),
        "transactions": results,
        "limitations": [
            "Verified transaction arguments only",
            "Historical eligibility not yet established",
            "No authenticated full market snapshot",
            "No Genesis Certificate chain binding yet",
            "RPC endpoints may share infrastructure",
        ],
    }

    destination = Path(
        "/workspaces/nomogenesis-r7-chain-preflight.json"
    )

    destination.write_text(
        json.dumps(output, indent=2) + "\n"
    )

    print("\nPUBLIC ACTIONS:", len(results))
    print("TWO-ENDPOINT ARGUMENT AGREEMENT: PASS")
    print("OUTPUT:", destination)
    print("GENESIS CHAIN PREFLIGHT: PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("GENESIS CHAIN PREFLIGHT: FAIL", exc)
        sys.exit(1)
