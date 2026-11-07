# R7-AUTO-03 — Reactive recovery financing

Environment: AWS Ubuntu, local NEAR Sandbox.

Source baseline: ff62c34.

The source process was stopped deliberately.
An independent watchdog detected the failure.
Buyer funding and provider offers ran only after
that detection, followed by consent, atomic award,
two authenticated backup components, settlement,
two worker completions, and excluded-job expiry.

Financial conservation: 48 = 39 + 9 = 3 + 45 = 1 + 47 = 0 + 48 UNIT.

Local execution log: `/tmp/nomogenesis-r7-auto03-reactive.log`.

Log SHA-256: `1b8cb69a448567312c942f4cbf1bc2dda96103b06fc0ece030606496818bfbf5`.

Limitations: same-host synthetic providers, controller-triggered failure and chain calls, preset deterministic buyer policies, accelerated Sandbox time, no public Testnet execution in this ticket. The historical WASM byte-parity discrepancy remains unresolved.
