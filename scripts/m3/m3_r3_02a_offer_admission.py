"""Reproduce the R3-02A provider admission implementation."""
from pathlib import Path
import subprocess
import sys

PATCH = r"""diff --git a/docs/HANDOFF.md b/docs/HANDOFF.md
index c8b7bd1..135a0f4 100644
--- a/docs/HANDOFF.md
+++ b/docs/HANDOFF.md
@@ -13,7 +13,8 @@
 - M2 primary, backup, settlement and M3-R2 Sandbox: PASS.
 - Preserve untracked `sandbox/real_low_margin_audit.cjs`.
 - Offer funding, bond release, bundle award and public testnet: not verified.
-- Next single action: M3-R3-02A payable provider offer admission.
+- Active ticket: M3-R3-02A funded provider offer admission; verification pending.
+- Next single action: run focused provider-admission tests.
\x20
 ## Munkamenetindító parancsok
\x20
diff --git a/docs/worklog/M3-R3-02A-offer-admission.md b/docs/worklog/M3-R3-02A-offer-admission.md
new file mode 100644
index 0000000..b09fa03
--- /dev/null
+++ b/docs/worklog/M3-R3-02A-offer-admission.md
@@ -0,0 +1,35 @@
+# M3-R3-02A — funded provider offers
+
+**Base:** `314d44b` on `feat/m2-escrow`.
+**Status:** scaffolded; tests pending.
+
+## Purpose
+
+Create individually funded provider offers with bounded slot declarations.
+Posting adds the provider's full bond capacity to `rescue_escrow`; the storage
+deposit stays in `storage_reserves`. The shared capacity registry is unchanged
+until a complete bundle is awarded.
+
+## Inputs and outputs
+
+Input: case ID, component index, slot ID, fee and bond capacity. The contract
+derives the provider from the predecessor. Output: one persistent offer ID,
+one case offer reference and two separate liability increments.
+
+## Exact command and observed result
+
+`python3 -B scripts/m3/m3_r3_02a_offer_admission.py`
+
+Pending user execution, focused tests and exit codes. Do not mark PASS yet.
+
+## Changed files
+
+`src/rescue.rs`, `src/lib.rs`, `src/rescue_offer_tests.rs`, `docs/HANDOFF.md`,
+this worklog and the Python builder.
+
+## Limitations and next action
+
+Posting does not reserve a slot or bind a RecoveryRight. No release or award
+transition exists yet. Run focused offer tests, then full Rust, Clippy, WASM
+and relevant Sandboxes before committing. Next ticket after verification:
+R3-02B terminal offer release.
diff --git a/src/lib.rs b/src/lib.rs
index 645ad00..8777459 100644
--- a/src/lib.rs
+++ b/src/lib.rs
@@ -724,6 +724,105 @@ impl Nomogenesis {
         self.rescue_offers.get(&offer_id).is_some()
     }
\x20
+    pub fn get_rescue_offer(&self, offer_id: u64) -> Option<rescue::RescueOfferView> {
+        self.rescue_offers
+            .get(&offer_id)
+            .map(rescue::RescueOfferView::from)
+    }
+
+    #[payable]
+    pub fn post_rescue_offer(&mut self, input: rescue::RescueOfferInput) -> u64 {
+        let provider = env::predecessor_account_id();
+        let now = env::block_timestamp();
+        let case_id = rescue::parse_case_id(input.case_id).expect("invalid rescue case ID");
+        let mut case = self
+            .rescue_cases
+            .get(&case_id)
+            .cloned()
+            .expect("unknown rescue case");
+
+        assert_eq!(case.phase, rescue::RescueCasePhase::Open, "case is not open");
+        assert!(now < case.bid_close, "bid close reached");
+        assert!(
+            usize::from(input.component_index) < rescue::COMPONENT_COUNT,
+            "invalid rescue component"
+        );
+        assert_ne!(provider, env::current_account_id(), "contract cannot offer");
+        assert_ne!(provider, case.original_provider, "original provider cannot offer");
+        assert!(input.fee.0 > 0, "zero rescue fee");
+        assert!(input.bond_capacity.0 >= input.fee.0, "insufficient bond capacity");
+        assert!(
+            !input.slot_id.is_empty()
+                && input.slot_id.len() <= rescue::MAX_RESCUE_SLOT_BYTES
+                && input
+                    .slot_id
+                    .bytes()
+                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
+            "invalid rescue slot"
+        );
+        assert!(case.offer_ids.len() < rescue::MAX_RESCUE_OFFERS, "case offers full");
+
+        for existing_id in &case.offer_ids {
+            let existing = self
+                .rescue_offers
+                .get(existing_id)
+                .expect("case offer index is corrupt");
+            assert!(
+                existing.provider != provider
+                    || existing.component_index != input.component_index
+                    || existing.phase != rescue::RescueOfferPhase::Open,
+                "provider already has open offer for component"
+            );
+        }
+
+        let storage_payment = rescue::offer_storage_cost();
+        let required = input
+            .bond_capacity
+            .0
+            .checked_add(storage_payment)
+            .expect("offer deposit overflow");
+        assert_eq!(
+            env::attached_deposit().as_yoctonear(),
+            required,
+            "incorrect funded rescue offer deposit"
+        );
+
+        let id = self.next_rescue_offer_id;
+        let next_id = id.checked_add(1).expect("rescue offer ID overflow");
+        assert!(self.rescue_offers.get(&id).is_none(), "offer ID already used");
+        let next_escrow = self
+            .rescue_escrow
+            .checked_add(input.bond_capacity.0)
+            .expect("rescue escrow overflow");
+        let next_storage = self
+            .storage_reserves
+            .checked_add(storage_payment)
+            .expect("storage reserve overflow");
+
+        case.offer_ids.push(id);
+        self.rescue_offers.insert(
+            id,
+            rescue::RescueOffer {
+                id,
+                case_id,
+                component_index: input.component_index,
+                provider,
+                slot_id: input.slot_id,
+                fee: input.fee.0,
+                bond_capacity: input.bond_capacity.0,
+                held_bond: input.bond_capacity.0,
+                phase: rescue::RescueOfferPhase::Open,
+                locked_bundle_id: None,
+                release_reason: None,
+            },
+        );
+        self.rescue_cases.insert(case_id, case);
+        self.next_rescue_offer_id = next_id;
+        self.rescue_escrow = next_escrow;
+        self.storage_reserves = next_storage;
+        id
+    }
+
     pub fn has_rescue_bundle(&self, bundle_id: u64) -> bool {
         self.rescue_bundles.get(&bundle_id).is_some()
     }
@@ -1572,6 +1671,9 @@ mod withdrawal_tests;
 #[cfg(test)]
 mod rescue_schema_tests;
\x20
+#[cfg(test)]
+mod rescue_offer_tests;
+
 #[cfg(test)]
 mod rescue_case_tests;
\x20
diff --git a/src/rescue.rs b/src/rescue.rs
index 7472d54..b3e744e 100644
--- a/src/rescue.rs
+++ b/src/rescue.rs
@@ -95,6 +95,50 @@ pub struct RescueOffer {
     pub release_reason: Option<RescueOfferReleaseReason>,
 }
\x20
+#[near(serializers = [json])]
+#[derive(Debug, Clone, PartialEq, Eq)]
+pub struct RescueOfferInput {
+    pub case_id: Vec<u8>,
+    pub component_index: u8,
+    pub slot_id: String,
+    pub fee: U128,
+    pub bond_capacity: U128,
+}
+
+#[near(serializers = [json])]
+#[derive(Debug, Clone, PartialEq, Eq)]
+pub struct RescueOfferView {
+    pub id: u64,
+    pub case_id: Vec<u8>,
+    pub component_index: u8,
+    pub provider: AccountId,
+    pub slot_id: String,
+    pub fee: U128,
+    pub bond_capacity: U128,
+    pub held_bond: U128,
+    pub phase: RescueOfferPhase,
+    pub locked_bundle_id: Option<u64>,
+    pub release_reason: Option<RescueOfferReleaseReason>,
+}
+
+impl From<&RescueOffer> for RescueOfferView {
+    fn from(value: &RescueOffer) -> Self {
+        Self {
+            id: value.id,
+            case_id: value.case_id.to_vec(),
+            component_index: value.component_index,
+            provider: value.provider.clone(),
+            slot_id: value.slot_id.clone(),
+            fee: U128(value.fee),
+            bond_capacity: U128(value.bond_capacity),
+            held_bond: U128(value.held_bond),
+            phase: value.phase.clone(),
+            locked_bundle_id: value.locked_bundle_id,
+            release_reason: value.release_reason.clone(),
+        }
+    }
+}
+
 #[near(serializers = [borsh, json])]
 #[derive(Debug, Clone, PartialEq, Eq)]
 pub enum RescueBundlePhase {
diff --git a/src/rescue_offer_tests.rs b/src/rescue_offer_tests.rs
new file mode 100644
index 0000000..7ecaddf
--- /dev/null
+++ b/src/rescue_offer_tests.rs
@@ -0,0 +1,217 @@
+use super::*;
+use crate::rescue::{RescueCaseDescriptorInput, RescueCasePhase, RescueOfferInput, RescueOfferPhase};
+use near_sdk::{NearToken, test_utils::VMContextBuilder, testing_env};
+use std::panic::{AssertUnwindSafe, catch_unwind};
+
+fn account(name: &str) -> AccountId {
+    name.parse().unwrap()
+}
+
+fn context(actor: &str, now: u64, deposit: u128) {
+    let mut builder = VMContextBuilder::new();
+    builder
+        .current_account_id(account("contract.near"))
+        .signer_account_id(account(actor))
+        .predecessor_account_id(account(actor))
+        .block_timestamp(now)
+        .attached_deposit(NearToken::from_yoctonear(deposit))
+        .account_balance(NearToken::from_near(100));
+    testing_env!(builder.build());
+}
+
+fn rejected<T>(call: impl FnOnce() -> T) {
+    assert!(catch_unwind(AssertUnwindSafe(call)).is_err());
+}
+
+fn create_case(c: &mut Nomogenesis) -> Vec<u8> {
+    context("creator.near", 100, 0);
+    let quote = c.m3_storage_quote().case_storage_cost.0;
+    context("creator.near", 100, quote);
+    let id = c.create_rescue_case(RescueCaseDescriptorInput {
+        descriptor_version: 1,
+        original_provider: account("source.near"),
+        component_commitments: vec![vec![1; 32], vec![2; 32]],
+        dependency_deadline: 200,
+        bid_close: 220,
+        award_close: 240,
+        recovery_deadline: 260,
+    });
+    c.rescue_cases.flush();
+    id
+}
+
+fn input(case_id: Vec<u8>, component_index: u8, fee: u128, bond: u128) -> RescueOfferInput {
+    RescueOfferInput {
+        case_id,
+        component_index,
+        slot_id: "slot_1".to_owned(),
+        fee: U128(fee),
+        bond_capacity: U128(bond),
+    }
+}
+
+fn post(c: &mut Nomogenesis, case_id: Vec<u8>, provider: &str, component: u8) -> u64 {
+    context(provider, 205, 12 + crate::rescue::offer_storage_cost());
+    c.post_rescue_offer(input(case_id, component, 6, 12))
+}
+
+#[test]
+fn funded_offer_tracks_own_bond_without_reserving_slot() {
+    let mut c = Nomogenesis::default();
+    let case_id = create_case(&mut c);
+    let quote = c.m3_storage_quote().offer_storage_cost.0;
+    context("provider.near", 205, quote + 12);
+    let before = env::storage_usage();
+    let id = c.post_rescue_offer(input(case_id.clone(), 0, 6, 12));
+    c.rescue_cases.flush();
+    c.rescue_offers.flush();
+    let measured = env::storage_usage() - before;
+
+    assert_eq!(id, 0);
+    assert!(measured > 0 && measured <= crate::rescue::OFFER_STORAGE_BYTES);
+    assert_eq!(c.m3_storage_quote().offer_storage_bytes, 613);
+    assert_eq!(c.storage_reserves, crate::rescue::case_storage_cost() + quote);
+    assert_eq!(c.rescue_escrow_total(), U128(12));
+    assert_eq!(c.next_rescue_offer_id(), 1);
+    assert_eq!(c.get_rescue_case(case_id).unwrap().offer_ids, vec![id]);
+    let offer = c.get_rescue_offer(id).unwrap();
+    assert_eq!(offer.provider, account("provider.near"));
+    assert_eq!(offer.fee, U128(6));
+    assert_eq!(offer.bond_capacity, U128(12));
+    assert_eq!(offer.held_bond, U128(12));
+    assert_eq!(offer.phase, RescueOfferPhase::Open);
+    assert_eq!(offer.locked_bundle_id, None);
+    assert_eq!(c.capacity_locks.get(&"provider.near|slot_1".to_owned()), None);
+}
+
+#[test]
+fn maximum_provider_and_slot_fit_prepaid_storage_quote() {
+    let mut c = Nomogenesis::default();
+    let id = create_case(&mut c);
+    let provider = "a".repeat(64);
+    let slot = "s".repeat(64);
+    let quote = c.m3_storage_quote().offer_storage_cost.0;
+    context(&provider, 205, quote + 12);
+    let mut offer = input(id, 0, 6, 12);
+    offer.slot_id = slot.clone();
+    let before = env::storage_usage();
+    assert_eq!(c.post_rescue_offer(offer), 0);
+    c.rescue_cases.flush();
+    c.rescue_offers.flush();
+    let measured = env::storage_usage() - before;
+    assert!(measured > 0 && measured <= crate::rescue::OFFER_STORAGE_BYTES);
+    assert_eq!(c.get_rescue_offer(0).unwrap().slot_id, slot);
+}
+
+#[test]
+fn exact_funding_and_valid_parameters_are_required() {
+    let mut c = Nomogenesis::default();
+    let id = create_case(&mut c);
+    let quote = crate::rescue::offer_storage_cost();
+    for deposit in [0, quote + 11, quote + 13] {
+        context("provider.near", 205, deposit);
+        rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, 12)));
+    }
+    for (component, fee, bond) in [(2, 6, 12), (0, 0, 12), (0, 13, 12)] {
+        context("provider.near", 205, quote + 12);
+        rejected(|| c.post_rescue_offer(input(id.clone(), component, fee, bond)));
+    }
+    for slot in ["", "too long / invalid", "ékezet"] {
+        context("provider.near", 205, quote + 12);
+        let mut attempt = input(id.clone(), 0, 6, 12);
+        attempt.slot_id = slot.to_owned();
+        rejected(|| c.post_rescue_offer(attempt));
+    }
+    context("provider.near", 205, quote + 12);
+    let mut too_long = input(id.clone(), 0, 6, 12);
+    too_long.slot_id = "x".repeat(65);
+    rejected(|| c.post_rescue_offer(too_long));
+    rejected(|| c.post_rescue_offer(input(vec![0; 31], 0, 6, 12)));
+    rejected(|| c.post_rescue_offer(input(vec![0; 32], 0, 6, 12)));
+    assert_eq!(c.next_rescue_offer_id(), 0);
+    assert!(c.get_rescue_case(id).unwrap().offer_ids.is_empty());
+    assert_eq!(c.rescue_escrow_total(), U128(0));
+    assert_eq!(c.storage_reserves, crate::rescue::case_storage_cost());
+}
+
+#[test]
+fn provider_and_deadline_rules_reject_without_mutation() {
+    let mut c = Nomogenesis::default();
+    let id = create_case(&mut c);
+    let payment = 12 + crate::rescue::offer_storage_cost();
+    for (provider, now) in [
+        ("source.near", 205),
+        ("contract.near", 205),
+        ("provider.near", 220),
+    ] {
+        context(provider, now, payment);
+        rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, 12)));
+    }
+    let mut case = c.rescue_cases.get(&<[u8; 32]>::try_from(id.clone()).unwrap()).unwrap().clone();
+    case.phase = RescueCasePhase::Closed;
+    c.rescue_cases.insert(case.id, case);
+    context("provider.near", 205, payment);
+    rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, 12)));
+    assert_eq!(c.next_rescue_offer_id(), 0);
+    assert!(!c.has_rescue_offer(0));
+    assert!(c.get_rescue_case(id).unwrap().offer_ids.is_empty());
+    assert_eq!(c.rescue_escrow_total(), U128(0));
+}
+
+#[test]
+fn duplicate_component_and_seventh_offer_are_rejected() {
+    let mut c = Nomogenesis::default();
+    let id = create_case(&mut c);
+    assert_eq!(post(&mut c, id.clone(), "provider0.near", 0), 0);
+    context("provider0.near", 205, 12 + crate::rescue::offer_storage_cost());
+    rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, 12)));
+    // The same provider may quote the other component; clearing must later
+    // reject a pair that selects this provider twice.
+    assert_eq!(post(&mut c, id.clone(), "provider0.near", 1), 1);
+    for n in 1..5 {
+        assert_eq!(post(&mut c, id.clone(), &format!("provider{n}.near"), 0), n + 1);
+    }
+    context("provider5.near", 205, 12 + crate::rescue::offer_storage_cost());
+    rejected(|| c.post_rescue_offer(input(id.clone(), 1, 6, 12)));
+    assert_eq!(c.get_rescue_case(id).unwrap().offer_ids, (0..6).collect::<Vec<_>>());
+    assert_eq!(c.next_rescue_offer_id(), 6);
+    assert!(!c.has_rescue_offer(6));
+    assert_eq!(c.rescue_escrow_total(), U128(72));
+}
+
+#[test]
+fn overflow_is_atomic_and_offer_survives_reload() {
+    let mut c = Nomogenesis::default();
+    let id = create_case(&mut c);
+    let payment = 12 + crate::rescue::offer_storage_cost();
+
+    c.next_rescue_offer_id = u64::MAX;
+    context("provider.near", 205, payment);
+    rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, 12)));
+    c.next_rescue_offer_id = 0;
+
+    c.rescue_escrow = u128::MAX;
+    rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, 12)));
+    c.rescue_escrow = 0;
+
+    let storage = c.storage_reserves;
+    c.storage_reserves = u128::MAX;
+    rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, 12)));
+    c.storage_reserves = storage;
+
+    rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, u128::MAX)));
+    assert_eq!(c.next_rescue_offer_id(), 0);
+    assert!(c.get_rescue_case(id.clone()).unwrap().offer_ids.is_empty());
+    assert!(!c.has_rescue_offer(0));
+
+    assert_eq!(post(&mut c, id.clone(), "provider.near", 0), 0);
+    c.rescue_cases.flush();
+    c.rescue_offers.flush();
+    env::state_write(&c);
+    drop(c);
+    let reloaded: Nomogenesis = env::state_read().expect("state missing");
+    assert_eq!(reloaded.get_rescue_offer(0).unwrap().provider, account("provider.near"));
+    assert_eq!(reloaded.get_rescue_case(id).unwrap().offer_ids, vec![0]);
+    assert_eq!(reloaded.rescue_escrow_total(), U128(12));
+    assert_eq!(reloaded.next_rescue_offer_id(), 1);
+}
"""
PATCH = PATCH.replace("\\x20\n", " \n")

def run(*args, input=None):
    return subprocess.run(args, input=input, text=True, check=True, capture_output=True)


def main():
    branch = run("git", "branch", "--show-current").stdout.strip()
    head = run("git", "rev-parse", "--short", "HEAD").stdout.strip()
    status = set(run("git", "status", "--porcelain").stdout.splitlines())
    expected = {
        "?? sandbox/real_low_margin_audit.cjs",
        "?? scripts/m3/m3_r3_02a_offer_admission.py",
    }
    if branch != "feat/m2-escrow" or head != "314d44b" or status != expected:
        raise ValueError(f"unexpected checkpoint: {branch}, {head}, {sorted(status)}")
    for name in ("src/rescue_offer_tests.rs", "docs/worklog/M3-R3-02A-offer-admission.md"):
        if Path(name).exists():
            raise ValueError(f"target already exists: {name}")
    run("git", "apply", "--check", input=PATCH)
    run("git", "apply", input=PATCH)
    print("M3-R3-02A SCAFFOLD PASS (tests pending)")
    print("Changed: src/lib.rs, src/rescue.rs, src/rescue_offer_tests.rs, docs/HANDOFF.md")
    print("Logged: docs/worklog/M3-R3-02A-offer-admission.md")

if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        print(f"M3-R3-02A SCAFFOLD FAIL: {exc}")
        sys.exit(2)
