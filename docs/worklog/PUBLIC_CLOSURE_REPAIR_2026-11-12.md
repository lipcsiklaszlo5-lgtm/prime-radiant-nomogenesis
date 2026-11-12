# Public closure repair — 2026-11-12

Base EC2 commit: `a8f7a3932aa8a2fd0627e4457aa324905d0ca1e6`.
Equivalent local base: `c7c9a954df81581a7e3d24ae8d3117d0b32a0f5e`.
Both source trees: `15dd4e943c7d55ba5ab82d516e72ac5360e97290`.
The prior successful local closure remains valid; the contract and WASM are unchanged.

## Observed failure

Public case `ea02801246ad4bccbc464d5fa06153ad19e34af48094efba9bd6cd9d57b9b475`:

- Case creation `9bC865ipXudWWYY3DVL24tBoanUQ9bwVTiGHDGNi9EtR` FINAL.
- Buyer-1 funding `Ddskdq3isfJQBveLYrUXav6v1QBpK5APunu6hHLqcFvy` FINAL, job 13.
- Worker acceptance `8hGrWBy4v2G6hiLY9ZdFKGfzv1n4gk367Ub9AW7XzEur` FINAL.
- Alpha/gamma offer submissions rejected with NotEnoughBalance (~0.208 NEAR
  available vs 0.2190507636167905 required).
- Buyer-2 and beta journals record local queue expiry before dispatch. Both hashes
  were UNKNOWN_TRANSACTION on all three checked Testnet RPC endpoints.

User-supplied finalized snapshot `GRoQANRz2HaWXscPLJTpaj6fnMk1sSCHuqErJCvJLPNR`
at 19:52:48.903 UTC: job 13 Accepted, 7 UNIT open mandate, 1 UNIT worker reward,
no offers, 8 UNIT escrow, 302 UNIT claimable, no pending withdrawals. Final job
deadline 20:06:19 UTC. Storage reserves 383870000000000000000000 yocto.

## Changes

`r7_public_budget.cjs` budgets all actor calls and actual contract storage quotes.
NEP-642 buys receipt gas at a minimum 1e9 yocto/gas even when the block gas price
is 1e8; 200 Tgas therefore needs approximately 0.2 NEAR upfront plus fees/deposit.
Reference: https://github.com/near/nearcore/blob/master/docs/architecture/how/gas.md
Reserve 250 Tgas per call (actual attached gas is unchanged at 200 Tgas), signer
storage and 0.05 NEAR headroom. Refund timing is not assumed. Top-ups round to
0.05 NEAR; rejecting agents require no call budget. Keeper maintenance reserves
its two recovery calls in addition to its three future lifecycle calls.

`technical_closure.cjs` uses these full-run affordability checks. Its public
broker allows five independent signed submissions concurrently; the previous
single lane could expire the fifth request after a slow INCLUDED acknowledgement.
The default broker/sandbox still uses one signed-send slot. Send concurrency is
bounded; read/finality fallback remains separate, duplicate signed submissions
remain blocked, and no signed submission is retried or failed over.

`public_closure_repair.cjs` validates the exact failed journals and pinned contract
state. `--check` sends nothing. `--live` requires the specific approval environment
value and an elapsed finalized job deadline before any funding/recovery writes.
It journals each parent-to-actor transfer before signing and confirms exact native
Transfer recipient/amount and final receipts. Lost acknowledgement only triggers
reads of the same hash. It then releases job 13's 7 UNIT mandate and expires its
1 UNIT reward using the existing transaction guard. State is checked after each:
8+302 -> 1+309 -> 0+310, with unchanged storage and zero pending withdrawals.

Only after successful recovery and funded-balance verification are the original
failed run and launch intent atomically moved into the maintenance directory.
Nothing is deleted or relabeled successful. Existing maintenance journals block
another maintenance execution. The next lifecycle uses a fresh case/deadlines;
the original failed hashes are never resent. No new lifecycle starts automatically
inside maintenance. Native-wallet top-ups are separate from the rescue market's
19 economic transactions and 52 UNIT conservation equation.

On the supplied snapshot, eight top-ups total 3.9559542185150924 testNEAR from
the existing parent's 6.8282834258353861 testNEAR, leaving 2.8723292073202937 before
fees. The live command recalculates this; the snapshot is not a funding promise.

## Validation on this assistant host

```
node --test scripts/m3/public_closure_repair.test.cjs \
  scripts/m3/r7_13h_rpc_broker.test.cjs \
  scripts/m3/r7_13h_03_queue_stress.test.cjs \
  scripts/m3/r7_13v_20_broker_latency.test.cjs
21 tests passed, 0 failed; ~12.6 seconds.
```

Includes regression of the exact insufficient provider balance, buyer consent
storage, keeper maintenance gas, exact-case mismatch refusals, native transfer
recipient checking, post-ack loss with one signature/one send, and five slow
INCLUDED acknowledgements with concurrent signing reads and duplicate blocking.
The existing coalescing, serial default, queue overload, no-send-retry/failover
and 50-read slow-upstream stress also passed (p95 ~1495 ms).
JavaScript syntax checks and `git diff --check` passed.

No public transaction or complete lifecycle was executed from this host; direct
public RPC access timed out. No dependencies/toolchains, policies, contracts or
WASM were updated. Remaining acceptance is EC2 maintenance followed by one fresh
public 19-TX lifecycle and Python SDK audit. Any uncertain maintenance failure
must be reconciled using its saved journals, never automatically rerun.

## EC2 commands, in order

```
node scripts/m3/public_closure_repair.cjs --check
NMG_PUBLIC_REPAIR_APPROVAL=YES_RELEASE_8_UNITS_AND_FUND_EXISTING_TESTNET_ACTORS \
  node scripts/m3/public_closure_repair.cjs --live
node scripts/m3/technical_closure.cjs --check
node scripts/m3/technical_closure.cjs --live
```

Stop on failure and inspect the journals. Preserve output outside the repository.
The repair cannot resume an interrupted maintenance or change the expected case.
