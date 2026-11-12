# Nomogenesis

An autonomous rescue market for shared dependencies on NEAR. When one data
source fails, affected buyer agents can pool bounded commitments, select a
bonded pair of recovery providers, verify committed component payloads, and
settle the obligations atomically.

## Source provenance

The public Git history begins on 2026-11-03 at the
[initial commit](https://github.com/lipcsiklaszlo5-lgtm/prime-radiant-nomogenesis/commit/4c9668ee42b8343740c59115731c815c3f79da9d).
Its M1 task and backup proof work is the foundation for the later M2 escrow
and refund rules and the M3 multi-buyer rescue market. The
[initial-to-V2 diff](https://github.com/lipcsiklaszlo5-lgtm/prime-radiant-nomogenesis/compare/4c9668ee42b8343740c59115731c815c3f79da9d...technical-closure-testnet-2026-11-12)
shows the development through the frozen, publicly exercised V2 core.
The exact core is tagged `technical-closure-testnet-2026-11-12` at
`b98f389dd12c5bf2819c317082ac21f5256189c9`.

Third-party dependencies are declared in `Cargo.lock`, `package-lock.json`
and `sdk/python/pyproject.toml`: in particular `near-sdk` 5.30.0, `sha2`
0.10.9, `near-workspaces` 5.0.0 and `binaryen` 132.0.0. The Python Shield
SDK has no runtime package dependencies.

## Verify the complete lifecycle

On Linux x86-64 with Node.js 22, npm, Python 3 and network access for the
locked npm dependencies:

```bash
npm ci
npm run verify
```

No NEAR wallet, Testnet funds, private keys, or Rust compiler are required.
The runner starts a fresh local NEAR Sandbox, deploys the exact V2 WASM in
`artifacts/nomogenesis-v2.wasm` (SHA-256
`2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e`),
creates isolated local signers, and runs the complete recovery. The binary is
the same one verified against the public Testnet deployment. Account IDs and
transaction hashes change with each run; the asserted transitions and
accounting do not.

Expect `LOCAL_TECHNICAL_CLOSURE: PASS`, `ONE_SEND_PER_ECONOMIC_STEP: 19/19`,
and `PYTHON_SDK_COMPLETED_RUN_AUDIT: PASS`. The run also checks the controlled
source outage, two approving buyers and one refusing buyer, three competing
offers, an atomic two-provider award, two Merkle component proofs, worker
completion, native provider transfers and callbacks, and conservation of
funds. It saves its local evidence under a fresh temporary directory printed
as `EVIDENCE=...`.

If `npm ci` cannot download dependencies, or NEAR Sandbox cannot bind a local
port, the environment needs to be fixed before this result can be judged.
The runner does not use public RPCs or local Testnet keys.
The [GitHub Actions workflow](.github/workflows/verify.yml) also executes
these checks on a clean Ubuntu 24.04 runner with Node 22.23.4 and Python 3.12.

## Public Testnet evidence

The same V2 deployment completed a separate 19-transaction lifecycle on
public NEAR Testnet on 2026-11-12. Case
`5b8530acbd28c3e39a90259e41e50c19fc1792798ab9522249fb0b9d7ac6f815`
closed with both worker jobs completed, accepted component proofs, native
provider withdrawals and no pending withdrawals or rescue escrow. The
on-chain code hash was
`3dz93Y6r2ZxupsYrJokcD6PqubygQA9XYV5qbzCpd7AD`.

The [evidence manifest](docs/evidence/technical-closure-testnet-2026-11-12/evidence.json),
[SDK audit](docs/evidence/technical-closure-testnet-2026-11-12/sdk-audit.json)
and 19 finalized transaction records are committed together. An offline
consistency check needs no wallet or RPC:

```bash
npm run verify:evidence
```

This offline check validates the recorded artifacts, not the present chain
state. The transaction hashes in the manifest can be independently queried
against public Testnet RPCs. Public RPC verification is against the queried
nodes; it is not a self-operated validating node.

## Implementation and limits

- `src/` contains the NEAR Rust contract and bounded economic rules.
- `scripts/m3/technical_closure.cjs` runs the local end-to-end lifecycle.
- `sdk/python/` is the external read-only verification SDK.
- `demo/data/` and `demo/policies/` contain the controlled dependency and
  agent policies.
- [HACKATHON.md](HACKATHON.md) describes the evidence and reviewer route.

The demonstration uses synthetic data, Testnet funds and one operator's
separate agent signers. Merkle verification proves consistency with committed
data; it does not independently prove arbitrary real-world repair or solve
the general oracle problem. Genesis coalition enumeration is off-chain.
There has been no independent security audit, mainnet deployment or TEE
attestation. Historical experiments and development notes are retained in
`docs/`, with the previous README at `docs/archive/README-legacy-2026-11.md`.

To rebuild the exact WASM from source, use the slower optional Rust gate
`bash scripts/m3/r7_v2_clean_checkout_gate.sh` after a clean commit. It
requires Rust 1.99.1 and the `wasm32-unknown-unknown` target.
