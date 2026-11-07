# R7-AUTO-05B/01 — Agent-driven on-chain market

Base commit: `c61181b`.

Execution: AWS Ubuntu, local NEAR Sandbox.
Contract bytes: exact public V2 Testnet WASM.

Seven separate agents received only the common
outage event and their own fixed local policies.
Each actor generated its own NEAR signing key.
The controller did not sign buyer/provider actions.

Observed: two funded jobs, three bonded provider
offers, and two independent policy refusals.

The admissible provider pairs cost 11 and 12
abstract UNIT. Provider-gamma plus provider-beta
is the cheapest valid pair.

Escrow before execution: 0 UNIT.
Escrow after: 52 UNIT (16 buyer principal and
36 provider bonds). Storage accounted separately.

Log: `/tmp/nomogenesis-r7-auto05b01-market.log`.
Log SHA-256: `d4fbac1ff38e44707425a5fa9c4b7c1308aae432e0126283ff5a587e37ea9526`.

Limitations: synthetic policies; same-host processes;
controller-injected outage; centralized event relay;
case and test accounts created by the controller.
No worker acceptance, buyer consent, atomic award,
provider delivery, settlement or withdrawals in
this ticket. No public Testnet transactions.
The dependency deadline constraint remains.
