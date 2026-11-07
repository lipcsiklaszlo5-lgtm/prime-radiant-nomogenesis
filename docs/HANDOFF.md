## CURRENT — R7-ADV-01C Merkle attack controls

Two selected providers independently attempted
tampered payloads, noncanonical metadata siblings
and replays. All rejected, valid submissions
accepted, successful settlement conserved
52 UNIT. Evidence: `docs/worklog/R7-ADV-01C-merkle.md`.
Next: public Testnet reproduction and restart
durability of agent signing identities.

## CURRENT — R7-ADV-01B dual-provider default

Both selected providers withheld proofs.
Premature settlement rejected. Keeper closed
the default after the recovery deadline;
both worker rewards expired. Terminal economic
conservation: 52 = 0 + 52 UNIT.
Evidence: `docs/worklog/R7-ADV-01B-dual-default.md`.
Next: forged-proof and agent restart benchmarks.

## CURRENT — R7-ADV-01A provider default

One selected provider withheld proof. The
other proved delivery. Keeper default settlement
and two worker expiries preserved 52 UNIT.
Evidence: `docs/worklog/R7-ADV-01A-single-default.md`.
Next: two-provider default and forged proofs.

## CURRENT — R7-AUTO-05B/03 full settlement

Ten local agent signers completed the lifecycle:
funding, competitive bids, worker acceptance,
buyer consents, atomic award, provider proofs,
bond release, settlement and worker completion.
Final liabilities: 52 = 0 + 52 UNIT.
16 unique Sandbox transaction IDs verified.
Evidence: `docs/worklog/R7-AUTO-05B-03-settlement.md`.
Next: adversarial/default benchmark.
Public Testnet unchanged.

## CURRENT — R7-AUTO-05B/02 autonomous award

Ten separately signing local agent processes
completed market funding, bonded offers,
worker acceptance, two buyer consents and
the permissionless atomic award in NEAR Sandbox.
Financial conservation: 52 = 47 + 5 UNIT.
Evidence: `docs/worklog/R7-AUTO-05B-02-atomic-award.md`.
Next: autonomous proofs and settlement.
Public Testnet unchanged.

## CURRENT — R7-AUTO-05B/01 on-chain agent market

Seven separate actors autonomously decided after
a local outage event. Two NEAR Sandbox buyer funds,
three bonded provider bids, two refusals. Cheapest
eligible provider pair costs 11 UNIT, independently
checked from contract state. No award yet.
Evidence: `docs/worklog/R7-AUTO-05B-01-onchain-market.md`.

## CURRENT — R7-VERIFY-02 exact public-bytecode replay

Two public Testnet RPCs confirmed the deployed V2 bytecode. The exact code passed the complete reactive recovery lifecycle in local Sandbox.
Evidence: `docs/worklog/R7-VERIFY-02-public-bytecode.md`.
Next: fresh public Testnet lifecycle with verified signers. No new public transactions yet.

## CURRENT — R7-SDK-02 external Sandbox consumer

Separate Node.js buyer with process-local signing
key successfully funded a rescue job via the
RecoveryIntent SDK on local NEAR Sandbox.
Over-cap and invalid inputs rejected before signing.
Evidence: `docs/worklog/R7-SDK-02-external-consumer.md`.
Public Testnet unchanged; historical WASM byte
parity unresolved.

## CURRENT — R7-SDK-01 Recovery Intent adapter

Initial CommonJS adapter for a third-party buyer to fund an existing Nomogenesis rescue case. Unit tests cover input safety, commitment ABI, deposit calculation and signing delegation. Independent Sandbox integration not yet run.
Evidence: `docs/worklog/R7-SDK-01-recovery-intent.md`.
No new Testnet transactions. Historical WASM byte parity unresolved.

## CURRENT — R7-AUTO-04 provider-default matrix

AWS local Sandbox: three provider-default scenarios PASS, if verified by the R7-AUTO-04 gate. Provider forfeiture, sponsor compensation, replay rejection and 48 UNIT accounting conservation.
Evidence: `docs/worklog/R7-AUTO-04-provider-defaults.md`.
No new Testnet transactions. WASM historical byte parity unresolved.

# Élő munkamenet-átadás — minden fejlesztési session végén frissítendő

## CURRENT — R7-DEMO-03/04B backup-driven recovery VERIFIED

Date: 2026-11-06.
Branch: `feat/r7-demo-03-process-outage`.
Full local V2 Sandbox recovery passed with a genuinely
terminated source process and two separate backup
provider processes. Backup bytes were requested only
after the atomic award. Two buyer consents, one refusal,
two Merkle-verified components, two completed jobs and
48 UNIT financial conservation passed.

Wall time to both accepted proofs: 26.122 seconds.
Evidence: `docs/worklog/R7-DEMO-03-backup-driven-recovery.md`.

Limits: same-host synthetic backups, request-driven
observer, no public V2 Testnet or native withdrawal.

Next single ticket: R7-TESTNET-01.

## HISTORICAL — R7-DEMO-03/02 real process outage VERIFIED

Date: 2026-11-06.
Branch: `feat/r7-demo-03-process-outage`.
The CSV source ran as a separate process, exited via
SIGTERM, and a separate HTTP observer saw ECONNREFUSED.
The full consent-bound V2 Sandbox lifecycle then passed:
two approvals, one refusal, two provider proofs, two
completed jobs and 48 UNIT financial conservation.

Evidence: `docs/worklog/R7-DEMO-03-process-outage.md`.

Recovery payloads are still precomputed local fixtures;
backup provider independence is not yet demonstrated.
No V2 public Testnet deployment is claimed.

Next: R7-DEMO-03/04 independent backup data providers.

## HISTORICAL — R7-REPO-01 clean-checkout (VERIFIED)

Date: 2026-11-06.
Branch: `chore/r7-repo-01-entrypoint`, implementation `6604fb3`.
Clean tracked-source clone: PASS; 210 base Rust + 21 V2 Rust
+ 5 CSV tests PASS; identical V2 WASM; local complete rescue
Sandbox PASS; financial ledger 48 UNIT conserved.
Evidence: `docs/worklog/R7-REPO-01-clean-checkout.md`.
V2 public Testnet and separate-process source failure remain open.
Next single action: reviewed `main` fast-forward.

## HISTORICAL — R7-DEMO-02 recovery lifecycle (VERIFIED)

Date: 2026-11-06. Branch: `feat/r7-demo-02-recovery`.
Base: `1103b7c56db4c83afcce2416be2ca9004b3c45e0`.
Codespaces: local HTTP 200 -> 503; three buyer processes; two exact
consents, one refusal; atomic V2 award; two Merkle-verified provider
payloads; two completed jobs; terminal settlement and excluded-job
expiry. Sandbox exit 0. Simulated chain recovery: 286 seconds.
Final liability ledger: `0 + 48 = 48` UNIT.
Log SHA-256: `db6b29dd...aaa89e34`.
Worklog: `docs/worklog/R7-DEMO-02-recovery-lifecycle.md`.
No real external failure, native withdrawal or V2 public Testnet
execution is claimed. Next single ticket: `R7-REPO-01` entry point,
clean-checkout gate and reviewed `main` update.

## HISTORICAL — R7-DEMO-01 isolated V2 buyer agents (VERIFIED)

Date: 2026-11-06. Branch: `feat/r7-demo-01-buyers`.
Base: `b98068287ebb2b4e6308294c91d6b41b8d457444`.
Three buyer processes, distinct local keys, policy-bound consent and
atomic V2 award are being reproduced on this branch. The source
feature worktree is preserved. Codespaces local Sandbox exit 0 with three distinct buyer processes,
two accepted 6 UNIT payments, one refusal, V2 atomic award,
rejected-buyer refund and checked negative cases. Liabilities:
`48 = 39 + 9 = 38 + 10` UNIT. V2 WASM SHA-256 `2730e3d0...b9e`;
log SHA-256 `4b83b674...c0649`. No failure-to-recovery loop or
public V2 Testnet run. Worklog: `docs/worklog/R7-DEMO-01-buyer-agents.md`.
Next single ticket: `R7-DEMO-02` complete measurable recovery loop.

## HISTORICAL — R7-FIX-01 provider-scoped slot parity (VERIFIED)

Date: 2026-11-06. Branch: `fix/r7-fix-01-provider-slot`.
Base: `2778cdd202f549e93740567b994b0b137644794e`.
Scope: align offline Python Genesis and its independent verifier, Rust
certificate recomputation, JS benchmark, and Python competition witness
with the existing on-chain `provider|slot_id` capacity key. Add explicit
same-name/different-provider positive cases and same-provider negative
cases. Do not modify the contract or historical evidence fixtures.
The source feature worktree's untracked files are not included.
Codespaces checks: 93 Python tests PASS; 48 Node tests PASS;
`cargo test --locked --test r7_genesis_certificate` exit 0.
Full Rust suite, Sandbox, WASM and public Testnet were not rerun.
Worklog: `docs/worklog/R7-FIX-01-provider-slot.md`.
Next single ticket: `R7-REPO-01` branch and untracked-file inventory,
then a reviewable plan for updating the default branch.

## HISTORICAL — R7-DOC-02 documentation reconciliation (VERIFIED)

Date: 2026-11-06.
Branch: `docs/r7-continuity-5455ee7`.
Base: `5455ee779aa2c66d98f0f93175176034e969a4ec`.

Scope: reconcile the new-chat entry points with the integrated V2
funded-consent and atomic coalition checkpoint. Preserve the original
feature branch and its untracked files. The earlier R7-DOC-01 patch was
based on `3901662` and must not be applied unchanged here.

The integrated V2 result is reported in
`docs/worklog/R7-06E-03B-06-checkpoint.md`; verify its actual code and
tests before claiming a new PASS. No V2 public Testnet deployment or
consent-bond refund is claimed. Documentation checks: 90 Python tests PASS; 47 Node tests PASS; Markdown references and diff check PASS. Rust/Sandbox were not rerun for this documentation ticket. No code or Testnet change.
Worklog: `docs/worklog/R7-DOC-02-continuity.md`.
Next single code ticket: `R7-FIX-01` provider-scoped slot parity.


## HISTORICAL — R7-06E/03A SANDBOX VERIFIED

Date: 2026-11-06.
Branch: `feat/r7-06e-03-auth`.
Base: `fdb7098`.

- Isolated NEAR V2 authorization registry implemented.
- Eight Rust tests PASS; strict Clippy PASS.
- Original M3 Rust library: 210 tests PASS.
- WASM build and optimization PASS.
- Local NEAR Sandbox authenticated caller checks PASS.
- Two distinct buyer accounts registered consent.
- Forgery, insufficient deposit, unauthorized revoke
  and consumed nonce replay rejected without observed
  persistent state change.
- Measured net storage growth: 689 bytes.
- Retained registration bonds: 0.12288 NEAR.
- Old M3 contract and public Testnet unchanged.
- V2 does NOT yet bind funded M3 jobs or execute
  a selected-coalition economic award.
- No new Testnet transaction or independent audit.
- Evidence and reproduction:
  `docs/worklog/M3-R7-06E-03A-auth-sandbox.md`.
- Next: R7-06E/03B atomic funded-M3 integration.


## HISTORICAL — R7-06 AUTONOMOUS FORMATION

- Base: `3237164`, branch `feat/r7-genesis-certificate`.
- Preserve M2/M3/R6/R7 and both complete Testnet cases.
- R6: 17 verified signed transactions.
- R7-05C: 17 verified signed transactions.
- Genesis Certificate V1: independently verified OFFCHAIN.
- Current M3 contract: all eligible accepted sponsors enrolled.
- Eight prior SDK retry hashes remain inconclusive.
- Full cross-chat history:
  `docs/NOMOGENESIS_SESSION_STATE.md`.
- Full engineering plan:
  `docs/M3_R7_06_ECONOMIC_FORMATION_PLAN.md`.
- R7-06A: offline policy-driven formation and negative tests.
- No new NEAR transactions or autonomous owner claims.
- R7-06B/00 seven separate signed policy processes completed.
- Signed decision transcript and economic proposal archived.
- Buyer refusal and provider cost-floor refusal demonstrated.
- Ed25519, session nonce, expiry and replay tests completed.
- No independent real-world ownership or NEAR authorization.
- Report: docs/evidence/R7-06B-synthetic-signed-decisions.json.
- R7-06C/00 pair-by-pair competition audit recorded.
- Signed market: 4 complete pairs, 2 eligible.
- Rejected 9/10 UNIT pairs due to seller cost floor.
- Valid 11 UNIT pair defeats valid 12 UNIT pair.
- Negative supplier, slot, deadline and bond scenarios.
- Independent clearing witness reconstructed.
- Evidence: docs/evidence/R7-06C-competition-audit.json.
- No new Testnet activity or deployed contract change.
- R7-06D/00 economic counterfactual evidence completed.
- Joint rescue wins one synthetic scenario.
- Standby and spot win distinct negative scenarios.
- Buyer/supplier surplus and capital requirements separated.
- Three-buyer free-rider counterexample demonstrated
  under non-excludable shared-dependency assumption.
- No real market advantage or coalition stability claim.
- Evidence: docs/evidence/R7-06D-economic-counterfactuals.json.
- R7-06E/00 contract authorization audit PASS.
- Current M3 award includes all eligible accepted mandates.
- Offline selected subset can diverge from on-chain result.
- Existing buyer mandate revocation requires real NEAR action.
- Worker completion does not check sponsor allocation.
- Non-excludable free-riding cannot be fixed by ledger alone.
- Evidence: docs/evidence/R7-06E-authorization-boundary.json.
- Design: docs/M3_R7_06E_AUTHORIZATION_SPEC.md.
- R7-06E/01 isolated Rust sponsor-subset preflight.
- Reuses original M3 capped-equal allocation logic.
- Checks model approvals, refund and bond conservation.
- Existing NEAR contract/ABI unchanged.
- Approval records still lack real NEAR signature verification.
- Excluded workers and non-excludable benefits remain open.
- R7-06E/02 model-only Rust authorization state machine.
- Plan-bound buyer consent, revocation and replay rejection.
- Staged failure-before-commit economic transitions.
- Caller identity still supplied by test harness.
- NO persistent NEAR authorization or Sandbox PASS yet.
- Design: docs/M3_R7_06E_ONCHAIN_DESIGN.md.
- Next: R7-06E/03 real NEAR authorization adapter
  and Sandbox atomic rollback verification.


## Active M3-R7-02 — Genesis Certificate

Decision: 2026-11-05
Branch: `feat/r7-genesis-certificate`

- Public novelty review completed.
- Pooled buying and minimal winning coalitions
  have prior art; no world-first claim.
- Differentiating hypothesis: exhaustive bounded
  coalition certificate + bonded recovery + NEAR
  economic settlement evidence.
- Full normative specification:
  `docs/M3_R7_GENESIS_CERTIFICATE_SPEC.md`.
- Preserve M3 contract, R6 Testnet and R7 benchmark.
- NEAR Swarm-for-Hire alignment addendum recorded.
- Preserve Genesis mathematics and certificate scope.
- Demonstrate independent agent decision policies.
- No unimplemented Intents/NEAR AI claims.
- Next single task: R7-02A implementation.
- Status: R7-02A PYTHON SCAFFOLD VERIFIED.
- Exhaustive bounded coalition enumeration.
- Minimal feasible coalitions identified.
- Deterministic capped-equal allocation.
- Complete bonded provider-pair selection.
- Separate recomputation verifier.
- 5 targeted Python tests PASS.
- Existing R7 benchmark regression executed.
- Offline synthetic reference certificate.
- Input normalization and adversarial validation
  are not yet complete.
- No live NEAR state binding.
- R7-02A/02 strict input hardening complete.
- Canonical schema, uint64/uint128 boundaries.
- Reject duplicate IDs and unexpected input fields.
- Pair-price overflow is filtered.
- JSON type confusion attacks rejected.
- 16 Python tests and 9 Node benchmark tests PASS.
- Certificate remains OFFCHAIN and synthetic.
- R7-02B/00 public transaction probe completed.
- 10 transaction arguments reconstructed.
- Two public endpoint responses compared.
- dRPC returned HTTP 403; legacy NEAR endpoint used.
- Endpoint infrastructure independence not claimed.
- Historical complete-market snapshot not yet proven.
- R7-02B/01 transaction-derived witness generated.
- Buyer caps reconstructed from signed funding calls.
- Fees and bonds reconstructed from signed offers.
- Genesis Certificate calculated from those inputs.
- Ten public transaction references retained.
- Complete pre-award market state NOT proven.
- R7-02B/02 archive market probe PASS.
- 3 accepted jobs, 3 open funded mandates.
- 2 registered open bonded provider offers.
- R7-02B/03 historical award transition PASS.
- Buyer allocations and capacity locks reconciled.
- Escrow and claimable deltas verified.
- No local Merkle state proof or independent actors.
- R7-02C/00 Python/Rust allocation parity PASS.
- 185 deterministic differential vectors.
- Real R6 Testnet allocation included.
- Large u128 and saturated caps included.
- Rust differential tests: 2 PASS.
- Full Rust Genesis verifier NOT yet implemented.
- R7-02C/01 public Genesis replay PASS.
- Fresh public transaction and archive state replay.
- Committed witness and award evidence matched.
- Archive RPC 429 recovery and pacing enabled.
- Replay runs in a temporary evidence workspace.
- Full Rust certificate verifier still pending.
- R7-05A Genesis coalition explorer integrated.
- Existing white jury demo preserved.
- All 7 reference coalitions visible.
- Interactive 1..6 buyer coalition enumeration.
- Recorded proof and award evidence linked.
- Synthetic what-if separate from Testnet evidence.
- Full Rust certificate verifier still pending.
- R7-02C/02 independent Rust certificate verifier PASS.
- Complete offer-pair and coalition recomputation.
- Python/Rust Genesis SHA-256 consistency verified.
- Six alternative Python certificates cross-checked.
- Rehashed forged certificate outcomes rejected.
- Serde derive path repaired without new dependencies.
- NEAR economic contract unchanged.
- R7-05B/00 fresh public GitHub checkout PASS.
- Deterministic HTML and evidence rebuild PASS.
- Full Rust library and certificate tests PASS.
- Python and JavaScript regressions PASS.
- Live R7 transaction and archival replay PASS.
- Live R6 full economic lifecycle rechecked.
- Public Testnet WASM and native payout verified.
- No new chain writes, no wallet or private keys.
- Historical RPC evidence is not a Merkle proof.
- R7-05C/00 new Testnet scenario preflight PASS.
- 7+7+7 caps; 12 UNIT price.
- Three minimal coalitions verified off-chain.
- Nine funded signers and access keys checked.
- Provider slots and existing economic baseline checked.
- No new signed transactions yet.
- R7-05C/01 second full signed Testnet lifecycle PASS.
- New case, 3 buyer jobs, 3 worker acceptances, 2 bonded offers.
- Award, two CSV proofs, settlement, 3 worker completions.
- Native 20 UNIT transfer and callback verified.
- 17 public transaction hashes retained.
- 3 minimal coalitions certified OFFCHAIN.
- On-chain full 3-buyer allocation: 4+4+4 UNIT.
- Baseline 30 escrow / 94 claimable preserved.
- Final 30 escrow / 194 claimable after 20 payout.
- R7-05C/03 independent public keyless verifier PASS.
- All 17 signed Testnet transactions rechecked.
- Signed arguments and SHA-256 hashes validated.
- CSV and worker computations independently repeated.
- Full Genesis Certificate reconstructed in Python.
- Direct JSON loading preserves u128 monetary integers.
- Final contract accounting and native payout checked.
- No private keys or new Testnet transactions required.
- Eight SDK retry hashes remain inconclusive.
- R7-05D/01 two Testnet cases integrated in jury demo.
- 5+5+5 case: one minimal coalition.
- 7+7+7 case: three minimal coalitions.
- Both have 17 recorded Testnet transactions.
- Both awarded all three eligible sponsors 4+4+4.
- Public evidence links and read-only commands shown.
- Eight unresolved SDK retry hashes disclosed.
- R7-05E/00 jury-first README completed.
- Earlier R6 status corrected as historical.
- November 2026 Genesis contribution distinguished.
- Dynamic minimal coalition counters repaired.
- Both recorded Testnet cases preserved.
- No deployed contract or economic evidence modified.
- Next: final clean checkout and submission preparation.

## Active M3-R7-01 — Economic Emergence Benchmark

Date: 2026-11-05
Base commit: `9baaee9`
Branch: `feat/r7-economic-emergence`

- New strategic direction approved.
- Platform foundation, not generic escrow.
- Internal aspirational readiness target: 98/100.
- Primary NEAR alignment: AI Swarms.
- Four pillars: economic emergence, autonomous
  decisions, competitive clearing, adversarial safety.
- Normative objective: `docs/M3_R7_NORTH_STAR.md`.
- Preserve the verified R6 Testnet evidence and white UI.
- First implementation: deterministic economic comparison.
- No unverified economic superiority claims.
- Status: R7-01 EXPLORATORY IMPLEMENTATION PASS.
- Nine focused regression/negative tests.
- Four deterministic synthetic scenarios.
- Includes cases where reserve and spot beat Nomogenesis.
- Pure local model; not chain execution.
- Source: `scripts/m3/r7_emergence_benchmark.cjs`.
- Tests: `scripts/m3/r7_emergence_benchmark.test.cjs`.
- Output: `/workspaces/nomogenesis-r7-01-synthetic.json`.
- Limitations: hypothetical values and fixed outcomes.
- Next: R7-01B parameter sensitivity and fairness audit.

## Current M3-R6-06A — VERIFIED GITHUB CHECKPOINT

Date: 2026-11-04
Branch: `feat/m2-escrow`
Base: `dd5f1ee`
Latest verified commit: `af372d1`

### Implemented

- Apple-like white minimalist interface.
- User-approved visual design direction.
- Interactive rescue-price slider.
- Editable buyer funding caps.
- Add/remove buyers, maximum six.
- Deterministic capped-equal allocation.
- Default example: three buyers, 5 UNIT caps each.
- Rescue price: 12 UNIT.
- Result: 4 UNIT per buyer, 1 UNIT unused per buyer.
- Fundability changes when price/caps change.
- All 17 verified public Testnet transactions linked.
- Synthetic simulator explicitly separated from
  historical on-chain evidence.
- No wallet, API key or private signer required.

### Files committed

- `demo/nomogenesis_jury_demo.html`
- `demo/nomogenesis_jury_demo.template.html`
- `scripts/m3/r6_build_demo.cjs`
- `scripts/m3/r6_demo.test.cjs`
- `docs/HANDOFF.md`
- `docs/STATUS.md`
- `README.md`

### Verification

- `node scripts/m3/r6_build_demo.cjs` PASS.
- `node --test scripts/m3/r6_demo.test.cjs`: 3/3 PASS.
- HTML, manifest, allocation behavior verified.
- Prior R6-05 public evidence: two RPCs, 17 TX,
  WASM identity, native payout receipt PASS.
- Testnet economic code unchanged.
- GitHub push confirmed at commit `af372d1`.

### Preserved project evidence

- Public manifest: `docs/evidence/R6-05-public.json`.
- Keyless verifier: `scripts/m3/r6_verify_public.cjs`.
- Contract: `nomogenesis-70e59593a3.testnet`.
- New consortium: 114 UNIT accounted for.
- Native withdrawal: 20 UNIT.
- Previous R6-04 escrow: 30 UNIT remains held.
- No mainnet deployment or independent security audit.

### Deliberately untracked local files

- `NOMOGENESIS_UI_Refresh.zip`
- `sandbox/real_low_margin_audit.cjs`
- `scripts/m3/__pycache__/`
- `scripts/m3/r6_demo_allocation.cjs`

These are NOT included in the GitHub checkpoint.
Do not delete or stage them without inspection.

### Next single task

M3-R6-07: prepare hackathon submission.

- Review submission requirements and deadlines.
- Prepare the public demonstration material.
- Verify README and demo consistency.
- Prepare submission text and required links.
- Do not submit or publish externally without
  explicit user approval.

## Current M3-R6-05B checkpoint — 2026-11-04

- Base commit: `b471895`.
- Original R6-04 case and transactions remain untouched.
- Create a separate, short-window Testnet rescue case.
- Reuse three existing R6-04 identities.
- Fund seven additional role-specific accounts.
- Three buyers fund three accepted rescue jobs.
- Two distinct providers post bonded component offers.
- Preserve each transaction in an external journal.
- Verify 114 UNIT incremental economic escrow.
- Do not award before the on-chain bid close.
- Status: FULL PUBLIC TESTNET ECONOMIC LIFECYCLE PASS.
- Nine consortium transactions and eight settlement transactions.
- Case creation transaction: `FTgpTeickEKF8n6Xre87RL6cxKZKWwyhgRmj8k6CXbm`.
- Atomic award transaction: `67c1G5C49tKZPjjjehJ9xs1qa9GYtbrW7C2igMjzsybT`.
- Terminal settlement transaction: `7wFv9zQWkKcUMSjxMSCMDA4jQM9J9BkpZTryNa4ixgsA`.
- Native withdrawal transaction: `AiDr3cP7BWF38k49VsnrKULjcSNU2fXuSKgRHm9GDPWs`.
- New consortium escrow: 114 UNIT; fully distributed.
- Provider credits: 36 UNIT.
- Worker rewards: 75 UNIT.
- Buyer refunds: 3 UNIT.
- Native withdrawal: 20 UNIT, receipt and callback PASS.
- Remaining claimable total: 94 UNIT.
- Prior R6-04 escrow remains: 30 UNIT.
- Both public RPCs independently verified 17 transactions
  and final economic state, without private credentials.
- Portable manifest: `docs/evidence/R6-05-public.json`.
- Read-only verifier: `node scripts/m3/r6_verify_public.cjs`.
- Synthetic Testnet demonstration, not independent audit.
- Next: M3-R6-06 submission demo and review.

## Current M3-R6-04 checkpoint — 2026-11-04

- Base commit: `5d4750a`.
- Use the already verified public Testnet contract.
- Three separately funded test accounts.
- Create one synthetic rescue case.
- Buyer posts a funded rescue job.
- Distinct worker accepts the job.
- Verify transactions and exact escrow accounting.
- Persist transaction journal outside the repository.
- No contract redeployment or mainnet operations.
- Status: PUBLIC TESTNET FUNDED SMOKE PASS.
- Three distinct funded Testnet accounts.
- Rescue case creation: `HgafqAgqCPuZKM2ezUtuzDndmdHjNavHMwVR9nub81cd`.
- Funded job transaction: `31WXAMbRKJC838893AKpwYeAQfYAGYq7ixM1PphCWmnc`.
- Worker acceptance: `GvoVxPnMwZoyMSNmZhgvfZvEuSTes6tA6yJBhnj9Ubht`.
- Rescue case ID: `7db84312296a1a8ce366f881bd9a399c9a60d5fb62b0534494f3356f8d6c0c63`.
- Job ID: 0.
- Finalized Open case and Accepted job verified.
- On-chain escrow: 30 UNIT = 0.03 testNEAR.
- Held worker reward: 25 UNIT.
- Held rescue cap: 5 UNIT.
- Both public RPCs independently verified final state.
- No double case creation after RPC finality lag.
- No provider award, settlement or worker payout yet.
- Evidence: /workspaces/nomogenesis-r6-04-evidence.log
- Next: R6-05 full Testnet lifecycle feasibility.

## Current M3-R6-03 checkpoint — 2026-11-04

- Base commit: `c2bcc45`.
- R6-01: two independent Testnet RPC probes PASS.
- R6-02: funded Testnet account provisioned, 10 NEAR.
- Deployment account: nomogenesis-70e59593a3.testnet.
- Local compatible WASM: 539608 bytes.
- Verify full deployed code against local SHA-256.
- Verify callable M3 storage quote.
- Never expose private credentials.
- Status: PUBLIC TESTNET DEPLOYMENT PASS.
- Deployed contract: `nomogenesis-70e59593a3.testnet`.
- Deployment transaction: `49NZ9qDKmfy42K9A7UKQDrDbQ9FWETFhijWQaUvcR5Qd`.
- On-chain code hash: `Hc2soWJ38GHn4i2gVy87jexrBYEgquboFg6VJLUL56wQ`.
- Two independent RPC bytecode comparisons PASS.
- Both returned SHA-256 `f6b470b22a3c8c8e94187510e4de7e6123bf61913a2a16ccb7945d2abf1429f7`.
- Callable `m3_storage_quote` PASS.
- Credentials stored outside the repository.
- The 12-role economic lifecycle remains Sandbox-only.
- No mainnet or independently audited deployment.
- Next: R6-04 public Testnet economic smoke test.
- No public economic lifecycle claim yet.

## Current M3-R5-03/02 checkpoint — 2026-11-04

- Base commit: `3a66f57`.
- Reuse the verified R5-02 contract and economic flow.
- Active actors sign in separate child processes.
- Actor keys must remain outside coordinator memory.
- Providers verify their own CSV proof bytes.
- Workers independently recompute from on-chain job data.
- Receipt-backed native withdrawal remains mandatory.
- Legacy R5-02 mode must remain available.
- Status: full isolated-role Sandbox PASS.
- Twelve distinct child-process signers.
- Three funded buyers and two bonded CSV providers.
- Three workers recomputed their local results.
- Keeper award and settlement PASS.
- Four expected negative contract calls rejected.
- Economic conservation: 114 units.
- Receipt-verified native payout: 20 units.
- Legacy R5-02 regression: PASS.
- Rust contract and compatible WASM unchanged.
- Evidence: /workspaces/nomogenesis-r5-03-02-evidence.log
- Legacy evidence: /workspaces/nomogenesis-r5-03-legacy-regression.log
- Next: M3-R6-01 testnet feasibility and demonstration.
- No public testnet or independent operator claim.

## Current M3-R5-03/01 checkpoint — 2026-11-04

- Base: `f36fa7c`.
- Separate child-process private key generation.
- Public-key-only test-account provisioning.
- Two independent on-chain signed transactions.
- Coordinator keeps only Sandbox administrator key.
- Existing Rust contract and R5-02 demo untouched.
- Status: local Sandbox PASS.
- Two distinct Node.js child processes verified.
- Actor keys generated inside their signer processes.
- Coordinator received only actor public keys.
- Two separately signed rescue-case creations PASS.
- Signer identities and transaction hashes verified.
- Sandbox administrator remains a trusted setup actor.
- Full buyer/provider/worker isolation not yet tested.
- No public testnet or independent security audit.
- Next: R5-03/02 full role-specific signer integration.

## Current M3-R5-02 checkpoint — 2026-11-04

- Base: `d699580`.
- One funded case, three buyers, three workers.
- Two distinct provider accounts and one keeper.
- Providers independently encode their own CSV inputs.
- Buyers commit to minimum thresholds before data delivery.
- Workers recompute results after both proofs and settlement.
- Target: complete local NEAR Sandbox economic lifecycle.
- Status: local NEAR Sandbox PASS.
- Five off-chain Node tests PASS.
- Three independently funded buyer jobs.
- Two distinct provider accounts delivered CSV proofs.
- Three independently signed worker completions PASS.
- Unauthorized proof, replay and forged result rejected.
- Full economic conservation: 114 units.
- Native payout: 20 units, receipt and callback verified.
- Exact WASM unchanged from R4-05.
- Distinct NEAR accounts, but one harness process.
- No public testnet or independent audit.
- Next: R5-03 independent signer-process verification.

## Current M3-R5-01 checkpoint — 2026-11-04

- Base commit: `7b68ebf`.
- Independent quantity and price CSV sources.
- Canonical binary payload and Merkle commitment builder.
- Off-chain deterministic u128 result reconstruction.
- Both current worker commitment profiles supported.
- No Rust contract modification.
- Four targeted Node tests PASS.
- CSV input parsing and checked arithmetic PASS.
- Computed result: 632.
- Two 33-byte canonical component payloads produced.
- Independent Merkle roots generated deterministically.
- Malformed and mismatched input rejected.
- Off-chain only; no R5 NEAR transaction yet.
- Next: bind distinct signer transactions to these files.

## Current M3-R4-05 checkpoint — 2026-11-04

- Base commit: `6edc066`.
- Fresh checkout, 242 Rust tests, strict Clippy PASS.
- Reproduced identical compatible WASM SHA-256.
- 26 M2/M3 gates PASS without source changes.
- Two legacy storage-audit expectations corrected
  using measured 360-byte shared state and
  2442-byte total growth.
- Both corrected offline audits PASS.
- Withdrawal fault injection PASS; source/WASM restored.
- Total verified gates: 29/29 with audit corrections.
- Unmodified base commit had stale audit assertions.
- Public testnet and independent audit remain pending.
- Next single action: M3-R5 independent signer/data demo.

## Current M3-R4-04 checkpoint — 2026-11-04

- Base: `0f6d127`, branch `feat/m2-escrow`.
- Deterministic worker result calculation implemented.
- ExactCommitment and MinimumThreshold profiles supported.
- 8 pure result tests and 6 completion tests PASS.
- Complete Rust regression: 242 PASS.
- Strict Clippy and compatible WASM PASS.
- WASM SHA-256: `f6b470b22a3c8c8e94187510e4de7e6123bf61913a2a16ccb7945d2abf1429f7`.
- Fresh local Sandbox: worker result lifecycle PASS.
- Four recovery cases, two successful worker completions,
  ten timed-out worker jobs.
- Worker credits: 50 units.
- Buyer reward refunds: 250 units.
- Remaining worker escrow: zero.
- Native worker withdrawal of 20 units PASS.
- Final ledger: 0 escrow + 436 claimable + 20 paid = 456.
- Units: 0.001 NEAR excluding transaction fees and storage.
- Invalid signers, forged results, threshold failures,
  premature/late submissions and replay rejected.
- Existing R4-03 economic settlement remains intact.
- No public testnet, independent audit or production approval.
- Next single action: M3-R4-05 complete regression,
  fresh checkout and reproducibility.

## Current M3-R4-03 checkpoint — 2026-11-04

- Base `0866b77`, branch `feat/m2-escrow`.
- Atomic on-chain terminal rescue settlement implemented.
- 228 Rust tests and strict Clippy PASS.
- Compatible WASM and fresh local Sandbox PASS.
- WASM SHA-256: `ae3c6f8e9742004d89b8b08c74ebf2f732b72a40879eb8ce0174b1eab02191b9`.
- Four distinct cases: full success, two partial defaults,
  full default. All four settlement outcomes PASS.
- Exactly 3Q settlement per bundle, no principal creation.
- Escrow 300 + claimable 156 = 456 before withdrawal.
- Escrow 300 + claimable 136 + paid 20 = 456 afterward.
- Native withdrawal callback and claimable reduction PASS.
- Measured contract storage delta -791 bytes during
  terminal settlement sequence.
- Worker reward liabilities deliberately unchanged.
- No public testnet, external audit, or production approval.
- Next single action: M3-R4-04 worker result and reward.

## Current M3-R4-02 checkpoint — 2026-11-04

- Base: `0392d17`, branch `feat/m2-escrow`.
- Deterministic pure settlement engine implemented.
- 10 focused economic tests PASS.
- Full Rust regression: 221 tests PASS.
- Strict Clippy, rustfmt and compatible WASM PASS.
- WASM SHA-256: `6d3affd31a7cf271de959d1affa112b3166321a3c7aca351445c5ce2c6d07f71`.
- Four terminal outcome combinations conserve exactly 3Q.
- Sponsor remainder goes to ascending positive job IDs.
- Invalid bonds, fees, sponsor sets and overflow rejected.
- Pure module only: no persistent state transitions.
- No fresh Sandbox for R4-02; R4-01 Sandbox remains
  the previous deployed-WASM evidence.
- Next single action: M3-R4-03 atomic on-chain settlement.

## Current M3-R4-01 checkpoint — 2026-11-04

- Base: `10338cf`, branch `feat/m2-escrow`.
- Canonical bounded binary parser and immutable Merkle
  commitment authentication implemented.
- Selected-provider and typed capacity ownership enforced.
- 211 Rust tests, Clippy and compatible WASM PASS.
- Fresh local NEAR Sandbox proof lifecycle PASS.
- WASM SHA-256:
  `51466911e11d2c4df741d0aa86823e69d9fc472b113b8eb94a3bcef671f2055a`.
- Escrow, claimables, worker reward and storage reserve
  remained unchanged during proof submission.
- Invalid on-chain proof receipts are expected negative tests.
- No public testnet, external audit or production approval.
- Terminal settlement is NOT implemented.
- Next single action: M3-R4-02 pure settlement economics.

## Current M3-R4-00 checkpoint — 2026-11-04

- Base: `2bf546d`; documentation-only milestone.
- Canonical component proof and 3Q settlement rules specified.
- Rust and WASM unchanged; R4 runtime not tested.
- Previous 206 Rust tests and local award Sandbox remain the R3 checkpoint evidence.
- Next single action: R4-01 authenticated component proof.

## Current M3-R3-03B-02 checkpoint — 2026-11-04

- Base commit: `af9c518`, branch: `feat/m2-escrow`.
- Atomic bundle award: local Sandbox PASS.
- Nine focused award tests PASS.
- Full Rust regression: 206/206 PASS.
- Strict Clippy, WASM and diff validation: PASS.
- WASM SHA-256: `d77817ae80f14bfdb1845f1151069e168dbcc107cc8bf0cc89e518499e25e8fc`.
- M2 primary, backup and settlement Sandboxes: PASS.
- M3-R2 lifecycle, provider release and atomic award Sandboxes: PASS.
- Economic conservation: 111 escrow + 5 claimable = 116 units.
- Storage reserves unchanged in the award scenario.
- Component proofs and terminal settlement: NOT IMPLEMENTED.
- Public testnet and independent security audit: NOT VERIFIED.
- Production funds: NOT APPROVED.
- Preserve `sandbox/real_low_margin_audit.cjs`.
- Next task: M3-R4-00 proof and settlement specification.

## Previous M3 checkpoint — 2026-11-04

- Branch: `feat/m2-escrow`; R3-03A implementation base: `46c0080`.
- Deterministic, read-only on-chain pair preflight: verified locally.
- Seven focused tests; full Rust suite: 157 + 11 + 17 + 6 = 191 passed.
- Clippy, compatible WASM build, Node syntax and diff checks: PASS.
- WASM SHA-256: `59c1cd29cd54f1c4e5985e8ff4193d558f41985b61e26144ed08556d9d7d968c`.
- Fresh NEAR Sandbox: three independent funded jobs, four provider offers,
  full-bond pair selection and cap revocation: PASS.
- The first Sandbox run overshot the award window; the bounded timing repair
  and successful rerun are recorded in the R3-03A worklog.
- Preserve untracked `sandbox/real_low_margin_audit.cjs`.
- Earlier M2 and M3-R2 Sandboxes were not rerun in this ticket.
- Bundle award, RecoveryRight, proof settlement and public testnet: not verified.
- M3-R3-03B-01 allocation: 6 focused tests and 197 full Rust tests PASS.
- Clippy, rustfmt, WASM and M3 pair-preview Sandbox PASS. WASM SHA-256: `652c1bd8d79748f6ea6e25ebc96214d25ec0b4a8f928dc9698b8823a8c6bdec3`.
- Active ticket: M3-R3-03B-02 atomic award; implementation unverified.
- Next single action: compile and test atomic award integration.

## Munkamenetindító parancsok

```bash
git status -sb
git log --oneline -8
find . -maxdepth 3 -type f | sort | head -100
# A megfelelő cargo parancs csak akkor használható, ha létezik Cargo.toml:
# cargo test --workspace
```

## A munkamenet lezárásakor kötelezően kitöltendő

```text
Dátum és chat / ticket:
Felhasznált branch és induló commit SHA:
Módosított fájlok:
Döntés / ADR-ID:
Lefuttatott parancsok és pontos PASS/FAIL:
Új regressziós tesztek:
Git diff és elkészült commit SHA:
Nyitott hibák (ticket ID):
Bizonyított, NEM bizonyított:
Következő egyetlen lépés:
```

## Session napló (append-only)

### 2026-11-04 — M3-R3-03A pair preflight

- Base: `46c0080`; seven focused and 191 full Rust tests passed.
- Clippy, compatible WASM and local Sandbox pair preview passed.
- The first Sandbox run overshot the award window; the bounded repair
  passed on rerun. No contract mutation was needed for this timing failure.
- Candidate preview creates no bundle or RecoveryRight. Next: R3-03B.

### 2026-11-04 — M3-R3-02B provider offer release

- Base: `71a1350`; five focused and 184 full Rust tests passed.
- Clippy, WASM `f67b157ebba28f48b7096c43e10d3322c7b5f4f3e2e6d3bff9d84bcbfa088221`, Node syntax and diff checks passed.
- Local Sandbox checked two separate provider bonds, authenticated cancel,
  keeper expiry, replay rejection and provider withdrawal.
- Awarded-case unselected path is unit-tested with a constructed bundle;
  production award remains R3-03.
- Next: R3-03A deterministic candidate selection preflight.

### 2026-11-04 — M3-R3-02A funded provider admission

- Base: `314d44b`; fresh deployment only.
- Exact bond plus storage deposit, six-offer limit and authenticated provider.
- Six focused tests; 179 full Rust tests; Clippy and WASM: PASS.
- WASM SHA-256: `a82f0c54d1e1d24d92d2a745a4882ac7e381c6c27b7094e4aee09f0291b367c5`.
- M3 offer and four existing lifecycle Sandboxes: PASS.
- Posting does not reserve an M2/M3 capacity slot.
- Next: R3-02B offer release and provider claimable accounting.

### 2026-11-04 — M3-R3-01B bounded provider records

- Base: `97e9178`.
- Zero-liability offer/bundle records, six offer references and storage quote v2.
- Focused tests: 2 schema + 4 case PASS; full Rust suite: 173 PASS.
- Format, Clippy, compatible WASM, three M2 and one M3 Sandbox: PASS.
- WASM SHA-256: `242765bb258020878b957e81507be839ed939459380230c69c85ec58a324c2bf`.
- Bond funding and bundle award remain unimplemented.
- Next: M3-R3-02A payable provider offer admission.

### 2026-11-04 — M3-R3-01A typed capacity registry

- Base: `c719804`.
- Typed capacity owners: `M2Offer` and `M3RescueOffer`.
- Existing M2 `slot_holder` view preserved; typed owner view added.
- Simulated M3 ownership blocks M2 selection before mutation.
- M2 terminal paths release the exact typed M2 owner.
- Typed owner survives state reload.
- Two builder-anchor failures and their repairs are in the worklog.
- Five focused capacity tests passed.
- Full suite: 139 unit + 11 rescue-model + 17 storage-event + 6 storage-ledger = 173 passed.
- Format, Clippy, compatible WASM and diff checks passed.
- M2 primary, backup and settlement Sandboxes passed.
- M3-R2 multi-party Sandbox passed on the changed WASM.
- WASM SHA-256: `c8999ddd7792eeee516c2f372303bd4632fe653909762379bb100c7ec2efc034`.
- Real M3 offer, bundle and award are not implemented.
- Next: M3-R3-01B zero-liability offer and bundle schema.

### 2026-11-04 — M3-R3-00 provider market design

- Base: `643e19c`.
- Locked the funded provider-offer and bond-capacity model.
- Defined the atomic RecoveryRight creation boundary.
- Award caller supplies only the case ID.
- Provider pair, price, sponsors and allocations are contract-derived.
- Selected providers are distinct and each locks full bundle price `Q`.
- Defined capped-equal mandate locking and unused-cap credit.
- Defined selected-provider excess-bond credit.
- Chose one typed M2/M3 capacity registry on fresh state.
- Defined storage ownership and terminal offer-release paths.
- Added ADR-011 and ADR-012.
- Documentation-only checkpoint; no Rust or Sandbox claim.
- Next: M3-R3-01 zero-liability persistent schema.

### 2026-11-04 — M3-R2-04 multi-party Sandbox

- Base: `3bfb9cb`.
- Built compatible release WASM successfully.
- WASM SHA-256: `ab129cc27fa133a29412e6198bc550e6bc81cf4ff24b37790362727d120e1a03`.
- Deployed a fresh contract to local NEAR Sandbox.
- Created one canonical case with three buyers and three workers.
- Rejected case-storage and job-funding underpayments on-chain.
- Persisted exactly 0.09 NEAR of M3 economic principal.
- Rejected outsider worker acceptance.
- All three designated workers accepted through separate accounts.
- One buyer revoked its cap; two caps expired permissionlessly.
- Three accepted jobs expired permissionlessly.
- Terminal replay attempts were rejected.
- `rescue_escrow` closed at zero.
- Claimables reached 0.09 NEAR before withdrawal.
- A 0.02 NEAR native withdrawal completed with callback.
- Observed recipient balance increase: 0.010718153802558651764660 NEAR after transaction costs.
- Remaining claimables: 0.07 NEAR; pending payouts: zero.
- Economic identity: 0.02 paid + 0.07 claimable + 0 escrow = 0.09 NEAR.
- Storage reserves remained separate and unchanged.
- Next: M3-R3-00 provider offers, bonds and atomic bundle-award design.

### 2026-11-04 — M3-R2-03B permissionless expiry

- Base: `a083eb2`.
- Added permissionless unaccepted-job expiry at the dependency deadline.
- Added permissionless open-mandate release at award close.
- Added permissionless accepted-job expiry at the final job deadline.
- Pre-deadline actions use `<`; matching expiry paths use `>=`.
- Unaccepted expiry releases reward and only a still-held cap.
- Award expiry releases only an open, unlocked cap.
- Accepted-job expiry releases reward independently from mandate state.
- Locked mandates remain protected for future bundle settlement.
- Expiry callers cannot redirect value from the immutable buyer.
- Replays and claimable overflow preserve persistent economic state.
- Permissionless terminal state and totals survive reload.
- Focused expiry tests: 7 passed, 0 failed.
- Full Rust suite: 168 passed, 0 failed.
- Clippy, WASM target check and diff check passed.
- Preserve: `sandbox/real_low_margin_audit.cjs`.
- Next: M3-R2-04 multi-party local NEAR Sandbox reproduction.

### 2026-11-04 — M3-R2-03A manual liability release

- Base: `f19bad9`.
- Added buyer-only cancellation of unaccepted rescue jobs.
- Added buyer-only revocation of open rescue mandates.
- Cancellation releases held worker reward and any still-open cap.
- A previously revoked cap is not credited again during cancellation.
- Accepted jobs cannot be cancelled through the unaccepted-job path.
- Mandate revocation leaves the funded or accepted worker job intact.
- Every successful release decreases `rescue_escrow` by the credited amount.
- Foreign callers, replays and claimable overflow preserve economic state.
- Terminal job, mandate and claimable state survives reload.
- Focused release tests: 6 passed, 0 failed.
- Full Rust suite: 161 passed, 0 failed.
- Clippy, WASM target check and diff check passed.
- Preserve: `sandbox/real_low_margin_audit.cjs`.
- Next: M3-R2-03B permissionless deadline expiry.

### 2026-11-04 — M3-R2-02B atomic funded job and mandate

- Base: `df44175`.
- Added atomic creation of a funded rescue job and its bounded rescue mandate.
- Exact deposit covers worker reward, rescue cap and the 576-byte storage quote.
- Buyer identity, worker identity, deadlines, result profile and commitments are validated before mutation.
- Duplicate buyer participation and the seventh case job are rejected.
- Only the designated worker may accept before the dependency deadline.
- Acceptance changes job state without changing economic liability.
- Malformed and overflowing inputs leave IDs, collections and totals unchanged.
- Job, mandate and M3 totals survive state reload.
- Measured job-plus-mandate write: 307 bytes against a 576-byte quote.
- Focused funding tests: 6 passed, 0 failed.
- Full Rust suite: 155 passed, 0 failed.
- Clippy, WASM target check and diff check passed.
- Preserve: `sandbox/real_low_margin_audit.cjs`.
- Next: M3-R2-03 cancellation, revocation and expiry with one-time liability release.

### 2026-11-04 — M3-R2-02A canonical case and quote

- Base: `b9e53f1`.
- Added typed immutable rescue-case descriptors.
- Case IDs bind the descriptor hash to the contract account.
- Added bounded storage quotes derived from exact record and key sizes.
- Initial case write measured 256 bytes against a 893-byte quote.
- Future job-plus-mandate quote is 576 bytes.
- 149 Rust tests, Clippy, WASM target and diff checks passed.
- No M3 economic principal was accepted.
- Next: M3-R2-02B atomic funded job plus mandate.


### 2026-11-04 — M3-R2-01 zero-liability schema

- Base: `b3eb084`.
- Added bounded rescue case, job and mandate records.
- Added zero-initialized `rescue_escrow` and empty M3 collections.
- Withdrawal backing now includes active M3 principal.
- Fixed overflowing offer-pair admission so one invalid pair cannot block a valid bundle.
- 145 Rust tests, Clippy, WASM target check and diff check passed.
- No M3 funding endpoint or real Sandbox storage quote was introduced.
- Next: M3-R2-02 atomic funded job plus mandate.


### 2026-11-04 — M3-R0B governance alignment

- M3-R0 base commit: aceae9b.
- PROJECT_MASTER, STATUS and AGENTS aligned with the rescue-market specification.
- Existing M2 source and historical evidence remain unchanged.
- No Rust, Sandbox or testnet test was run.
- Next: review and commit M3-R0, then start M3-R1.


### 2026-11-04 — M3-R0A product and executable spec

- Base commit: aceae9b.
- Replaced the old collateral-reuse-first product direction.
- Added bounded payload, allocation, clearing and settlement rules.
- Added ADR-007 through ADR-009.
- No Rust, Sandbox or testnet test was run.
- Next: M3-R0B governance-document alignment.


### 2026-11-04 — M3-00 continuity workflow

- Checkpoint: 5a1b6ff
- Tracked worktree clean.
- audit file preserved.
- Worklog path established.
- Next: M3-R0; no scaffold before reconciliation.


### 2026-11-03 — Context pack létrehozva

A különálló korábbi Python prototípusokat és független auditot feldolgozva az új Rust-repo számára önmagát magyarázó kormányzó dokumentumok készültek. **Nem történt Rust implementáció, Git commit, Codespaces build vagy NEAR-tranzakció ebben a munkamenetben.**

### 2026-11-03 — GitHub repo és Codespaces állapot ellenőrizve (commit előtt)

Repo: https://github.com/lipcsiklaszlo5-lgtm/prime-radiant-nomogenesis (public). A felhasználó a `main` branch-en megnyitotta a Codespaces-t asztali VS Code-ban. A dokumentumok telepítését, commitját és tesztjét a következő terminálkimenettel kell igazolni; ezen csomag **önmagában nem bizonyít commitot**.

### 2026-11-03 — M0 projektmemória rögzítve

- Commit: `ce9c9e4a5e13e89d06f0f30c3673de8318564323`.
- 11 Markdown-fájl sikeresen commitolva és pusholva.
- GitHub-kapcsolaton keresztül a commit és a fájllista ellenőrizve.
- Codespaces working tree a commit után: `CLEAN`.
- Rust build, funkcionális teszt vagy NEAR-tranzakció még nem történt.
- Következő feladat: M0 protokollspecifikáció.

### 2026-11-03 — M1 Rust checkpoint

- Branch: `feat/m1-near-contract`.
- Commit: `129e8a8beaf88f45e2c80300770d90ce14eb9ada`.
- Megépítve: objektív Merkle-proof ellenőrző, task létrehozás, kijelölt primary elfogadás.
- Natív Rust unit tesztek: 12 PASS, 0 FAIL.
- `cargo check --locked --target wasm32-unknown-unknown`: PASS.
- `cargo clippy --locked --all-targets -- -D warnings`: PASS.
- NEM igazolt: NEAR sandbox, telepíthető szerződés,
  escrow, fedezet, backup aktiválás, valódi lánctranzakció.
- A proof view metódus jelenleg hívótól kapott rootot
  vizsgál; még nincs task állapotához kötve.
- Következő: tartalékajánlat + kizárólagos slot-foglalás.


### 2026-11-03 — M1 állapotgép és regressziós audit lezárása

- Ellenőrzött Rust commit: `01996a3d12e229ec3edb819c683defb60d90e13b`.
- Funkciók: task / offer / slot-lock / primary proof /
  backup activation / reserve proof / minden fő lezárási út.
- 75 sikeres natív Rust unit teszt.
- 2 mock storage-reload teszt és 7 terminális audit-teszt
  része a 75 tesztnek, nem hozzáadandó új eredmény.
- `cargo check --locked --target wasm32-unknown-unknown`: PASS.
- `cargo clippy --locked --all-targets -- -D warnings`: PASS.
- `git diff --check`: PASS.
- Még nem történt bizonyított sandbox-telepítés,
  testnet-tranzakció vagy gazdasági settlement.
- Következő: release WASM build, majd sandbox-integráció.

### 2026-11-03 — M1 Final Gate PASS

- Clean checkout: b2d0a71.
- Rust: 75/75 PASS.
- Both real local NEAR sandbox suites PASS.
- Compatible WASM SHA-256: 22f451680c7f4c8e62e69b467b6641c86c52402ee1f1755891a9a38cbb9b0cab
- No testnet receipts or economic settlement.
- Next: M2 deterministic accounting core.

### 2026-11-03 — M2 funding checkpoint

- Base commit: 684782c.
- On-chain buyer and reserve funding methods added.
- Six additional Rust tests PASS.
- Third sandbox funding integration PASS.
- Pending: terminal ledger, refunds, withdrawals, callback replay protection, storage measurement.


### 2026-11-03 — M2/03 terminal ledger checkpoint

- Base commit: `67585d4`, branch `feat/m2-escrow`.
- Rust 95/95 PASS; Clippy and WASM PASS.
- Four local NEAR sandbox suites PASS.
- Terminal claims and collateral slashing verified on-chain.
- Conservation: 192 yoctoNEAR across four funded tasks.
- Storage accounting remains provisional.
- Withdrawals and async callbacks not implemented.
- Next: M2/04 withdrawal and storage security.


### 2026-11-03 — M2/04D withdrawal checkpoint

- Base: `984da8d`, branch `feat/m2-escrow`.
- 103/103 Rust tests, Clippy, compatible WASM PASS.
- Six local NEAR sandbox suites integrated.
- Native payout success and callback finalization verified.
- Fault-injected native transfer failure and callback recovery verified.
- Double callback does not recreate credit in unit tests.
- Failure-injection harness restores original source and WASM.
- Exact storage liability and refund lifecycle NOT VERIFIED.
- Public testnet and independent security review NOT DONE.
- Next: exact storage accounting and liability invariants.


### 2026-11-03 — M2/05A storage measurement

- Base: `8cc009c`, branch `feat/m2-escrow`.
- Fifteen real local Sandbox storage checkpoints PASS.
- Persistent net growth: 1535 bytes.
- Current provisional storage reserves: 8192 bytes.
- Excess storage reserve must NOT yet be refunded.
- Unpaid create_task/post_offer storage growth is a
  confirmed design gap.
- New design: docs/STORAGE_POLICY.md.
- Next: require funded storage admission for both
  persistent creation endpoints and migrate tests.


### 2026-11-03 — M2/05C storage admission checkpoint

- Base: `e9c9c9a`, branch `feat/m2-escrow`.
- 106 Rust unit tests.
- Eight local NEAR sandbox suites.
- Storage prepayment required for task/offer creation.
- Ownership tracked in persistent storage bonds.
- 12 rejected creation transactions leave storage unchanged.
- Exact economic payout logic remains unchanged.
- Refund mechanism NOT IMPLEMENTED.
- Public testnet, migration, independent audit NOT DONE.
- Next: precise storage and refund lifecycle.


### 2026-11-03 — M2/05D capital solvency checkpoint

- Base commit: `26579ef`, branch `feat/m2-escrow`.
- Baseline deployed WASM stake: 3.1443 NEAR.
- Additional operating margin 0.06 NEAR: payout PASS.
- Additional operating margin 0.015 NEAR:
  withdrawal rejected; claimant balance preserved.
- Nine local NEAR sandbox regression suites.
- Storage reserves and actual storage stake are both
  included in the current conservative backing guard.
- Universal capital sufficiency NOT PROVEN.
- Storage refund lifecycle NOT IMPLEMENTED.
- Next: precise refund eligibility and storage release
  accounting, with no weakening of economic solvency.


### 2026-11-03 — M2/06B scoped refund validation

- Base: `ae554a4`, branch `feat/m2-escrow`.
- 108 Rust unit tests; ten local Sandbox suites.
- Exact net-byte rebate on released unselected
  collateral funding record.
- First observed rebate: 5 byte-equivalent.
- Second observed rebate: 88 byte-equivalent.
- Owner attribution and replay protection tested.
- All unrelated storage contributions remain reserved.
- Historical M2/06A preflight archived.
- General storage refund policy NOT complete.
- No public testnet or independent security audit.
- Next: audit per-record lifetime storage attribution
  and withdrawal solvency after storage rebates.


### 2026-11-03 — M2/06C ownership audit

- Base commit: `10db9d7`, branch `feat/m2-escrow`.
- Rust code unchanged; 108 unit tests.
- Eleventh sandbox suite: cross-owner refund audit.
- Two buyers, two providers, external release caller.
- Early unauthorized calls rejected.
- Original provider credited under valid external release.
- Other providers and buyers remain unaffected.
- Replay blocked without ledger or storage mutation.
- Native refund withdrawal tested.
- Five of 24 offer-release permutations PASS.
- Tested owner rebate total: 0.00091 NEAR each.
- Optional repeat: `npm run sandbox:ownership-orders`.
- Scoped-only evidence; general refund system unproven.
- No public testnet or independent audit.
- Next: analyze allocation ownership and minimum-capital
  backing across longer mixed lifecycles.

## M2/07A — Capital drift measurement

Local NEAR Sandbox, 2026-11-03.

- Starting commit: `dd93929`.
- Rust and compatible WASM unchanged.
- Six sequential task creation transactions PASS.
- Initial free capital: 0.08000000 NEAR.
- Six creation bonds: 0.12288000 NEAR.
- Persistent storage growth: 1883 bytes.
- Actual storage stake growth: 0.01883000 NEAR.
- Additional contract balance inflow: approximately
  0.00018419 NEAR.
- Net free capital reduction: approximately
  0.01864580 NEAR.
- Remaining free capital: 0.06135419 NEAR.
- Remaining capital after payout buffer:
  0.04087419 NEAR.

The entire creation bond remains recorded as a
storage reserve liability while actual allocated
storage separately increases the backing requirement.

This causes measured free-capital consumption despite
the user's storage prepayment.

The test accounts for additional observed contract
balance inflows rather than assuming exact equality
between attached deposits and balance changes.

This is one measured workload, not a universal
capital bound or proof of insolvency.

The audit is optional and is not yet part of the
eleven-suite default Sandbox regression.

Run independently:

`npm run sandbox:capital-drift`

Next: classify permanently consumed storage capital,
refundable balances and retained-record ownership
across mixed terminal and withdrawal lifecycles.

Production funds remain NOT APPROVED.

## M2/07B — Mixed lifecycle capital audit

Local NEAR Sandbox, 2026-11-03.

- Base commit: `650983c`.
- Original M2/06C ownership audit preserved.
- Rust contract and WASM unchanged.
- 23 state snapshots collected.
- Two buyers, two reserve providers, outsider caller.
- Unauthorized early releases rejected.
- Two funded tasks cancelled.
- Four collateralized offers released.
- Replay protection PASS.
- Ownership and financial conservation PASS.
- Native storage rebate withdrawal PASS.
- Initial free capital: 0.12000000 NEAR.
- Net storage growth: 2339 bytes.
- Storage stake growth: 0.02339000 NEAR.
- Net capital reduction: approximately 0.02251805 NEAR.
- Final free capital: approximately 0.09748195 NEAR.
- Final guarded capital: approximately 0.07700195 NEAR.
- Remaining recorded storage reserve: 0.24394000 NEAR.

The observed financial ledger remained conserved
through the tested releases and native withdrawal.

Recorded storage reserves remain protected as
liabilities in addition to actual storage stake.

All sampled states maintained nonnegative surplus.

Intermediate funding transitions were not all
sampled individually.

This is a bounded local lifecycle experiment,
not an exhaustive solvency or concurrency proof.

Optional regression:

`npm run sandbox:capital-lifecycle`

Next: classify consumed versus refundable storage
capital and model minimal-capital operation.

No production funds approved.

## M2/07C — Shadow storage reconciliation

- Base: `53ca3a9`.
- Local Sandbox shadow reconciliation PASS.
- 23 observed states.
- Hypothetical consumed storage: 0.02339 NEAR.
- Hypothetical unused reserve: 0.22055 NEAR.
- Conservative free capital: 0.09748195 NEAR.
- Shadow free capital: 0.12087195 NEAR.
- No on-chain economic or storage logic changed.
- No per-owner refund eligibility established.
- Shadow identity is algebraic, not a
  standalone security or solvency proof.

Optional regression:

`npm run sandbox:capital-shadow`

Proposed implementation requirements:

`docs/STORAGE_RECONCILIATION_ADR.md`

General storage refunds, migration and
production solvency remain unverified.

## M2/07D/1 — Pure Rust storage ledger model

Base commit: `4eb25a7`.

An isolated Rust arithmetic model has been created in:

- `src/storage_ledger_model.rs`
- `tests/storage_ledger_spec.rs`

Six new tests PASS. The existing 108 Rust unit tests
remain unchanged and PASS.

The model tracks payer, original contribution,
consumed capacity, unused capacity and simulated
released credit for four record categories.

Its accounting invariant is:

total = consumed + unused + released

This model does not modify the NEAR contract state,
WASM interface, withdrawal guard or escrow ledger.

Security limitations:

- Release eligibility is not authenticated.
- Storage deltas are not independently authenticated.
- Shared storage attribution remains unresolved.
- Future storage growth has no proven upper bound.
- Repeated partial simulated credits are not
  protected by a trusted one-time event identity.
- Caller-provided event IDs alone would not
  constitute sufficient replay protection.
- State migration remains unimplemented.

Next: M2/07D/2 — event identity, replay protection,
trusted storage attribution and adversarial tests.

No production funds approved.

## M2/07D/2 — Isolated event replay guard

Base commit: `e123e15`.
Date: 2026-11-03.

New files:

- `src/storage_event_guard.rs`
- `tests/storage_event_guard_spec.rs`

Verified local results:

- Seven event guard tests PASS.
- Thirteen tests in combined event guard target PASS.
- Six original storage ledger tests PASS.
- 108 existing contract unit tests PASS.
- Clippy, formatting and WASM target checks PASS.

Verified model properties:

- An identical event ID cannot be processed twice.
- Reusing an ID against another owner is rejected.
- Payer mismatch is rejected.
- Invalid arithmetic does not mutate the ledger.
- Failed operations do not consume event IDs.
- Processed restore events cannot be replayed.
- Tested balances preserve ledger conservation.

These tests verify an isolated arithmetic and
event bookkeeping model, NOT NEAR authorization.

Remaining security gaps:

1. Event authenticity is not established.
2. Distinct event IDs can describe the same physical
   storage change; global byte uniqueness is unproven.
3. Unused capacity alone does not prove refund
   eligibility or finality of a record.
4. The event source is simulated in unit tests.
5. The in-memory BTreeSet and full Book cloning are
   not approved on-chain persistence/gas strategies.
6. Allocation of shared storage and future mutation
   capacity remains unresolved.
7. Persistent state migration remains unimplemented.

The current contract storage backing and withdrawal
rules must remain unchanged.

Next gate: M2/07D/3 — derive event provenance from
trusted state transitions, measure actual storage
deltas, and prevent double attribution even when
different event IDs are presented.

Production funds remain NOT APPROVED.

## M2/07D/3 — Canonical offer finality and provenance

Base commit: `8730a6c`.
Date: 2026-11-03.

### Isolated Rust model — M2/07D/3A

- Canonical key: OfferFunding(offer_id).
- The first successful simulated credit finalizes
  that funding record in the isolated model.
- Further allocation, restoration or credit against
  that record is rejected, even with another event ID.
- Failed credit does not finalize the record.
- Other offer funding records remain independent.
- TaskFunding finality is NOT defined by this gate.
- 17 tests PASS in the event-guard test target.

The in-memory model is not connected to NEAR state.
Its terminal credit does not independently establish
the entitlement or completeness of a real refund.

### Real NEAR Sandbox — M2/07D/3B

- Two buyers, two reserve providers, one outsider.
- Four funded offers released after task cancellation.
- Four distinct-account replay attempts rejected.
- Original provider receives collateral and rebate,
  regardless of which eligible actor triggers release.
- Four released offer collateral records are absent.
- Unreleased offers remain available and funded.
- Measured net storage reductions: 3, 3, 88, 88 bytes.
- Total measured release reduction: 182 bytes.
- Total storage rebate: 0.00182 NEAR.
- Cross-owner financial accounting PASS.
- Native rebate withdrawal PASS.

The Sandbox checks the CURRENT contract's existing
offer state machine, not integration of the new ledger.

### Limitations

- Source and destination of every shared storage byte
  are not yet independently attributed.
- The physical storage delta cannot be submitted as
  an arbitrary caller-provided credit entitlement.
- An event ID is not evidence of storage release.
- Other record categories have no general finality
  and refund policy.
- New persistent structures, gas costs, contract
  state migration and minimal-capital operation
  remain unverified.

No changes to the contract's withdrawal backing
rule or persistent NEAR state were made.

Optional Sandbox regression:

`npm run sandbox:provenance`

Next: design the trusted transition-to-ledger bridge,
including exact allocation boundaries and persistent
storage cost attribution.

Production funds remain NOT APPROVED.

## M2/07E/1 — Raw NEAR storage key attribution

Base commit: `8e3a580`.
Local NEAR Sandbox, 2026-11-03.

Four funded, unselected offers were released.
Raw persisted key/value differences were inspected
through NEAR Sandbox view_state.

Measured results:

- Four offer funding records deleted.
- Each deleted record occupied 88 bytes.
- Total deleted storage: 352 bytes.
- First claimable creation for each provider:
  85 bytes.
- Two new claimable records: 170 bytes.
- Existing claimable updates added zero bytes.
- Net storage released: 182 bytes.
- Storage rebates: 0.00182 NEAR.
- Raw KV deltas matched storage_usage changes.
- Four cross-caller replay attempts rejected.
- Original reserve providers received the credits.
- Native refund withdrawal PASS.

Specific release deltas: 3, 3, 88, 88 bytes.

The 85-byte claimable allocation depends on the
tested account identifiers and storage encoding.
It is not a universal constant.

The observed 40-byte per-key overhead was checked
against the measured NEAR storage_usage delta.

This is read-only external storage inspection.
The contract does not expose raw storage keys.

The audit proves exact attribution of the inspected
key changes in this local scenario, not ownership
of all shared or future storage allocations.

Rust contract, persistent state and WASM unchanged.

Optional regression:

`npm run sandbox:storage-keys`

Next: M2/07E/2 — per-transition storage cost
attribution, including retained records, shared
writes and future mutation capacity.

The isolated storage ledger is not on-chain.
General storage refunds are not approved.
Production funds remain NOT APPROVED.

## M2/07E/2A — Complete storage transition matrix

Base commit: `387dff9`.
Local NEAR Sandbox, 2026-11-03.

### Verified physical measurements

- 21 successful state transitions instrumented.
- Each raw KV delta reconciled against storage_usage.
- Total persistent growth: 2339 bytes.
- Difference between reconstructed and actual
  storage usage: zero bytes.
- Four funded offer records deleted.
- Four cross-caller replay attempts rejected.
- Native refund withdrawal PASS.
- Existing contract WASM unchanged.

### Retained storage after lifecycle

| Category | Records | Bytes |
|---|---:|---:|
| Tasks | 2 | 334 |
| Task creation bonds | 2 | 186 |
| Task funding | 2 | 270 |
| Offers | 4 | 460 |
| Offer creation bonds | 4 | 384 |
| Settlement markers | 2 | 112 |
| Claimable balances | 4 | 336 |
| Shared or unknown | 1 | 257 |
| TOTAL | 21 | 2339 |

Named record categories account for 2082 bytes.
The remaining 257 bytes were classified as
shared_or_unknown, not assigned to a customer.

### Transaction groups

- Task creation: +777 bytes, including 257 bytes
  classified as shared_or_unknown.
- Task funding: +270 bytes.
- Primary acceptance: 0 net bytes.
- Offer posting: +844 bytes.
- Offer funding: +352 bytes.
- Task cancellation: +278 bytes.
- Offer release: -182 bytes.
- Native withdrawal: 0 net bytes.

Total: +2339 bytes.

All amounts above describe the tested workload.

### Attribution boundary

Physical storage ownership and contractual
cost-bearing responsibility are different.

The presence of a payer's creation bond does
not establish that all subsequent storage for
that task or offer is refundable.

The claimable record's beneficiary does not
automatically establish who finances its
persistent storage.

The 257-byte shared_or_unknown allocation
must not be arbitrarily assigned to the first
task creator merely because that transaction
first created the record.

Retained audit, terminal, funding and bond
records may require long-term storage backing.

The model does not establish future mutation
bounds, migration safety, universal storage
costs or general refund eligibility.

### Regression

`npm run sandbox:transition-matrix`

Next: M2/07E/2B — explicitly define funding
responsibility by record category and prove
that refundable capacity remains protected
against future storage obligations.

The current contract remains unchanged.
No general refund authorization is granted.
Production funds remain NOT APPROVED.

## M2/07E/2B/1 — Isolated storage cost policy

Base commit: `0c16b18`.
Date: 2026-11-03.

### Evidence

A fresh 21-transition NEAR Sandbox matrix was
processed by the isolated cost-policy model.

Verified results:

- 12 independently tracked storage contributions.
- Each contribution preserves:
  total = consumed + unused + released.
- Five manipulated scenarios rejected.
- Physical storage reconciliation PASS.
- Rust contract and WASM unchanged.

### Model totals

| Component | Byte-equivalent |
|---|---:|
| Original storage contributions | 24576 |
| Attributed persistent customer storage | 2082 |
| Hypothetical unused capacity | 22312 |
| Previously released credit | 182 |
| Separate shared storage | 257 |

Accounting:

24576 = 2082 + 22312 + 182

2339 = 2082 + 257

Existing on-chain storage reserve after the
tested rebates is 24394 byte-equivalent.

The proposed accounting split is:

24394 = 2082 + 22312

### Proposed cost-bearing assumptions

- Task creation bond covers task record
  and task creation bond storage.
- Task funding bond covers task funding,
  settlement marker and buyer claimable creation
  in this tested unmatched lifecycle.
- Offer creation bond covers offer record
  and offer creation bond storage.
- Offer funding bond covers its original
  funding record until deletion.
- The first provider claimable creation is
  provisionally charged to the corresponding
  offer funding bond.
- Shared storage remains separately backed.

These are design assumptions, not established
refund entitlements.

### Security limitations

- Future storage obligations are not bounded.
- Different lifecycle outcomes may have
  different storage requirements.
- Storage costs can depend on account and slot
  identifier lengths.
- Claimable ownership does not automatically
  establish storage cost responsibility.
- The model parses Sandbox evidence and uses
  expected fixture values; it is not itself
  an authenticated on-chain ledger.
- Adversarial tests demonstrate rejection of
  the tested mutations, not exhaustive security.
- General refunds and migration remain unproven.
- No new withdrawal or payout rights are enabled.

Optional regression:

1. npm run sandbox:transition-matrix
2. npm run sandbox:cost-policy -- /path/to/log

Next: M2/07E/2B/2 — future mutation reserve,
global backing invariants and zero-capital stress.

Production funds remain NOT APPROVED.

## M2/07E/2B/2A — Global backing stress model

Base commit: `5149b76`.
Date: 2026-11-03.

### Verified evidence

- 21 successful Sandbox storage transitions.
- 22 backing samples, including baseline.
- Actual account balances and physical storage.
- Current economic, collateral, claimable,
  pending and storage reserve liabilities.
- Conservative backing guard reconstructed.
- Hypothetical consumed/unused backing model.
- Five adversarial input mutations rejected.
- Rust contract and WASM unchanged.

### Final accounting

Measured physical storage growth: 2339 bytes.

Attributed consumed storage: 2082 bytes.
Shared storage: 257 bytes.
Unused contribution capacity: 22312 bytes.
Previously credited storage refunds: 182 bytes.

Recorded remaining storage reserve:
24394 byte-equivalent.

The observed accounting identities hold:

2339 = 2082 + 257

24394 = 2082 + 22312

### Treasury margin scenarios

All margins below are counterfactual.
They reduce the starting treasury balance while
preserving observed transaction balance changes.

| Margin | Conservative | Shadow |
|---|---|---|
| 0 NEAR | FAIL | FAIL |
| 0.015 NEAR | FAIL | FAIL |
| 0.060 NEAR | PASS | PASS |
| 0.120 NEAR | PASS | PASS |

Approximate implied minimum initial margins
for the sampled transition trace:

Conservative: 0.04514410 NEAR.
Shadow: 0.02302421 NEAR.

These are conditional model thresholds,
NOT proven safe funding requirements.

### Future capacity test

The model tested incremental consumption of
unused capacity without new storage deposits.

The following requests were algebraically
covered within the simulated reserve:

0, 2048, 4096, 8192 and 22312 bytes.

A 22313-byte request exceeded the modeled
22312-byte unused capacity and was rejected.

The assumed future minimum was 2048 bytes.
This is a test parameter, not a proven upper
bound for future legitimate state changes.

Converting unused storage reserves to an
equal claimable liability does not by itself
create free capital.

### Unresolved security boundaries

- Actual low-margin Sandbox deployments
  have not been run for these scenarios.
- No universal future storage growth bound.
- No proof of every lifecycle and callback.
- The shadow split is not persisted on-chain.
- Model calculations use a fixed verified
  transaction trace and known fixture categories.
- Storage ownership and refund entitlement
  remain separate questions.
- No migration safety proof.
- No permission to relax withdrawal backing.
- No general refund authorization.

### Regression

1. npm run sandbox:backing-probe
2. npm run sandbox:backing-stress -- /path/to/log

Next: M2/07E/2B/2B — actual low-margin
Sandbox deployments, native payout checks
and alternative lifecycle stress.

Production funds remain NOT APPROVED.

## R7-06E/03B-06 verified checkpoint

Date: 2026-11-06.

Integrated consent-bound M3/V2 subset award:
231 Rust tests PASS, strict Clippy PASS,
compatible WASM and local NEAR Sandbox PASS.

Four provider outcomes verified across the
successful terminal case and three default cases.

Economic conservation: 48 UNIT.

Evidence: docs/evidence/R7-06E-03B-06.json
Worklog: docs/worklog/R7-06E-03B-06-checkpoint.md

Limitations: consent storage bond release,
independent security review, public V2 Testnet,
and free-rider incentives remain unresolved.

Next: R7-06E/03B-07 storage bond accounting audit.

## R7-06E/03B-07C storage policy gate

Local NEAR Sandbox storage audit and consent
revocation/re-registration lifecycle: PASS.

Three registrations, two active consents,
three retained storage bonds (0.12288 NEAR).
Observed additional persistent growth: 74 bytes.

No refund rights or fixed refund amount have
been approved. Source code and WASM unchanged.

Evidence: docs/evidence/R7-06E-03B-07.json
Policy: docs/worklog/R7-06E-03B-07C-storage-policy.md

Next: R7-06E/03B-07D persistent nonce
storage bound and minimum retained reserve.

## R7-06E/03B-07D storage bound checkpoint

Date: 2026-11-06.

Maximum-length buyer and large-nonce local
NEAR Sandbox lifecycle verified: PASS.

Current Borsh source-level model: 375 bytes.
Quoted consent capacity: 4096 bytes.
Measured net lifecycle storage: 135 bytes.

These are not a formal protocol storage proof.
No refundable amount has been approved.

Evidence: docs/evidence/R7-06E-03B-07D.json
Worklog: docs/worklog/R7-06E-03B-07D-storage-bound.md

Decision: freeze consent refund development
for the hackathon checkpoint.

Next: V2 public deployment/demo readiness review.
