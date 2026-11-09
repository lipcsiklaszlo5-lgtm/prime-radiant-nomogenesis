# Technical closure candidate — 2026-11-10

Base: `5cc20f81e37c80c35046fdaacc5c736439f6c28a`.
Branch: `fix/technical-closure`.
The deployed contract and its Rust source are unchanged.

## Findings and changes

RUN08 stopped before award. Buyer-1 hash
`tEhFBRTm5BEjaYYwDspbJJcgxdQNf3ZCHKxosdMCfPJ` was still unknown on
both FastNear and NEAR public RPC reads during this review. The exact reason
for rejection/non-inclusion is not established. `send_tx/NONE` returns before
validation/inclusion; increasing finality timeouts cannot establish acceptance.
The existing FINAL long-polls could also outlive the caller's timeout.
Reference: https://docs.near.org/api/rpc/transactions

- The existing transaction guard now sends once with INCLUDED, then reads with
  NONE until the response actually says FINAL. Invalid submissions fail with
  their original diagnostic; a lost acknowledgement reconciles the same hash
  without another signature or broadcast. Final outcomes are journaled.
- The existing broker uses bounded nonblocking finality reads and tries the
  next reader on UNKNOWN_TRANSACTION, TIMEOUT_ERROR or DOES_NOT_TRACK_SHARD.
- Selected provider agents wait for successful settlement and withdraw only
  the new locked bond plus fee: beta 17 UNIT, gamma 16 UNIT. Historical claims
  remain untouched. Actual native Transfer and callback receipts must succeed.
- A stable client data endpoint serves the original source before failure,
  returns 503 during the outage, and serves the same bytes from the contract's
  authenticated payloads after recovery. The original source stays terminated.
- The same coordinator and persistent agent programs run locally and on
  Testnet. Local mode uses separate temporary Sandbox identities and the exact
  public WASM SHA-256 `2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e`.
- The Python SDK retains buyer policy evaluation and adds explicit loopback
  Sandbox support. `sdk/python/examples/audit_run.py` audits the actual run's
  case, bytecode, proofs, result, completed jobs and financial state at one
  finalized block, then saves `sdk-audit.json` beside `evidence.json`.

## Actual validation

These ran successfully in this work session:

```text
node --test scripts/m3/r7_13_single_send.test.cjs \
  scripts/m3/r7_13v_32_finality_lane.test.cjs \
  scripts/m3/technical_closure.test.cjs
10 passed; 0 failed

node --test scripts/m3/r7_13_tx_guard.test.cjs \
  scripts/m3/r7_13_read_resilience.test.cjs
7 passed; 0 failed

node --test scripts/m3/r7_13v_37_run08_live_guards.test.cjs \
  scripts/m3/r7_13v_34_run08_guards.test.cjs
17 passed; 0 failed

PYTHONPATH=sdk/python/src python3 -m unittest discover -s sdk/python/tests
57 passed
```

Changed JavaScript entry points passed syntax checks; `audit_run.py --help`
and `git diff --check` passed.

The native receipt verifier also passed on the actual historical public
withdrawal `AiDr3cP7BWF38k49VsnrKULjcSNU2fXuSKgRHm9GDPWs` for 20 UNIT,
including receipt recipient, exact amount, executor and callback success.
This is parser validation against a historical transaction, not a new payout.

The SDK independently re-audited historical V2 case
`b8c0d0ed9f80a399cba96c4c9ac688e548e500cb4705ecbfdbdcedd0a2b9bf12`
at finalized block `2Pj6gpTthAFgiJD8B8pzyrt5W7DsKKJGPG9QxvCKTyHQ`:
deployed code matches, both Merkle components authenticate, result 632,
jobs 0/1 Completed, global claimable 302 UNIT, pending 0, rescue escrow 0.

## Remaining execution — not yet PASS

The new complete lifecycle could not run here: NEAR Sandbox 2.6.2 requires
65535 file descriptors, while this executor's hard limit is 16384. Startup
fails before a local chain is created. No sandbox binary, contract or kernel
limit was altered to bypass this. No new Testnet transactions were sent.

On EC2, use the existing Node environment and locked node_modules:

```bash
node scripts/m3/technical_closure.cjs --sandbox
node scripts/m3/technical_closure.cjs --check
node scripts/m3/technical_closure.cjs --live
```

Shell execution must stop if any command fails. Sandbox mode deliberately
loses one inclusion acknowledgement and must still complete with exactly 19
distinct broadcasts. It accelerates only the local clock after both jobs are
accepted and all three offers exist. Public mode uses real chain time.

Acceptance: 19 FINAL transactions; two exact buyer consents; atomic award;
two provider proofs; two completed jobs; two verified native transfers and
callbacks; HTTP 200→503→200 with identical data; result 632; zero pending and
rescue escrow; 52 UNIT deposited = 19 UNIT remaining claims + 33 UNIT paid;
successful Python SDK audit. The 52 UNIT equation excludes separately held
storage deposits. Public mode refuses an existing run journal or nonzero
rescue escrow/pending withdrawal, and uses the existing Testnet signers.
Never relaunch an interrupted public run before reconciling its journals.

Limits: bounded recovery of two precommitted data components, controlled
process outage, same-host agents/backups, no arbitrary infrastructure SLA or
independent operator network. Mainnet, presentation and repository cleanup
are outside this change. The next step is the EC2 execution above.
