from pathlib import Path
import subprocess
import sys

BASE = "d531cbc"

def read(name: str) -> str:
    return Path(name).read_text(encoding="utf-8")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)

branch = subprocess.check_output(
    ["git", "branch", "--show-current"], text=True
).strip()
head = subprocess.check_output(
    ["git", "rev-parse", "--short", "HEAD"], text=True
).strip()

if branch != "feat/m2-escrow" or head != BASE:
    print(f"M3-R2-00 REFUSED branch={branch} head={head}")
    sys.exit(2)

design_path = Path("docs/M3_R2_STORAGE_AND_LIABILITY.md")
worklog_path = Path("docs/worklog/M3-R2-00-design.md")

if design_path.exists() or worklog_path.exists():
    print("M3-R2-00 REFUSED: output already exists")
    sys.exit(2)

design = """# M3-R2 — Funded jobs, rescue mandates and liability boundary

**Status:** approved implementation design
**Base checkpoint:** `d531cbc`
**Date:** 2026-11-04

## Product event

Several separately funded jobs depend on the same two data components.
Each buyer pre-authorizes a bounded rescue contribution. After the original
dependency deadline, complementary funded offers may form one complete
recovery transaction without another required buyer approval.

The measurable result is one newly fundable recovery purchase and the
resulting completed jobs. Pre-funded demand does not guarantee available
providers, profit, adoption or universal economic superiority.

## Bounded case

One `RescueCase` contains:

- one immutable, versioned descriptor;
- original provider identity;
- exactly two ordered component commitments;
- dependency, bid-close, award-close and recovery deadlines;
- at most six registered job IDs;
- original-delivery state;
- later, at most one awarded bundle.

The canonical order is:

`now < dependency_deadline < bid_close < award_close < recovery_deadline`

Every job final deadline must be later than the recovery deadline.

Offers and open mandates remain award-eligible until `award_close`.
Award is permitted only while `bid_close <= now < award_close`.

## Persistent records

### RescueJob

A job stores:

- case ID;
- buyer from `predecessor_account_id`;
- designated worker;
- worker reward and still-held reward;
- result profile and optional threshold;
- final deadline;
- `Funded`, `Accepted`, `Completed`, `Expired` or `Cancelled` phase.

### RescueMandate

The mandate uses the job ID as its public identifier and stores:

- original rescue cap;
- still-held rescue principal;
- `Open`, `Locked` or `Released` phase;
- locked bundle and allocation when awarded;
- terminal release reason.

Buyer ownership is derived from the immutable job. A second owner field is
not stored.

### RescueCase

The case stores bounded identifiers and state. Large global vectors and
iteration over every case are forbidden. A transition reads at most six jobs.

## Funding transaction

`create_funded_rescue_job` creates the job and its mandate in one payable
receipt.

Required attached value is exactly:

`worker_reward + rescue_cap + quoted_job_storage`

Both economic principals must be positive. Storage funding remains separate
from economic principal. A rejected call creates no record and consumes no ID.

The worker must accept before the dependency deadline. An unaccepted job
cannot sponsor recovery.

## Independent lifecycles

The worker reward and rescue mandate are separate authorities.

- Cancelling an unaccepted job credits reward and open cap to its buyer.
- Revoking an open mandate credits only its cap; the accepted worker job stays.
- A locked mandate cannot be revoked or released by award expiry.
- Job expiry credits any still-held worker reward to the buyer.
- Every terminal credit is replay-protected.

A job may fund at most one accepted recovery bundle.

## Sponsor selection

The award calculation uses every eligible accepted job with an open mandate.
The caller cannot choose a sponsor subset or submit allocations.

Capped-equal allocation remains deterministic. Only positive allocations
become bundle contributors. A zero allocation releases the whole cap and
receives no default-bond distribution.

## M3 liability

`rescue_escrow` equals every uncredited M3 economic principal:

- still-held worker rewards;
- open or locked mandate principal;
- later, open or locked M3 provider bonds.

After three buyers deposit worker reward 25 and cap 5:

`rescue_escrow = 3 * (25 + 5) = 90`

Internal locking does not change aggregate liability. Moving amount `z` from
M3 escrow to claimable must atomically perform:

`rescue_escrow -= z`
`claimable_total += z`
`claimable[owner] += z`

The same amount cannot appear in M2 collateral and M3 rescue escrow.

## Withdrawal backing

Before any M3 funding endpoint is enabled, withdrawal backing must include:

`economic_escrow`
`+ collateral_escrow`
`+ rescue_escrow`
`+ claimable_total`
`+ pending_total`
`+ storage_reserves`
`+ guarded physical storage stake`

Existing conservative M2 storage protection is preserved. M3-R2 does not
authorize a general storage refund.

## Storage responsibility

- Case creator: case descriptor, six job references, future bounded bundle and
  two bounded payloads.
- Job buyer: job, mandate and their largest valid lifecycle representation.
- Provider in R3: offer, bond record, slot lock and bounded payout state.
- Deployment treasury: WASM baseline and measured operating margin.

Quotes must be derived from bounded record sizes and checked with real Sandbox
storage measurements. The UI must display economic principal and storage
payment separately.

## Fresh state boundary

Adding root contract fields changes serialized state. M3 development and
testnet evidence use a fresh deployment. Replacing WASM over existing state is
not treated as migration.

## R2 implementation sequence

1. **R2-00:** lock this design and align active project documentation.
2. **R2-01:** add required R1 boundary regressions, root M3 schema with zero
   liability, withdrawal backing and storage measurement.
3. **R2-02:** add atomic funded job plus mandate, worker acceptance and views.
4. **R2-03:** add cancellation, revoke and expiry with one-time escrow credits.
5. **R2-04:** reproduce three independent buyers and workers in Sandbox.

## Required R2 evidence

- authenticated buyer and worker actions;
- exact attached deposit and storage admission;
- zero, overflow and aggregate-liability boundaries;
- six jobs accepted, seventh rejected;
- duplicate buyer and duplicate funding rejected;
- accept/cancel ordering has one valid outcome;
- open-cap revoke and replay protection;
- expiry boundary and permissionless trigger;
- M2 withdrawal cannot spend active M3 principal;
- multiple pending withdrawals preserve all liabilities;
- payout failure restores the original credit once;
- state reload preserves records and aggregates;
- Sandbox deposits and native refunds match the internal ledger;
- longest permitted identifiers stay within measured backing.

R2 does not claim bundle award, proof settlement, testnet operation or full
R01–R20 completion.
"""

worklog = """# M3-R2-00 — Storage and liability design

**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `d531cbc`
**State:** documentation scaffold created; review pending

## Purpose

Lock the persistent domain, deadlines, authority boundaries, storage funding
responsibility and complete M3 liability definition before contract mutation.

## Inputs

- `docs/M3_NORTH_STAR.md`
- `docs/M3_RESCUE_MARKET_SPEC.md`
- `docs/M3_R2_STORAGE_AND_LIABILITY.md`
- verified M3-R1 checkpoint and current M2 withdrawal implementation

## Command

`python3 scripts/m3/m3_r2_00_design.py`

## Outputs

- `docs/M3_R2_STORAGE_AND_LIABILITY.md`
- aligned active sections in AGENTS, STATUS and HANDOFF
- ADR-010
- M3 specification R2 clarification

## Verification

Pending review of the generated diff and `git diff --check`.

## Limitations

No Rust contract state, WASM, Sandbox transaction or testnet state changes in
R2-00.

## Exactly one next action

Review and commit R2-00, then begin R2-01 boundary tests and zero-liability
schema.
"""

agents = read("AGENTS.md")
agents = replace_once(
    agents,
    """Jelenlegi kapu: M3-R0. A következő kódváltozás kizárólag M3-R1 lehet. A korábbi 108 Rust-teszt és 11 Sandbox-suite dokumentált M2-bizonyíték; M3-R0-ban nem lett újrafuttatva.""",
    """Jelenlegi ellenőrzött kapu: M3-R1. A pure Rust allocation, clearing és settlement modell commitja `14dc877`; a dokumentációs átadás HEAD-je `d531cbc`. A következő ticket M3-R2, elsőként a persistent séma, a teljes M3 liability és a withdrawal backing rögzítésével. Bundle award, proof settlement és testnet működés még nincs igazolva.""",
    "AGENTS current gate",
)

status = read("docs/STATUS.md")
history_marker = "## M1 Final Gate — PASS"
history_index = status.index(history_marker)
status = """# STATUS — Prime Radiant / Nomogenesis

**Current state:** M3-R1 verified; M3-R2 design active
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Current documentation base:** `d531cbc`

| Area | Verified state |
|---|---|
| Product direction | Jointly funded rescue market approved |
| M3 executable specification | Written; R2 persistent rules being locked |
| M3 Rust domain model | 7 focused tests PASS at M3-R1 |
| Full Rust regression at M3-R1 | PASS |
| Clippy at M3-R1 | PASS |
| M3 persistent contract state | NOT IMPLEMENTED |
| M3 Sandbox/testnet evidence | NOT VERIFIED |
| Public testnet receipts | NOT VERIFIED |
| Production funds | NOT APPROVED |
| Hackathon submission ready | NO |

## Current gate

M3-R2 begins with the funded-job, rescue-mandate, storage and complete
`rescue_escrow` design. No M3 funding endpoint may be enabled until withdrawal
backing includes every held M3 principal.

Historical M1/M2 evidence follows. It remains evidence for earlier checkpoints,
not proof of M3.

""" + status[history_index:]

handoff = read("docs/HANDOFF.md")
handoff_marker = "## Munkamenetindító parancsok"
handoff_index = handoff.index(handoff_marker)
handoff = """# Élő munkamenet-átadás — minden fejlesztési session végén frissítendő

## Current M3 checkpoint — 2026-11-04

- Branch: `feat/m2-escrow`
- HEAD before R2-00: `d531cbc`
- Verified implementation: M3-R1 pure Rust domain model
- Focused M3-R1 tests: 7 PASS
- Full Rust regression, Clippy and diff check: PASS
- Preserve untracked: `sandbox/real_low_margin_audit.cjs`
- Active ticket: M3-R2-00 persistent storage and liability design
- Authoritative R2 design: `docs/M3_R2_STORAGE_AND_LIABILITY.md`
- Next single action: review and commit R2-00, then start R2-01 boundary tests

M3 persistent state, bundle award, proof settlement and testnet evidence are
not yet implemented.

""" + handoff[handoff_index:]

decisions = read("docs/DECISIONS.md")
if "### ADR-010" in decisions:
    raise RuntimeError("ADR-010 already exists")
decisions += """
### ADR-010 — 2026-11-04 — Teljes M3 principal egy rescue liability-ben
**Állapot: Elfogadva.** A `rescue_escrow` minden még jóvá nem írt M3 gazdasági
principalt védi: worker-díjat, nyitott vagy zárolt mandate-pénzt és később az
M3 provider-bondokat. Belső allokáció nem változtatja az aggregált liability-t.
Claimable kredit ugyanazzal az összeggel csökkenti. Az M3 funding bekapcsolása
előtt a withdrawal backing ezt a meglévő M2 kötelezettségeken felül tartalmazza.
Storage-hozzájárulás nem számít gazdasági principalnak.
"""

spec = read("docs/M3_RESCUE_MARKET_SPEC.md")
if "## 12. M3-R2 persistent boundary" in spec:
    raise RuntimeError("M3-R2 specification section already exists")
spec += """
## 12. M3-R2 persistent boundary

A canonical `RescueCase` binds the original provider, exactly two ordered
component commitments and the shared deadlines.

Timeline:

`dependency_deadline < bid_close < award_close < recovery_deadline < final_job_deadline`

Jobs enroll and workers accept before the dependency deadline. Clearing is
allowed only during `[bid_close, award_close)`. Open mandates and offers remain
eligible until `award_close`.

A funded job and its mandate are created atomically from an exact attached
deposit containing worker reward, rescue cap and separately quoted storage.
Worker reward and rescue authority have independent state transitions.

`rescue_escrow` includes every still-held M3 worker reward, mandate principal
and later M3 provider bond. Internal allocation does not change it. Moving value
to claimables decreases it by exactly the credited amount.

The complete record, transition and storage policy is normative in
`docs/M3_R2_STORAGE_AND_LIABILITY.md`.
"""

outputs = {
    "docs/M3_R2_STORAGE_AND_LIABILITY.md": design,
    "docs/worklog/M3-R2-00-design.md": worklog,
    "AGENTS.md": agents,
    "docs/STATUS.md": status,
    "docs/HANDOFF.md": handoff,
    "docs/DECISIONS.md": decisions,
    "docs/M3_RESCUE_MARKET_SPEC.md": spec,
}

for name, content in outputs.items():
    if not content.endswith("\n"):
        content += "\n"
    if any(line.rstrip() != line for line in content.splitlines()):
        raise RuntimeError(f"trailing whitespace generated in {name}")

for name, content in outputs.items():
    path = Path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

print("M3-R2-00 SCAFFOLD PASS")
for name in outputs:
    print(name)
