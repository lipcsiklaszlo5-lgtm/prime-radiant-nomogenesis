# R7-AUTO-05A — Event-driven agent formation

Base: `b45bb78`.
Network: offline localhost event transport.

## Verified architecture

Seven independent operating-system processes
start before an outage event exists.

Each process reads its own fixed economic policy,
watches the local event channel and independently
issues a signed accept/reject decision after the
event is published.

The event relay validates signatures, session
lifetime, participant uniqueness and replay
protection before admitting decisions.

The existing Genesis engine reconstructs the
market from independently signed declarations.

## Expected economic result

- Buyers 1 and 2 voluntarily participate.
- Buyer 3 refuses.
- Provider delta refuses below cost floor.
- Competitive provider pair: offers 3 and 2.
- Joint rescue price: 11 abstract units.
- Allocations: 6 and 5 abstract units.
- Neither selected buyer could pay alone.

## Negative controls

- No agent decision before the event.
- Duplicate signed event rejected.
- Modified signed declaration rejected.
- Historical signature verifier reproduces
  the newly generated market report.

## Limitations

The event is injected by the controller rather
than emitted by the existing watchdog.

The relay is centralized localhost infrastructure.
Agents remain synthetic and operator-controlled.
Signing keys are ephemeral, not NEAR identities.

The Genesis selection is off-chain.
No actual funded job or provider offer is
submitted to NEAR in this ticket.

Next gate: connect the independent event-driven
decisions to separate-agent Sandbox transactions.

Free-rider incentives and access exclusion remain
open economic-design problems.

Evidence:
`docs/evidence/R7-AUTO-05A-event-driven.json`.
