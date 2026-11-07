# R7-VERIFY-02 — Public bytecode Sandbox replay

Network origin: NEAR public Testnet.
Execution environment: local NEAR Sandbox on AWS.

Public contract: `r7v2.nomogenesis-70e59593a3.testnet`.

Two independent Testnet RPC endpoints returned identical deployed bytecode.

WASM SHA-256: `2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e`.

The exact downloaded bytecode passed the complete reactive funding and recovery Sandbox scenario.
Three buyer decisions, two consents, atomic award, two provider proofs, settlement, two worker completions and 48 UNIT liability conservation were verified.

Watchdog observation: 503 ms since last healthy.
Accepted proofs: 41,227 ms local elapsed time.
Accelerated Sandbox chain time: 301 seconds.

Execution log: `docs/evidence/R7-VERIFY-02-sandbox.log`.
Log SHA-256: `00dd8c495b028e2814e2e562b992f768db25264962c467a64f955f2dd5d0536f`.

Limitations: no public transactions were sent during this replay. The source failure was controller-triggered. Providers were synthetic and ran on the same host. AWS build reproducibility remains unresolved. No independent security audit.
