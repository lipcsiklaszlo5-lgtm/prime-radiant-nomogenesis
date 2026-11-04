from pathlib import Path
import subprocess
import sys

BASE = "643e19c"
AUDIT = "?? sandbox/real_low_margin_audit.cjs"
SELF = "?? scripts/m3/m3_r3_00_design.py"

def fail(message: str) -> None:
    print(f"M3-R3-00 DESIGN FAIL: {message}")
    sys.exit(2)

def read(name: str) -> str:
    return Path(name).read_text(encoding="utf-8")

def write(name: str, content: str) -> None:
    path = Path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")

def replace_between(
    text: str,
    start: str,
    end: str,
    replacement: str,
    name: str,
) -> str:
    if text.count(start) != 1:
        fail(f"{name}: start marker is not unique")
    if text.count(end) != 1:
        fail(f"{name}: end marker is not unique")

    left = text.index(start)
    right = text.index(end, left)

    return (
        text[:left]
        + replacement.strip()
        + "\n\n"
        + text[right:]
    )

branch = subprocess.check_output(
    ["git", "branch", "--show-current"], text=True
).strip()
head = subprocess.check_output(
    ["git", "rev-parse", "--short", "HEAD"], text=True
).strip()
status = set(
    subprocess.check_output(
        ["git", "status", "--porcelain"], text=True
    ).splitlines()
)

if branch != "feat/m2-escrow":
    fail(f"unexpected branch: {branch}")
if head != BASE:
    fail(f"unexpected HEAD: {head}")
if status != {AUDIT, SELF}:
    fail(f"unexpected worktree status: {sorted(status)}")

for name in (
    "docs/M3_R3_PROVIDER_MARKET_AND_AWARD.md",
    "docs/worklog/M3-R3-00-design.md",
):
    if Path(name).exists():
        fail(f"target already exists: {name}")

design = r'''# M3-R3 — Provider market and atomic RecoveryRight award

**Status:** approved implementation design
**Base checkpoint:** `643e19c`
**Date:** 2026-11-04

## 1. Product event

R2 proves that several independently owned jobs can pre-fund bounded recovery
authority. R3 adds the complementary supply side.

Before award, the system contains:

- funded jobs;
- accepted workers;
- open buyer mandates;
- individually funded provider offers;
- unreserved capacity declarations.

These facts do not guarantee recovery.

A binding `RecoveryRight` exists only when one transaction atomically locks:

1. a complete two-component provider pair;
2. deterministic buyer allocations totaling the bundle price;
3. the full bundle price as bond from each selected provider;
4. two exclusive provider-capacity slots;
5. one recovery deadline;
6. one immutable bundle record.

If any element cannot be locked, no partial right exists.

## 2. Bounded market

One rescue case contains at most:

- six funded jobs;
- six provider offers;
- two required components;
- one awarded bundle;
- six sponsoring allocations;
- two selected providers;
- one slot per selected provider.

Selected providers must differ.

No token, lending, shared collateral, partial bundle, caller-selected sponsor
subset or general combinatorial optimizer is introduced.

## 3. Timeline

The canonical order remains:

`dependency_deadline < bid_close < award_close < recovery_deadline < final_job_deadline`

Transitions:

- provider offer posting: `now < bid_close`;
- provider cancellation: `now < bid_close`;
- atomic clearing: `bid_close <= now < award_close`;
- unselected open-offer release: after case award or `now >= award_close`;
- recovery proof: `now < recovery_deadline`;
- recovery default finalization: `now >= recovery_deadline`.

There is no timestamp where offer withdrawal and award are both valid.

## 4. Persistent records

### RescueOffer

A provider offer stores:

- offer ID;
- case ID;
- component index, exactly 0 or 1;
- provider from `predecessor_account_id`;
- bounded slot identifier;
- component fee;
- original deposited bond capacity;
- still-held bond principal;
- `Open`, `Locked`, `Released`, `Proven` or `Defaulted` phase;
- optional locked bundle ID;
- terminal release reason.

The offer inherits the case recovery deadline. It cannot substitute another
case or component after creation.

### RescueBundle

A bundle stores:

- bundle ID;
- case ID;
- two selected offer IDs in component order;
- total price `Q`;
- sorted sponsor allocations;
- recovery deadline;
- `Awarded`, `SettledSuccess` or `SettledDefault` phase;
- later, component proof outcomes.

The sponsor list is derived by the contract. The award caller cannot submit it.

### RescueCase extension

The case receives:

- at most six offer IDs;
- one optional awarded bundle ID.

The maximum serialized case size and case storage quote must be revised before
the schema endpoint is enabled.

## 5. Offer admission

`post_rescue_offer` is payable.

Required attached value is exactly:

`bond_capacity + quoted_offer_storage`

Admission requires:

- case exists and is `Open`;
- `now < bid_close`;
- component index is 0 or 1;
- provider is not the contract or failed original provider;
- fee is positive;
- bond capacity is at least the offer's own fee;
- slot identifier is nonempty, bounded and canonical;
- provider has no other open offer for the same case and component;
- case has fewer than six offers;
- checked ID, escrow and storage arithmetic.

The complete bond capacity is deposited immediately into `rescue_escrow`.
Each offer owns separate principal. Bond capacity cannot be referenced or
reused by another offer.

A posted offer is funded supply, but its capacity slot is not reserved yet.
The slot becomes binding only through complete bundle award.

## 6. Sponsor eligibility

Clearing reads the case's at most six job IDs.

A job sponsors only when:

- its phase is `Accepted`;
- its mandate phase is `Open`;
- its held mandate principal is positive;
- it belongs to the case;
- it has not funded another bundle.

Every eligible mandate participates. The caller cannot choose or exclude a
sponsor.

## 7. Pair eligibility and deterministic clearing

The contract enumerates every component-0/component-1 pair. At six offers the
search is bounded.

A pair is eligible only when:

- both offers are `Open`;
- they belong to the case;
- they cover different required components;
- providers differ;
- `Q = fee_0 + fee_1` does not overflow;
- both held bond capacities are at least `Q`;
- combined eligible mandate principal is at least `Q`;
- both provider-slot keys are free in the unified capacity registry;
- recovery deadline is still open.

The winning pair is the lowest `Q`.

Equal prices use ascending `(component_0_offer_id, component_1_offer_id)`.

A cheaper under-bonded, conflicting or malformed pair is filtered out before
comparison and cannot block an admissible pair.

## 8. Cost allocation

The existing capped-equal algorithm remains normative.

For price `Q` and caps `c_i`, allocations `x_i` satisfy:

- `sum(x_i) = Q`;
- `0 <= x_i <= c_i`;
- rows sorted by job ID;
- saturated caps leave the active set;
- indivisible remainder units go in ascending job-ID order.

Positive allocations become bundle sponsors.

For each positive allocation:

- mandate phase becomes `Locked`;
- held mandate principal becomes the allocation;
- bundle ID and allocation are stored;
- unused cap is credited to the immutable buyer.

For a zero allocation:

- the entire cap is credited to the buyer;
- mandate becomes `Released`;
- reason becomes `ZeroAllocation`;
- it is not a bundle sponsor.

## 9. Provider bond locking

For each selected provider:

- exactly `Q` remains held as bundle bond;
- offer phase becomes `Locked`;
- locked bundle ID is stored;
- excess bond capacity is credited to that provider.

The selected providers therefore contribute `2Q` of locked bond principal.

Unselected offers remain separately funded until their release path runs.

## 10. Atomic award

`award_rescue_bundle(case_id)` is permissionless and accepts no offer IDs,
sponsor IDs, allocations or price from the caller.

Before mutation it computes and validates:

- eligible sponsors;
- eligible offer pairs;
- winning price and pair;
- capped-equal allocations;
- all buyer and provider credits;
- next escrow and claimable totals;
- next bundle ID;
- both capacity-lock insertions;
- maximum record limits.

The successful transaction then atomically writes:

- the immutable bundle;
- case phase and awarded bundle ID;
- mandate locks and unused-cap releases;
- selected offer locks and excess-bond releases;
- two typed capacity locks;
- updated `rescue_escrow`;
- authenticated claimables.

Any failure leaves every record, ID, slot and aggregate unchanged.

## 11. Unified M2/M3 capacity registry

R3 replaces the untyped M2-only slot value with a typed owner:

- `M2Offer(offer_id)`;
- `M3RescueOffer(offer_id)`.

Both markets use the same canonical provider-plus-slot key.

M2 selection must reject an M3-held slot. M3 award must reject an M2-held slot.
Removal requires the exact typed owner; one market cannot release the other's
capacity.

The existing M2 `slot_holder` view may continue returning only M2 offer IDs.
A new typed capacity-lock view exposes the complete owner.

This persistent schema change is valid only on a fresh deployment. R3 does not
claim migration compatibility with older deployed state.

## 12. Liability accounting

`rescue_escrow` includes:

- still-held worker rewards;
- open or locked mandate principal;
- open or locked provider bonds.

Offer posting increases it by bond capacity.

Award itself does not create principal. It may decrease `rescue_escrow` only
by crediting:

- unused mandate caps;
- zero-allocation caps;
- excess selected-provider bond capacity.

For every credit `z`:

`rescue_escrow -= z`
`claimable_total += z`
`claimable[owner] += z`

Internal locking never changes aggregate liability.

## 13. Reference economic example

Three buyers each deposit:

- worker reward 25;
- rescue cap 5.

Two providers offer fees 6 and 6 and each deposits bond capacity 12.

Before award:

- worker rewards: 75;
- buyer rescue caps: 15;
- provider bonds: 24;
- `rescue_escrow = 114`.

The winning bundle price is `Q = 12`.

Capped-equal allocations are 4, 4 and 4.

Award credits one unused cap unit to each buyer:

- claimables: 3;
- locked buyer allocations: 12;
- locked provider bonds: 24;
- still-held worker rewards: 75;
- `rescue_escrow = 111`.

Conservation:

`111 rescue_escrow + 3 claimable = 114 original principal`

The binding RecoveryRight controls the 12 buyer allocation and two 12-unit
provider bonds. Worker rewards remain an independent job liability.

## 14. Storage responsibility

Case creator funds a revised bounded case quote covering:

- six job references;
- six offer references;
- the maximum bundle record;
- two bounded future proof payloads.

Provider offer storage funding covers:

- maximum offer record;
- provider claimable record;
- one future typed capacity-lock record;
- terminal offer representation.

Storage payment remains separate from economic principal.

No general storage refund is introduced in R3.

## 15. Release paths

Before bid close, only the provider may cancel an open offer.

After award close, any caller may release an open offer.

After a case is awarded, any caller may release an unselected open offer.

Each release:

- credits only the stored provider;
- reduces `rescue_escrow` by held bond principal;
- marks the offer terminal;
- rejects replay.

A selected or locked offer cannot use an open-offer release path.

## 16. Threat boundaries

R3 must test:

- cheap under-bonded offer cannot block funded pair;
- same provider cannot fill both components;
- insufficient sponsor caps leave all state unchanged;
- reused mandate cannot sponsor twice;
- duplicate job or offer IDs are rejected;
- M2 slot blocks M3 award;
- M3 slot blocks M2 selection;
- one market cannot release the other market's lock;
- provider cannot withdraw after bid close;
- caller cannot choose pair, sponsors, allocations or recipient;
- overflow leaves IDs, records, slots and aggregates unchanged;
- replayed award creates no second bundle or credit;
- state reload preserves bundle, locks and totals.

## 17. Implementation sequence

1. **R3-00:** lock this design and financial invariants.
2. **R3-01:** persistent offer, bundle and typed capacity-lock schema.
3. **R3-02:** payable provider-offer admission and terminal release.
4. **R3-03:** deterministic on-chain clearing and atomic award.
5. **R3-04:** local Sandbox award with three buyers and two providers.
6. **R3-05:** rerun M2 Sandbox slot regressions on the unified registry.

R3 does not implement component proofs or bundle settlement. Those belong to
R4.
'''

worklog = r'''# M3-R3-00 — provider market and atomic award design

**Status:** documentation checkpoint
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `643e19c`

## Purpose

Lock the supply-side records, funding rules, deterministic clearing and
cross-market capacity boundary before persistent R3 implementation.

## Product decision

Pre-funded buyer mandates and funded provider offers remain nonbinding market
inputs.

A binding `RecoveryRight` is created only by a complete atomic award that locks:

- deterministic buyer allocations;
- two distinct funded providers;
- full bundle-price bond from each provider;
- two typed exclusive capacity slots;
- one recovery deadline;
- one immutable bundle record.

## Key engineering decisions

- maximum six offers and six sponsors;
- exactly two components and two distinct selected providers;
- provider bond capacity is deposited per offer;
- no shared bond reuse;
- award caller supplies only the case ID;
- pair, price, sponsors and allocations are contract-derived;
- capped-equal allocation remains normative;
- M2 and M3 share one typed capacity registry;
- R3 uses fresh deployment state;
- case and offer storage quotes are revised before funding endpoints.

## Files

- `docs/M3_R3_PROVIDER_MARKET_AND_AWARD.md`
- `docs/M3_RESCUE_MARKET_SPEC.md`
- `docs/DECISIONS.md`
- `AGENTS.md`
- `docs/STATUS.md`
- `docs/HANDOFF.md`
- `docs/worklog/M3-R3-00-design.md`
- `scripts/m3/m3_r3_00_design.py`

## Verification

Documentation-only checkpoint. No Rust, WASM or Sandbox execution is claimed.

Required checks:

- exact intended file set;
- unique ADR identifiers;
- required design sections;
- no false implementation claim;
- `git diff --check`.

## Next single action

M3-R3-01 persistent offer, bundle and typed capacity-lock schema with zero new
economic liability.
'''

decisions_path = Path("docs/DECISIONS.md")
decisions = read(str(decisions_path))

if "ADR-011" in decisions or "ADR-012" in decisions:
    fail("R3 ADR identifier already exists")

decisions += r'''

### ADR-011 — 2026-11-04 — RecoveryRight csak teljes atomi awarddal
**Állapot: Elfogadva.** A pre-funded mandate és a funded provider offer még nem
garantált helyreállítás. Kötelező RecoveryRight csak akkor jön létre, ha egy
tranzakció egyszerre zárolja a teljes kétkomponensű provider-párt, a
determinisztikus buyer-allokációkat, mindkét provider teljes Q bondját, a két
exkluzív kapacitásslotot és a recovery deadline-t. Részleges award nem maradhat
állapotban.

### ADR-012 — 2026-11-04 — Egyetlen típusos M2/M3 kapacitásregiszter
**Állapot: Elfogadva.** Az M2 option és az M3 rescue offer ugyanazt a
provider-plus-slot kulcsú, típusos lock-regisztert használja. A lock tulajdonosa
`M2Offer` vagy `M3RescueOffer`. Mindkét piac ellenőrzi a másik foglalását, és
csak a pontos típusos tulajdonos oldhatja fel. A változás fresh-state R3
deploymentet igényel; korábbi állapot migrációja nincs állítva.
'''

spec_path = Path("docs/M3_RESCUE_MARKET_SPEC.md")
spec = read(str(spec_path))

if "## 13. M3-R3 provider market" in spec:
    fail("R3 specification section already exists")

spec += r'''

## 13. M3-R3 provider market and binding award

An M3 provider offer deposits independent bond capacity plus separately quoted
storage before bid close. Bond capacity belongs to one offer and cannot secure
another offer.

Clearing is permissionless during `[bid_close, award_close)`. The caller
supplies only the case ID. The contract derives eligible accepted jobs, open
mandates, admissible complementary offer pairs, the winning price and
capped-equal allocations.

A binding RecoveryRight exists only after one atomic transaction locks:

- one offer for each component;
- two distinct providers;
- deterministic buyer allocations totaling `Q`;
- exactly `Q` of bond from each provider;
- two exclusive typed capacity slots;
- one immutable bundle and recovery deadline.

The lowest admissible price wins. Equal prices use ascending offer-ID pairs.
Under-bonded, slot-conflicting and malformed pairs are filtered before price
comparison.

M2 and M3 use one typed capacity registry on fresh state. R3 does not claim
migration compatibility.

Normative records, liability transitions, storage ownership and release paths
are defined in `docs/M3_R3_PROVIDER_MARKET_AND_AWARD.md`.
'''

agents_path = Path("AGENTS.md")
agents = read(str(agents_path))

old_gate = """Jelenlegi ellenőrzött kapu: M3-R1. A pure Rust allocation, clearing és settlement modell commitja `14dc877`; a dokumentációs átadás HEAD-je `d531cbc`. A következő ticket M3-R2, elsőként a persistent séma, a teljes M3 liability és a withdrawal backing rögzítésével. Bundle award, proof settlement és testnet működés még nincs igazolva."""
new_gate = """Jelenlegi ellenőrzött kapu: M3-R2. A funded job, mandate, külön rescue liability, replay-safe release és multi-party local Sandbox checkpoint commitja `643e19c`. A következő ticket M3-R3, elsőként a provider offer, teljes bond, típusos M2/M3 capacity lock és atomi bundle award sémájával. Bundle award, proof settlement és public testnet működés még nincs igazolva."""

if agents.count(old_gate) != 1:
    fail("AGENTS current-gate paragraph not found exactly once")

agents = agents.replace(old_gate, new_gate, 1)

handoff_path = Path("docs/HANDOFF.md")
handoff = read(str(handoff_path))

handoff_top = """
## Current M3 checkpoint — 2026-11-04

- Branch: `feat/m2-escrow`
- Verified implementation base: `643e19c`
- M3-R2 funding, liability and local Sandbox milestone: COMPLETE
- Active ticket: M3-R3-00 provider-market and atomic-award design
- Binding product object: one atomic `RecoveryRight`
- Award caller will supply only the case ID
- Pair, price, sponsors and allocations are contract-derived
- Selected providers must be distinct
- Each selected provider locks the complete bundle price `Q`
- Provider bond capacity is funded per offer; no collateral reuse
- Buyer allocation uses deterministic capped-equal sharing
- M2 and M3 will share one typed capacity-lock registry
- R3 state uses a fresh deployment boundary
- Case and offer storage quotes must be revised before funding
- Preserve untracked: `sandbox/real_low_margin_audit.cjs`
- No R3 Rust implementation or award claim exists yet
- Next single action: M3-R3-01 zero-liability persistent schema

R2 already proves multi-party funded demand and safe capital release on local
NEAR Sandbox. R3 creates the complementary provider market. The decisive
economic transition is not offer posting: it is the atomic conversion of
separate buyer mandates and provider bond capacities into one fully backed,
capacity-locked RecoveryRight.

The design does not claim provider availability, successful recovery,
settlement, public testnet operation or production safety.
"""

handoff = replace_between(
    handoff,
    "## Current M3 checkpoint — 2026-11-04",
    "## Munkamenetindító parancsok",
    handoff_top,
    "docs/HANDOFF.md",
)

session_marker = "## Session napló (append-only)"
session_title = (
    "### 2026-11-04 — M3-R3-00 provider market design"
)

if handoff.count(session_marker) != 1:
    fail("HANDOFF session marker is not unique")
if session_title in handoff:
    fail("HANDOFF R3-00 entry already exists")

session_entry = """
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
"""

handoff = handoff.replace(
    session_marker,
    session_marker + "\n\n" + session_entry.strip(),
    1,
)

status_path = Path("docs/STATUS.md")
status_text = read(str(status_path))
historical_marker = "## M1 Final Gate — PASS"

if status_text.count(historical_marker) != 1:
    fail("STATUS historical marker is not unique")

historical_tail = status_text.split(
    historical_marker, 1
)[1]

status_prefix = """
# STATUS — Prime Radiant / Nomogenesis

**Current state:** M3-R2 verified; M3-R3 design locked
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Verified implementation base:** `643e19c`
**Active documentation ticket:** M3-R3-00

| Area | Verified state |
|---|---|
| R2 funded demand and liability | COMPLETE |
| R2 local multi-party Sandbox | PASS |
| Native Rust regression | 168 tests PASS at `3bfb9cb` |
| Provider-market design | LOCKED |
| Binding RecoveryRight boundary | SPECIFIED |
| Provider offer schema | NOT IMPLEMENTED |
| Provider bond admission | NOT IMPLEMENTED |
| Unified M2/M3 capacity registry | NOT IMPLEMENTED |
| Atomic bundle award | NOT IMPLEMENTED |
| Recovery proof settlement | NOT IMPLEMENTED |
| Public testnet evidence | NOT VERIFIED |
| Production funds | NOT APPROVED |
| Hackathon submission ready | NO |

## Current gate

M3-R3-00 defines the supply side without claiming it exists in Rust. A funded
offer is not yet a capacity guarantee. A binding RecoveryRight will exist only
after atomic award locks deterministic buyer allocations, two distinct
providers' complete `Q` bonds, two exclusive slots and one deadline.

The award caller cannot choose the winning offers, sponsors, allocations or
credit recipients.

Historical M1/M2 evidence follows. It remains evidence for earlier checkpoints,
not proof of R3 implementation.

## Next task

M3-R3-01: add zero-liability persistent RescueOffer, RescueBundle and typed
capacity-lock schema. Preserve all M2 behavior and prove empty-state,
serialization-bound and cross-lock regressions before enabling provider funds.

## Frissítési szabály

Minden új mérföldkőnél rögzíteni kell a pontos commitot,
lefuttatott parancsokat, bizonyított PASS/FAIL eredményeket
és a még NEM igazolt állításokat. A dokumentációs commit
SHA-ja eltérhet a fent megjelölt auditált Rust checkpointtól.
"""

status_text = (
    status_prefix.strip()
    + "\n\n"
    + historical_marker
    + historical_tail
)

write(
    "docs/M3_R3_PROVIDER_MARKET_AND_AWARD.md",
    design,
)
write("docs/worklog/M3-R3-00-design.md", worklog)
write(str(decisions_path), decisions)
write(str(spec_path), spec)
write(str(agents_path), agents)
write(str(handoff_path), handoff)
write(str(status_path), status_text)

print("M3-R3-00 DESIGN PASS")
for name in (
    "docs/M3_R3_PROVIDER_MARKET_AND_AWARD.md",
    "docs/worklog/M3-R3-00-design.md",
    "docs/DECISIONS.md",
    "docs/M3_RESCUE_MARKET_SPEC.md",
    "AGENTS.md",
    "docs/HANDOFF.md",
    "docs/STATUS.md",
    "scripts/m3/m3_r3_00_design.py",
):
    print(name)
