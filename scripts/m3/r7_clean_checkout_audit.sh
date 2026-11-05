#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT"

echo "=== NOMOGENESIS PUBLIC SOURCE AUDIT ==="

test -d .git
test -s Cargo.lock
test -s docs/evidence/R6-05-public.json
test -s docs/evidence/R7-02B-01-transaction-witness.json
test -s docs/evidence/R7-02B-03-award-transition.json

test -z "$(git status --porcelain)"

echo "SOURCE: $(git rev-parse --short HEAD)"

echo "=== REBUILD DETERMINISTIC ARTIFACTS ==="

node scripts/m3/r6_build_demo.cjs

python3 -B scripts/m3/r7_build_diff_vectors.py

python3 -B scripts/m3/r7_certificate_fixtures.py

git diff --exit-code -- \
  demo/nomogenesis_jury_demo.html \
  docs/evidence/R7-02C-allocation-vectors.json \
  docs/evidence/R7-02C-certificate-fixtures.json

echo "DETERMINISTIC ARTIFACTS: PASS"

echo "=== PYTHON GENESIS REGRESSION ==="

python3 -B -m unittest discover \
  -s scripts/m3 \
  -p 'test_r7_*.py' -q

echo "=== OFFLINE CERTIFICATE INTEGRITY ==="

python3 -B scripts/m3/r7_public_replay.py --offline

echo "=== COMPLETE RUST LIBRARY TESTS ==="

cargo test --locked --lib

echo "=== INDEPENDENT RUST CERTIFICATE VERIFIER ==="

cargo test --locked \
  --test r7_genesis_certificate

echo "=== JAVASCRIPT AND JURY UI TESTS ==="

node --test \
  scripts/m3/r6_demo.test.cjs \
  scripts/m3/r7_genesis_ui.test.cjs \
  scripts/m3/r7_emergence_benchmark.test.cjs

echo "=== LIVE TESTNET: GENESIS RECONSTRUCTION ==="

python3 -B -u scripts/m3/r7_public_replay.py

echo "R7 HISTORICAL TESTNET REPLAY: PASS"

echo "=== LIVE TESTNET: R6 FULL LIFECYCLE ==="

# Use the existing public verifier with one
# working RPC, without changing its tracked source.
# R7 above independently checks transaction data
# on two RPC endpoints and history on an archive.

python3 -B - <<'PY'
from pathlib import Path

source = Path("scripts/m3/r6_verify_public.cjs")
probe = Path("scripts/m3/r6_verify_single_rpc.cjs")

assert not probe.exists()

s = source.read_text()

old = """const endpoints = [
  'https://rpc.testnet.fastnear.com',
  'https://near-testnet.drpc.org'
];"""

new = """const endpoints = [
  'https://rpc.testnet.fastnear.com'
];"""

assert s.count(old) == 1
s = s.replace(old, new, 1)

assert s.count(
    "PUBLIC_RPC_VERIFICATIONS: 2/2 PASS"
) == 1

assert s.count("TOTAL_TX_RPC_CHECKS: 34") == 1

s = s.replace(
    "PUBLIC_RPC_VERIFICATIONS: 2/2 PASS",
    "PUBLIC_RPC_VERIFICATIONS: 1/1 PASS",
)

s = s.replace(
    "TOTAL_TX_RPC_CHECKS: 34",
    "TOTAL_TX_RPC_CHECKS: 17",
)

probe.write_text(s)

print("READ-ONLY R6 PROBE: PREPARED")
print("ENDPOINT: FastNear Testnet")
PY

trap 'rm -f scripts/m3/r6_verify_single_rpc.cjs' EXIT

node scripts/m3/r6_verify_single_rpc.cjs

rm scripts/m3/r6_verify_single_rpc.cjs
trap - EXIT

echo "R6 COMPLETE TESTNET LIFECYCLE: PASS"

echo "=== VERIFY CLEAN SOURCE ==="

git diff --quiet
git diff --cached --quiet
test -z "$(git ls-files --others --exclude-standard)"

echo "GENERATED ARTIFACT DRIFT: NONE"
echo "UNTRACKED OUTPUT: NONE"
echo "CLEAN CHECKOUT AUDIT: PASS"
