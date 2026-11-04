# M3-R6-03 — Public Testnet deployment

Date: 2026-11-04
Base commit: `c2bcc45`
Branch: `feat/m2-escrow`
Status: PASS

## Verified

- Deployed account: `nomogenesis-70e59593a3.testnet`
- Deployment transaction: `49NZ9qDKmfy42K9A7UKQDrDbQ9FWETFhijWQaUvcR5Qd`
- On-chain code hash: `Hc2soWJ38GHn4i2gVy87jexrBYEgquboFg6VJLUL56wQ`
- Contract WASM length: 539608 bytes
- Full deployed SHA-256: `f6b470b22a3c8c8e94187510e4de7e6123bf61913a2a16ccb7945d2abf1429f7`
- Two independent Testnet RPC verifications: PASS
- `m3_storage_quote` execution: PASS
- Private deployment key never committed

## Reproduction

Run `node scripts/m3/r6_testnet_deploy.cjs`
with the locally stored testnet credential file.
Existing nonempty deployments are never overwritten
by this script.

## Limitations

- Deployment is public, economic lifecycle is not yet
  verified on public Testnet.
- Testnet assets are not mainnet assets.
- No independent audit or production approval.
- Execution evidence retained outside Git:
  `/workspaces/nomogenesis-r6-03-deploy-evidence.log`

## Next

R6-04: funded Testnet economic smoke test.
