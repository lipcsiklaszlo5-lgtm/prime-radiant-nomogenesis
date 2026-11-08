#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE="cb0fac2d25d276b44868cdaac3c578cd0594ea62"
EXPECTED="2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e"

fail() {
  echo "R7_11_CLEAN_CHECKOUT: FAIL ($*)" >&2
  exit 1
}

git merge-base --is-ancestor "$BASE" HEAD ||
  fail "R7-10 checkpoint missing"

test -z "$(git status --porcelain --untracked-files=all)" ||
  fail "dirty checkout"

for tool in node npm python3 cargo rustup sha256sum; do
  command -v "$tool" >/dev/null ||
    fail "missing prerequisite: $tool"
done

node -e '
if (Number(process.versions.node.split(".")[0]) < 22)
  process.exit(1)
' || fail "Node.js 22+ required"

python3 -c '
import sys
assert sys.version_info >= (3, 10)
' || fail "Python 3.10+ required"

unset NODE_PATH PYTHONPATH PYTHONHOME
unset NOMOGENESIS_V2_WASM CARGO_TARGET_DIR NEAR_SANDBOX_BIN_PATH

export PYTHONDONTWRITEBYTECODE=1
export CARGO_BUILD_JOBS=2

echo "=== LOCKED DEPENDENCIES ==="

npm ci --no-audit --no-fund

rustup toolchain install 1.99.1 --profile minimal
rustup target add --toolchain 1.99.1 wasm32-unknown-unknown

echo "=== CONTRACT BUILD ==="

RUSTFLAGS="--cfg near" cargo +1.99.1 build \
  --locked \
  --release \
  --target wasm32-unknown-unknown \
  --features r7-v2

node_modules/.bin/wasm-opt \
  target/wasm32-unknown-unknown/release/prime_radiant_nomogenesis.wasm \
  --mvp-features \
  --enable-multivalue \
  --enable-mutable-globals \
  --enable-reference-types \
  --enable-sign-ext \
  --enable-nontrapping-float-to-int \
  --enable-bulk-memory \
  --enable-bulk-memory-opt \
  --llvm-memory-copy-fill-lowering \
  --llvm-nontrapping-fptoint-lowering \
  --strip-debug \
  -o target/nomogenesis_compatible.wasm

WASM="$ROOT/target/nomogenesis_compatible.wasm"

SOURCE_WASM="$WASM"

SOURCE_EXPECTED="ece3c580cf84788116c103652a26a9165a7f9f10e813d8e9d5ff2be867c2ec59"

echo "$SOURCE_EXPECTED  $SOURCE_WASM" | sha256sum -c - ||
  fail "source build mismatch"

echo "SOURCE_WASM_REPRODUCIBILITY: PASS"

DEPLOYED="$ROOT/target/r7-11-evidence/onchain-v2.wasm"
PROVENANCE="$ROOT/target/r7-11-evidence/onchain-v2-provenance.json"

python3 -B scripts/m3/r7_11_fetch_v2.py \
  --local "$SOURCE_WASM" \
  --output "$DEPLOYED" \
  --provenance "$PROVENANCE" ||
  fail "public deployed contract verification failed"

echo "$EXPECTED  $DEPLOYED" | sha256sum -c - ||
  fail "deployed WASM mismatch"

echo "V2 DEPLOYED WASM BYTE PARITY: PASS"

WASM="$DEPLOYED"

echo "=== PYTHON AGENTSHIELD ==="

python3 -B - <<'PY'
import sys
sys.path.insert(0, "sdk/python/src")
from nomogenesis import BuyerPolicy
print("PYTHON_AGENTSHIELD_IMPORT: PASS")
PY

echo "=== FOUR-PILLAR EXECUTION ==="

mkdir -p target/r7-11-evidence

LOG="$ROOT/target/r7-11-evidence/execution.log"

export NOMOGENESIS_V2_WASM="$WASM"

rm -f \
  "$ROOT/target/r7-11-evidence/evidence.json" \
  "$ROOT/target/r7-11-evidence/checksums.sha256"

node sandbox/r7_10_four_pillars.cjs \
  2>&1 | tee "$LOG"

echo "=== RAW EVIDENCE CHECK ==="

python3 -B - "$LOG" <<'PY'
from pathlib import Path
import sys

lines = Path(sys.argv[1]).read_text().splitlines()

required = [
    "R7_SOURCE_AND_BACKUPS_ARMED: PASS",
    "R7_SOURCE_PROCESS_EXITED: PASS",
    "R7_AUTONOMOUS_OUTAGE_DETECTED: PASS",
    "AUTONOMOUS_TWO_BUYER_FUNDS: PASS",
    "AUTONOMOUS_THREE_PROVIDER_BIDS: PASS",
    "TWO_PROVIDER_MERKLE_PROOFS: PASS",
    "AUTONOMOUS_TERMINAL_SETTLEMENT: PASS",
    "TWO_AUTHENTICATED_WORKER_COMPLETIONS: PASS",
    "TERMINAL_FINANCIAL_CONSERVATION: 52=0+52",
    "R7_10_FOUR_PILLARS: PASS",
]

for marker in required:
    if lines.count(marker) != 1:
        raise SystemExit(
            "R7_11_EVIDENCE: FAIL: " + marker
        )

print("FOUR PILLARS VERIFIED: PASS")
print("ECONOMIC CONSERVATION: PASS")
PY

sha256sum "$LOG" \
  > "$ROOT/target/r7-11-evidence/execution.sha256"

echo "=== STRUCTURED EVIDENCE ==="

python3 -B scripts/m3/r7_11_capture.py \
  --log "$LOG" \
  --wasm "$WASM" \
  --provenance "$PROVENANCE" \
  --output "$ROOT/target/r7-11-evidence/evidence.json"

sha256sum \
  "$LOG" \
  "$SOURCE_WASM" \
  "$DEPLOYED" \
  "$PROVENANCE" \
  "$ROOT/target/r7-11-evidence/evidence.json" \
  > "$ROOT/target/r7-11-evidence/checksums.sha256"

sha256sum -c \
  "$ROOT/target/r7-11-evidence/checksums.sha256"

echo "EVIDENCE GENERATED: PASS"
echo "R7_11_CLEAN_CHECKOUT: PASS"
