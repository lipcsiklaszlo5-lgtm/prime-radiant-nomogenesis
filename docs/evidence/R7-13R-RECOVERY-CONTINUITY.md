# R7-13R — Finalized Testnet escrow recovery

## Result

**PASS — seven separately signed, finalized recovery transactions.**
The interrupted RUN03 had eight earlier confirmed transactions but no atomic award.

| Global contract metric | Before | After |
|---|---:|---:|
| Rescue escrow | 52 UNIT | 0 UNIT |
| Claimable total | 34 UNIT | 86 UNIT |

Conservation: **52 UNIT escrow reduction = 52 UNIT new claimable credits.**
These credits are not wallet withdrawals.

## Recovery receipts

| # | Method | Released UNIT | Public transaction |
|---|---|---:|---|
| 1 | `release_open_rescue_offer` (3) | 12 | [View TX](https://testnet.nearblocks.io/txns/EFB79ixcF6tQX4bZfd8rhCQMAHeonxytvtAUw6bXcagD) |
| 2 | `release_open_rescue_offer` (4) | 12 | [View TX](https://testnet.nearblocks.io/txns/C4wpuDDGSxtHYbo4SRs9LTsq94CyKzwEoDfAVcAw5aEC) |
| 3 | `release_open_rescue_offer` (5) | 12 | [View TX](https://testnet.nearblocks.io/txns/QWZkS6MuMSeqe23bEQNjMkfhhwLVNZFs73WRxg5mpkv) |
| 4 | `release_expired_rescue_mandate` (2) | 7 | [View TX](https://testnet.nearblocks.io/txns/5wipjVLHn3AsBXpZkabAQoyiJNs8Ly3t5FFxcGsfqzX1) |
| 5 | `release_expired_rescue_mandate` (3) | 7 | [View TX](https://testnet.nearblocks.io/txns/B3xxvgNMfeWmeERgt3JXh79PtJwBcpaELmupGP4uZ5dF) |
| 6 | `expire_rescue_job` (2) | 1 | [View TX](https://testnet.nearblocks.io/txns/AyQFcCGqPVunhb8vwNz943E7BLcbfxETmSuWZunwmFsC) |
| 7 | `expire_rescue_job` (3) | 1 | [View TX](https://testnet.nearblocks.io/txns/6VuBLBNXD3fwAvpLDGtiMrUbnp2rMf2eoSqSaxgb8qDP) |

## Verification

- Case: `f884628615029609fdd48c43ddcc3c9128c1595c8555545cd9c0b0a302ba68a5`
- Contract: `nmg-r7v2-0b9a0eff20.testnet`
- Last final audit block: `Hguucc6Gbs8myCAuzAz9deRJ9Fsid3Jt4wVHMEMZDroE`
- Each transaction has an individual finalized-state witness.
- The final audit may use a later finalized block than the last transaction witness.
- Raw private journals and keys remain on the EC2 host.
- Public evidence: `docs/evidence/R7-13R-public-recovery.json`.

## Boundary

This proves safe expiry/release of a failed rescue case, **not** a successful
atomic award, provider proof, settlement, or worker completion in RUN03.
