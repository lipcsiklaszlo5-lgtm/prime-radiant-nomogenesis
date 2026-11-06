#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

BASE="d1214e469d865bb93b67f67f6211c72b2c736841"
EXPECTED_WASM="2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e"

echo "=== NOMOGENESIS V2 CLEAN-CHECKOUT GATE ==="

BRANCH="$(git branch --show-current)"
test -n "$BRANCH"
git merge-base --is-ancestor "$BASE" HEAD
test -z "$(git status --porcelain --untracked-files=all)"

SOURCE_HEAD="$(git rev-parse HEAD)"
CLEAN="$(mktemp -d /tmp/nomogenesis-v2-gate-XXXXXXXX)"

echo "SOURCE_BRANCH=$BRANCH"
echo "SOURCE_HEAD=$SOURCE_HEAD"
echo "CLEAN_CHECKOUT=$CLEAN"

git clone --quiet --depth 1 --single-branch \
  --branch "$BRANCH" \
  "file://$ROOT" "$CLEAN"

cd "$CLEAN"

test "$(git rev-parse HEAD)" = "$SOURCE_HEAD"
test -z "$(git status --porcelain --untracked-files=all)"

for file in \
  Cargo.lock \
  package-lock.json \
  sandbox/r7_v2_autonomous_buyers.cjs \
  scripts/m3/r7_v2_buyer_agent.cjs \
  scripts/m3/r7_v2_buyer_bridge.cjs \
  demo/data/quantities.csv \
  demo/data/prices.csv
do
  test -s "$file"
done

echo "CLEAN SOURCE: PASS"

echo "=== TOOLCHAIN ==="
node --version
npm --version
rustc --version
cargo --version

echo "=== LOCKED DEPENDENCIES ==="
npm ci --no-audit --no-fund
rustup target add wasm32-unknown-unknown

echo "=== JAVASCRIPT VALIDATION ==="
node --check sandbox/r7_v2_autonomous_buyers.cjs
node --check scripts/m3/r7_v2_buyer_agent.cjs
node --check scripts/m3/r7_v2_buyer_bridge.cjs
node --test scripts/m3/r5_data_envelope.test.cjs

echo "=== BASE RUST REGRESSION ==="
cargo test --locked --lib --quiet

echo "=== V2 RUST INTEGRATION ==="
cargo test --locked --features r7-v2 \
  --test r7_v2_plan \
  --test r7_v2_funded_consent \
  --test r7_v2_legacy_guard \
  --quiet

echo "=== FEATURE-GATED V2 WASM BUILD ==="

RUSTFLAGS="--cfg near" cargo build \
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

WASM="$PWD/target/nomogenesis_compatible.wasm"
test -s "$WASM"

ACTUAL_WASM="$(sha256sum "$WASM" | cut -d' ' -f1)"

echo "ACTUAL_WASM_SHA256=$ACTUAL_WASM"
test "$ACTUAL_WASM" = "$EXPECTED_WASM"

echo "V2 WASM BYTE PARITY: PASS"

echo "=== COMPLETE SANDBOX RECOVERY ==="

NOMOGENESIS_V2_WASM="$WASM" \
  node sandbox/r7_v2_autonomous_buyers.cjs

echo "=== FINAL SOURCE INTEGRITY ==="

test -z "$(git status --porcelain --untracked-files=all)"

echo "R7 V2 CLEAN-CHECKOUT GATE: PASS"
