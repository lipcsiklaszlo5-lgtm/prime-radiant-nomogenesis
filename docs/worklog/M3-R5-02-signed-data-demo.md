# M3-R5-02 — Signed file-backed recovery

Base: d699580
Branch: feat/m2-escrow
Status: VERIFIED local Sandbox PASS, 2026-11-04

Goal:
Three independent buyers jointly fund one two-component
rescue. Two providers sign delivery of distinct CSV data.
Three independent worker accounts compute results and
claim rewards from the existing Rust contract.

No new Rust contract code or new dependencies.

Checks:
- provider-owned CSV payloads match committed roots;
- buyer caps individually below full rescue price;
- wrong provider and bad worker result rejected;
- three worker payouts and native withdrawal;
- 114-unit accounting conservation.

Limitations:
Synthetic CSV fixtures, local Sandbox identities.
Signers use distinct NEAR accounts in one harness process.
No public testnet, live external data or independent audit.

Next: inspect actual R5-02 execution and checkpoint.

## Verified execution

- Source base: `d699580`.
- Data engine: 5/5 Node tests PASS.
- One full signed local Sandbox lifecycle PASS.
- Three buyers, two bonded providers, three workers.
- CSV-calculated worker result: 632.
- All three worker completions PASS.
- Four intended negative contract calls rejected.
- Economic conservation: 114 units.
- Native transfer: 20 units.
- Transfer receipt: `G5Vuc19SxSWS3odphGEGm5xvSXavtHE8bmfaGdYc4eh8`.
- Callback receipt: `EmfGcyid5X6XYWW2apDhoUNJA6Px3VtYw6KQKj8vWpgr`.
- Evidence: `/workspaces/nomogenesis-r5-02-evidence.log`.
- Compatible WASM unchanged from R4-05.
- No separate OS signer processes or public testnet claim.

## Remaining limits

Distinct local NEAR accounts are not proof of
independently operated signer processes.
The CSV data is synthetic.
No production approval or independent security audit.

Next: R5-03 independent signer processes.
