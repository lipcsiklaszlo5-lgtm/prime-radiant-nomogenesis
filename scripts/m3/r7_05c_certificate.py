"""Calculate an off-chain Genesis V1 certificate.

Input is derived from public pre-award contract state.
The ready_at field is a bid-close surrogate, not
an independently witnessed provider arrival time.
"""

import json
import sys
from pathlib import Path

from r7_genesis import generate
from r7_genesis_verify import verify


def main():
    if len(sys.argv) != 7:
        raise SystemExit(
            "expected input, output, case_hex and three job IDs"
        )

    source, dest, case_hex, *jobs = sys.argv[1:]

    data = json.loads(
        Path(source).read_text()
    )

    data["buyers"] = [
        {
            "job_id": x["job_id"],
            "cap": int(x["cap"]),
        }
        for x in data["buyers"]
    ]

    data["offers"] = [
        {
            **x,
            "fee": int(x["fee"]),
            "bond": int(x["bond"]),
        }
        for x in data["offers"]
    ]

    cert = generate(data)

    assert verify(cert)

    expected = sorted(
        map(int, jobs)
    )

    assert [
        b["job_id"]
        for b in cert["input"]["buyers"]
    ] == expected

    assert cert["minimal_coalitions"] == [
        [expected[0], expected[1]],
        [expected[0], expected[2]],
        [expected[1], expected[2]],
    ]

    assert (
        cert["winning_pair"]["price"]
        == 12 * 10**21
    )

    assert (
        cert["coalitions"][-1]["allocation"]
        == [4 * 10**21] * 3
    )

    assert len(case_hex) == 64
    int(case_hex, 16)

    out = {
        "case_id_hex": case_hex,
        "genesis_certificate": cert,
        "limitations": [
            "Off-chain coalition enumeration, not an on-chain subset selection",
            "ready_at is a bid-close surrogate, not an observed timestamp",
            "Historical market view is supplied by public RPC",
            "All Testnet agents belong to one demonstration operator",
        ],
    }

    path = Path(dest)

    if path.exists():
        assert (
            json.loads(path.read_text())
            == out
        ), "certificate drift"
    else:
        path.write_text(
            json.dumps(out, indent=2) + "\n"
        )

    print(
        "R7 LIVE GENESIS CERTIFICATE: VERIFIED"
    )

    print(
        "MINIMAL COALITIONS:",
        cert["minimal_coalitions"]
    )

    print(
        "CERTIFICATE SHA256:",
        cert["certificate_hash"]
    )


if __name__ == "__main__":
    main()
