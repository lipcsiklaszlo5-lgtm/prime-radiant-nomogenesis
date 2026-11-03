#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ORDERS=(
  "0,2,3,1"
  "1,3,0,2"
  "2,1,0,3"
  "3,0,1,2"
)

mkdir -p /tmp/nomogenesis-refund-orders

for i in "${!ORDERS[@]}"; do
  case_number=$((i+1))
  log="/tmp/nomogenesis-refund-orders/case_${case_number}.log"

  echo "=== OWNERSHIP ORDER ${case_number}/4 ==="

  if RELEASE_ORDER="[${ORDERS[$i]}]" \
     timeout --signal=TERM --kill-after=10s 240s \
     npm run sandbox:ownership > "$log" 2>&1; then
    grep -F "=== M2/06C OWNERSHIP AUDIT: PASS ===" "$log"
  else
    tail -n 80 "$log"
    exit 1
  fi
done

python3 - <<'PY'
from pathlib import Path
import re

all_totals = []

for i in range(1, 5):
    s = Path(
        f"/tmp/nomogenesis-refund-orders/case_{i}.log"
    ).read_text()

    assert "=== M2/06C OWNERSHIP AUDIT: PASS ===" in s
    assert "Native rebate withdrawal: PASS" in s
    assert "Cross-owner accounting and replay: PASS" in s

    rows = re.findall(
        r"^Offer (\d+): owner=(reserve_[ab]\.test\.near) "
        r"freed=(\d+) rebate=(\d+)$",
        s,
        re.MULTILINE
    )

    assert len(rows) == 4
    assert {int(x[0]) for x in rows} == {0,1,2,3}

    totals = {
        "reserve_a.test.near": 0,
        "reserve_b.test.near": 0
    }

    counts = {key: 0 for key in totals}

    for _, owner, freed, rebate in rows:
        assert owner in totals
        assert int(freed) >= 0
        assert int(rebate) >= 0

        totals[owner] += int(rebate)
        counts[owner] += 1

    assert list(sorted(counts.values())) == [2,2]
    all_totals.append(totals)

assert all(x == all_totals[0] for x in all_totals)
assert all(x > 0 for x in all_totals[0].values())

print("=== FOUR ORDER REGRESSIONS: PASS ===")
print("Owner totals:", all_totals[0])
PY
