# M3-R3 — Provider market and atomic RecoveryRight award

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
