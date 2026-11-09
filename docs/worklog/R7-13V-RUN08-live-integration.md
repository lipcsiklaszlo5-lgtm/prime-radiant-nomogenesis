# R7-13V — RUN08 live integration

Base: 660c8c73cbf993a9327cd96863b44117e5941756

The original RUN07 launcher remains unchanged.

RUN08 uses:
- Its own exclusive, irreversible launch intent and transaction journals.
- RUN07 sealed seven-transaction recovery evidence.
- A fresh Testnet contract gate with the 270 UNIT claimable baseline.
- The existing V2 coordinator, buyers, providers, keeper and workers.
- Dedicated transaction finality RPCs, isolated from ordinary reads.
- Explicit RUN08-specific live approval.
- No automatic signed-transaction retries.

Validation in this integration run:
- Node syntax checks PASS.
- RUN08/RUN07 live safety regression tests PASS.
- RUN08 read-only integration check PASS.

No live RUN08 transactions executed by this integration.

Remaining requirement: explicitly authorized public Testnet
execution and actual atomic award, proof, settlement and
completion evidence. No mainnet or production guarantee.
