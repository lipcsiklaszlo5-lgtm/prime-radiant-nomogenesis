#!/usr/bin/env python3
"""Fetch and verify the public NEAR Testnet V2 contract."""

import argparse
import base64
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

RPC = "https://rpc.testnet.near.org"
CONTRACT = "nmg-r7v2-0b9a0eff20.testnet"

DEPLOYED_SHA = (
    "2730e3d0413929aa15201d27f23ce4173731745"
    "dab658c1b21f12c624cb93b9e"
)

SOURCE_SHA = (
    "ece3c580cf84788116c103652a26a9165a7f9f10"
    "e813d8e9d5ff2be867c2ec59"
)

CODE_HASH = (
    "3dz93Y6r2ZxupsYrJokcD6PqubygQA9XYV5qbzCpd7AD"
)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--local", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--provenance", required=True, type=Path)
    args = parser.parse_args()

    local_bytes = args.local.read_bytes()
    local_sha = sha(local_bytes)

    require(
        local_sha == SOURCE_SHA,
        "Source build no longer matches pinned reproducible hash"
    )

    request_body = {
        "jsonrpc": "2.0",
        "id": "r7-11-clean-checkout",
        "method": "query",
        "params": {
            "request_type": "view_code",
            "finality": "final",
            "account_id": CONTRACT,
        },
    }

    request = Request(
        RPC,
        data=json.dumps(request_body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urlopen(request, timeout=40) as response:
        reply = json.load(response)

    require("error" not in reply, str(reply.get("error")))

    state = reply["result"]
    deployed = base64.b64decode(
        state["code_base64"], validate=True
    )

    deployed_sha = sha(deployed)

    require(
        deployed[:4] == b"\x00asm",
        "Invalid WASM magic"
    )
    require(
        deployed_sha == DEPLOYED_SHA,
        "Unexpected deployed WASM SHA256"
    )
    require(
        state["hash"] == CODE_HASH,
        "Unexpected public onchain code hash"
    )
    require(
        int(state["block_height"]) > 0
        and bool(state["block_hash"]),
        "Missing finalized block provenance"
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.provenance.parent.mkdir(
        parents=True, exist_ok=True
    )

    if args.output.exists():
        require(
            args.output.read_bytes() == deployed,
            "Existing deployed artifact differs"
        )
    else:
        args.output.write_bytes(deployed)

    provenance = {
        "network": "near-testnet",
        "contract": CONTRACT,
        "rpc": RPC,
        "method": "view_code",
        "finality": "final",
        "block_height": state["block_height"],
        "block_hash": state["block_hash"],
        "code_hash": state["hash"],
        "sha256": deployed_sha,
        "source_wasm_sha256": local_sha,
        "source_equals_deployed": local_sha == deployed_sha,
        "deployed_wasm_bytes": len(deployed),
        "source_wasm_bytes": len(local_bytes),
    }

    args.provenance.write_text(
        json.dumps(provenance, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    print("SOURCE_BUILD_SHA256:", local_sha)
    print("DEPLOYED_WASM_SHA256:", deployed_sha)
    print("FINALIZED_BLOCK:", state["block_height"])
    print(
        "SOURCE_BUILD_EQUALS_DEPLOYED:",
        "YES" if local_sha == deployed_sha else "NO"
    )
    print("ONCHAIN_V2_WASM_VERIFIED: PASS")


if __name__ == "__main__":
    main()
