# R7-12 — Negative Lifecycle Evidence

This folder records four verified local test scenarios:

1. One selected provider withholds its recovery proof.
2. Both selected providers withhold their recovery proofs.
3. Adversarial authorization, Merkle, deadline and replay tests.
4. Watchdog ignores an isolated HTTP 503 but detects sustained failures.

The first three logs come from the clean R7-11 checkpoint
`21cafdf67df7eaaf47f9e1cbd83216eb886763d7`,
running the deployed V2 WASM retrieved and verified from
`nmg-r7v2-0b9a0eff20.testnet`.

The watchdog scenario runs on local loopback HTTP and tests
arming, a transient error, recovery and sustained failure.

All scenarios run locally. Sandbox transaction identifiers
are **not** public NEAR Testnet transaction evidence.

The forfeiture outcomes and terminal conservation assertions
are performed by the existing on-chain Sandbox test programs.
`summary.json` captures selected assertion markers and hashes.

The historical adversarial test prints an outdated limitation
about Testnet deployment. V2 is deployed to public Testnet,
but the **negative tests in this folder remain local**.

The source-built WASM has a different SHA-256 from the
deployed WASM. No source-to-deployment byte parity is claimed.

No independent production security audit is claimed.
