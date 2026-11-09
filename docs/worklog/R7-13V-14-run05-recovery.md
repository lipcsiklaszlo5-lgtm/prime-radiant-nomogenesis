# R7-13V/14 — RUN05 economic recovery

Source: RUN05 partial lifecycle, eight finalized
public Testnet transactions.

Case:
dcde2487fb9463e1c64a86a8b1986241f5e432d302c115c676e9b324ad208da3

Before recovery:
- Rescue escrow: 52 UNIT
- Claimable: 114 UNIT
- Atomic award: absent
- Buyer consents: absent

Seven planned permissionless releases:
- Offers 7, 8, 9: 12 UNIT each
- Mandates for jobs 6, 7: 7 UNIT each
- Expiry of accepted jobs 6, 7: 1 UNIT each

Release prerequisites follow the deployed contract:
- Offer and mandate release: award_close reached
- Job expiry: each job's final_deadline reached

The live mode requires a separate environment approval,
clean Git tree, correct branch, correct contract WASM,
exact case state, keeper identity and available balance.

Transactions are signed individually, journaled before
broadcast, submitted only once, verified FINAL and
economically reconciled after every step.

No automatic restart or duplicate signed broadcast.

This checkpoint executes --check only.
No Testnet writes or private recovery journals are created.
