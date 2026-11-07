# R7-SDK-01 — Recovery Intent adapter

Base commit: `2562984`.

## Purpose

Provide a small reusable interface for an external
NEAR buyer agent to fund an already registered
Nomogenesis rescue case.

## Implemented interface

`sdk/recovery_intent.cjs` exports `RecoveryIntent`.

Inputs include case ID, designated worker, rescue cap,
worker reward, result threshold and final deadline.

The adapter generates the existing on-chain
`create_funded_rescue_job` input, requests the real
storage quote, computes the exact required deposit,
and delegates the transaction to the caller's signer.

It does not store or manufacture signing keys.

## Tests

`node --test sdk/recovery_intent.test.cjs`

Four cases cover contract ABI compatibility,
deposit calculation, input limits, and rejection
before signing when the storage quote is invalid.

## Limitations

This is an initial CommonJS adapter, not a published
or independently distributed package.

It assumes an existing funded-market case descriptor
and a supplied NEAR-compatible signer.

It does not yet implement registration, dependency
monitoring, consent, provider discovery or settlement.

The unit tests use adapter doubles. A real external
agent Sandbox integration remains the next gate.

No public Testnet execution occurs in this ticket.
Historical WASM byte parity remains unresolved.
