#!/usr/bin/env bash
set -euo pipefail
RUSTFLAGS="--cfg near" cargo build --locked --release --target wasm32-unknown-unknown
node_modules/.bin/wasm-opt target/wasm32-unknown-unknown/release/prime_radiant_nomogenesis.wasm --mvp-features --enable-multivalue --enable-mutable-globals --enable-reference-types --enable-sign-ext --enable-nontrapping-float-to-int --enable-bulk-memory --enable-bulk-memory-opt --llvm-memory-copy-fill-lowering --llvm-nontrapping-fptoint-lowering --strip-debug -o target/nomogenesis_compatible.wasm
test -s target/nomogenesis_compatible.wasm
sha256sum target/nomogenesis_compatible.wasm
