# R7-AUTO-04 — Provider default matrix

Environment: AWS Ubuntu, local NEAR Sandbox.

Starting commit: `8eb7784`.

Executed the three existing provider-default integration scenarios against the locally built feature-gated V2 contract.

| Scenario | Provider outcomes | Log SHA-256 |
|---|---|---|
| first-default | Defaulted / Proven | `993826d791ff186e35d76f6fef3bc9064a78bb4ba6071e0253a8793bc27007db` |
| second-default | Proven / Defaulted | `d38612a93e743145791d51a0c63d4fcfd0117416fc1d7385620d998f708ebfba` |
| both-default | Defaulted / Defaulted | `ef10ef12757e3214ed693a2dd66fbc94aa8450a3da3d4ed7f96184ef14e715f3` |

Verified: deadline enforcement, Merkle rejection, provider bond forfeiture and release, sponsor compensation, replay protection, worker reward expiry, and 48 UNIT liability conservation.

These are accounting credits, not native withdrawals.

Limitations: synthetic Sandbox data and accounts; not an autonomous default-monitor demonstration. No public Testnet execution in this ticket. Historical WASM byte parity remains unresolved. No independent security audit.
