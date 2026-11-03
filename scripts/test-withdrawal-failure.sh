#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

original_hash=$(sha256sum src/withdrawal.rs | cut -d' ' -f1)
wasm_hash=$(sha256sum target/nomogenesis_compatible.wasm | cut -d' ' -f1)

scratch=$(mktemp -d)

cp src/withdrawal.rs "$scratch/withdrawal.rs"
cp target/nomogenesis_compatible.wasm "$scratch/original.wasm"

restore() {
  cp "$scratch/withdrawal.rs" src/withdrawal.rs
  cp "$scratch/original.wasm" target/nomogenesis_compatible.wasm
}

cleanup() {
  restore
  rm -rf "$scratch"
}

trap cleanup EXIT

python3 - <<'PY'
from pathlib import Path

p = Path('src/withdrawal.rs')
s = p.read_text()

old = 'let payout = env::promise_batch_create(&owner);'

new = '''let payout = env::promise_batch_create(
            &"missing-withdrawal-target.test.near"
                .parse()
                .expect("valid failure-test account"),
        );'''

assert s.count(old) == 1, "Unexpected withdrawal source"

p.write_text(s.replace(old, new, 1))
print("Fault-injection transfer target: INSTALLED")
PY

echo "=== BUILD ISOLATED FAILURE VARIANT ==="
npm run wasm:build

cp target/nomogenesis_compatible.wasm \
   target/nomogenesis_failure_variant.wasm

restore

test "$(sha256sum src/withdrawal.rs | cut -d' ' -f1)" = "$original_hash"
test "$(sha256sum target/nomogenesis_compatible.wasm | cut -d' ' -f1)" = "$wasm_hash"

echo "Original Rust source and production-candidate WASM: RESTORED"

echo "=== EXECUTE FAILURE-INJECTION SANDBOX ==="

NOMOGENESIS_WASM="$PWD/target/nomogenesis_failure_variant.wasm" \
node sandbox/withdrawal_failure.cjs

echo "=== RESTORATION VERIFICATION ==="

test "$(sha256sum src/withdrawal.rs | cut -d' ' -f1)" = "$original_hash"
test "$(sha256sum target/nomogenesis_compatible.wasm | cut -d' ' -f1)" = "$wasm_hash"

echo "=== M2/04C FAILURE-INJECTION TEST: PASS ==="
