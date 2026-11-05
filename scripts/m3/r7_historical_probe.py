"""Read-only historical NEAR market-state probe."""

import base64
import json
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RPC = "https://archival-rpc.testnet.fastnear.com"


def _pace_archive_rpc():
    """Share a small request budget across replay subprocesses."""
    marker = Path(os.environ.get(
        "NMG_R7_ARCHIVE_PACE_FILE",
        "/tmp/nomogenesis-r7-archive-pace",
    ))

    if marker.exists():
        try:
            elapsed = time.monotonic() - float(
                marker.read_text()
            )
            delay = max(0.0, min(4.0, 4.0 - elapsed))
            if delay:
                time.sleep(delay)
        except ValueError:
            pass

    marker.write_text(str(time.monotonic()))


def _retry_after(headers):
    """Handle numeric and HTTP-date Retry-After headers."""
    value = headers.get("Retry-After", "")

    if not value:
        return 0.0

    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            date = parsedate_to_datetime(value)
            return max(
                0.0,
                (
                    date - datetime.now(timezone.utc)
                ).total_seconds(),
            )
        except (ValueError, TypeError, OverflowError):
            return 0.0


def rpc(method, params):
    payload = json.dumps({
        "jsonrpc": "2.0",
        "id": "genesis-history",
        "method": method,
        "params": params,
    }).encode()

    request = urllib.request.Request(
        RPC,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    for attempt in range(5):
        _pace_archive_rpc()

        try:
            with urllib.request.urlopen(
                request, timeout=30
            ) as response:
                result = json.load(response)

            if "error" in result:
                raise RuntimeError(
                    f"Archival RPC rejected query: "
                    f"{result['error']}"
                )

            return result["result"]

        except urllib.error.HTTPError as error:
            if error.code != 429:
                raise RuntimeError(
                    f"Archival RPC HTTP {error.code}"
                ) from error

            if attempt == 4:
                raise RuntimeError(
                    "Archival RPC rate limit persisted "
                    "after bounded retries"
                ) from error

            delay = max(
                15 * (2 ** attempt),
                _retry_after(error.headers),
            )

            print(
                f"ARCHIVE RATE LIMIT 429: "
                f"backoff {delay:.0f}s "
                f"(retry {attempt + 1}/4)",
                flush=True,
            )
            time.sleep(delay)

        except (TimeoutError, ConnectionError) as error:
            if attempt == 4:
                raise RuntimeError(
                    "Archival RPC connectivity exhausted"
                ) from error

            time.sleep(5 * (attempt + 1))

    raise RuntimeError("Archival RPC exhausted")

def historical_view(block_hash, contract, method, args):
    encoded = base64.b64encode(
        json.dumps(args).encode()
    ).decode()

    result = rpc("query", {
        "request_type": "call_function",
        "block_id": block_hash,
        "account_id": contract,
        "method_name": method,
        "args_base64": encoded,
    })

    return json.loads(
        bytes(result["result"]).decode()
    )


def check(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    manifest = json.loads(
        (ROOT / "docs/evidence/R6-05-public.json")
        .read_text()
    )

    witness = json.loads(
        (
            ROOT /
            os.environ.get("NMG_R7_WITNESS_PATH", "docs/evidence/R7-02B-01-transaction-witness.json")
        ).read_text()
    )

    contract = manifest["contract"]
    award = next(
        row for row in manifest["transactions"]
        if row["step"] == "award"
    )

    print("=== LOCATE AWARD EXECUTION ===")

    tx = rpc(
        "EXPERIMENTAL_tx_status",
        [award["tx"], award["signer"]],
    )

    check(
        tx["transaction"]["hash"] == award["tx"],
        "award transaction mismatch",
    )

    root_ids = set(
        tx["transaction_outcome"]["outcome"]
        ["receipt_ids"]
    )

    outcomes = [
        row for row in tx["receipts_outcome"]
        if row["id"] in root_ids
    ]

    check(
        len(outcomes) == 1,
        "ambiguous award execution receipt",
    )

    execution_block = outcomes[0]["block_hash"]

    check(
        "Failure" not in outcomes[0]["outcome"]["status"],
        "award execution failed",
    )

    print("EXECUTION BLOCK:", execution_block)

    block = rpc("block", {
        "block_id": execution_block
    })

    check(
        block["header"]["hash"] == execution_block,
        "block hash mismatch",
    )

    parent = block["header"]["prev_hash"]

    print("PREDECESSOR BLOCK:", parent)

    case_id = list(
        bytes.fromhex(manifest["case_id_hex"])
    )

    print("=== READ HISTORICAL CASE ===")

    case = historical_view(
        parent,
        contract,
        "get_rescue_case",
        {"case_id": case_id},
    )

    check(case is not None, "missing historical case")

    print("CASE PHASE:", case["phase"])
    print("CASE JOB IDS:", case["job_ids"])
    print("CASE OFFER IDS:", case["offer_ids"])

    check(
        case["phase"] == "Open",
        "case not open at predecessor block",
    )

    check(
        case["job_ids"] == manifest["job_ids"],
        "unexpected historical job set",
    )

    check(
        case["offer_ids"] == manifest["offer_ids"],
        "unexpected historical offer set",
    )

    print("=== READ EVERY REGISTERED JOB ===")

    jobs = []
    mandates = []

    for job_id in case["job_ids"]:
        job = historical_view(
            parent, contract,
            "get_rescue_job",
            {"job_id": job_id},
        )

        mandate = historical_view(
            parent, contract,
            "get_rescue_mandate",
            {"job_id": job_id},
        )

        check(job is not None, "missing job")
        check(mandate is not None, "missing mandate")

        check(
            job["phase"] == "Accepted",
            "job not accepted",
        )

        check(
            mandate["phase"] == "Open",
            "mandate not open",
        )

        expected = next(
            buyer["cap"]
            for buyer in witness[
                "genesis_certificate"
            ]["input"]["buyers"]
            if buyer["job_id"] == job_id
        )

        check(
            int(mandate["held_principal"]) == expected,
            "funding mismatch",
        )

        jobs.append(job)
        mandates.append(mandate)

        print("JOB", job_id, "ACCEPTED / FUNDED")

    print("=== READ EVERY REGISTERED OFFER ===")

    offers = []

    for offer_id in case["offer_ids"]:
        offer = historical_view(
            parent, contract,
            "get_rescue_offer",
            {"offer_id": offer_id},
        )

        check(offer is not None, "missing offer")
        check(
            offer["phase"] == "Open",
            "offer not open",
        )

        expected = next(
            row
            for row in witness[
                "genesis_certificate"
            ]["input"]["offers"]
            if row["offer_id"] == offer_id
        )

        check(
            offer["provider"] == expected["provider"],
            "provider mismatch",
        )

        check(
            int(offer["fee"]) == expected["fee"],
            "offer fee mismatch",
        )

        check(
            int(offer["held_bond"]) >=
            witness[
                "genesis_certificate"
            ]["winning_pair"]["price"],
            "insufficient historical bond",
        )

        offers.append(offer)

        print("OFFER", offer_id, "OPEN / BONDED")

    print("=== WRITE ARCHIVAL EVIDENCE ===")

    result = {
        "version": "r7-02b-02-parent-block-probe",
        "contract": contract,
        "award_transaction": award["tx"],
        "execution_block": execution_block,
        "predecessor_block": parent,
        "case": case,
        "jobs": jobs,
        "mandates": mandates,
        "offers": offers,
        "case_registered_market_match": True,
        "limitations": [
            "Single archival RPC provider",
            "Predecessor-block state, not exact "
            "pre-receipt state",
            "Capacity-lock availability not "
            "independently checked",
            "State authenticated by RPC response, "
            "not locally verified Merkle proof",
            "No independent economic actors proven",
        ],
    }

    destination = Path(
        os.environ.get("NMG_R7_HISTORY_PATH", "/workspaces/nomogenesis-r7-historical-state.json")
    )

    destination.write_text(
        json.dumps(result, indent=2) + "\n"
    )

    print("HISTORICAL JOBS:", len(jobs))
    print("HISTORICAL OFFERS:", len(offers))
    print("PARENT-BLOCK MARKET CHECK: PASS")
    print("EXACT PRE-RECEIPT PROOF: PENDING")
    print("OUTPUT:", destination)


if __name__ == "__main__":
    main()
