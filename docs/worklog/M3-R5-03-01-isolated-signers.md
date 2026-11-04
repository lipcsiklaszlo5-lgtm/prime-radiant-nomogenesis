# M3-R5-03/01 — Isolated signer processes

Base commit: `f36fa7c`
Branch: `feat/m2-escrow`
Date: 2026-11-04
Status: local Sandbox PASS

## Verified

- Two distinct OS processes and private keypairs.
- Public-key-only account provisioning.
- Two successful signed rescue-case transactions.
- No actor private keys sent over IPC.
- Existing Rust contract unchanged.

## Transaction evidence

- `isolated0.test.near`: `C6LSaaW4vzKGraPvVr2zRwEBJs8UYTTXuDcxukJyuhz2`
- `isolated1.test.near`: `4vCp6mtEzF1ppVc7CH9Kc9tBninjWzSeg7NftGSo1y7L`

Evidence log:
`/workspaces/nomogenesis-r5-03-evidence.log`

## Limits

Both signers create cases only.
The Sandbox administrator is still trusted.
No independent operators or public testnet.

Next: R5-03/02 full role-specific signer integration.
