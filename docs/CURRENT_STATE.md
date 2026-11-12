# Nomogenesis current state — 2026-11-12

The reviewer entry point is the repository root `README.md`, followed by
`HACKATHON.md`. The public Testnet V2 lifecycle and a clean-clone local
Sandbox reproduction have both passed. The core source is frozen at
`b98f389dd12c5bf2819c317082ac21f5256189c9`, tagged
`technical-closure-testnet-2026-11-12`.

The public case is
`5b8530acbd28c3e39a90259e41e50c19fc1792798ab9522249fb0b9d7ac6f815`.
Its 19 transaction records, final SDK audit and exact V2 WASM identity are
in `evidence/technical-closure-testnet-2026-11-12/`. The separate Sandbox
run reproduced the 19 economic steps from a clean clone without private
Testnet keys, testNEAR or an external `NODE_PATH`.

For reviewers: `npm ci && npm run verify`, then optionally
`npm run verify:evidence`. The former runs a new local blockchain lifecycle;
the latter checks saved public receipts offline. Neither sends public
Testnet transactions.

The demonstration uses controlled data and one operator's separate signers.
It has no general external-repair oracle, independent security audit,
independent validating PoS node, or mainnet deployment. Historical worklogs
and the previous long status page remain in `archive/`; their older
“current” labels and next-ticket instructions have been superseded.
