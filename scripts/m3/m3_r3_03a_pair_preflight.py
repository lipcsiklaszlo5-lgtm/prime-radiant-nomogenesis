"""Apply R3-03A read-only candidate preflight at the pinned checkpoint."""
from pathlib import Path
import subprocess
import sys

BASE = "46c0080"
SELF = "scripts/m3/m3_r3_03a_pair_preflight.py"
PATCH = r'''diff --git a/docs/HANDOFF.md b/docs/HANDOFF.md
index 921bf00..82ae723 100644
--- a/docs/HANDOFF.md
+++ b/docs/HANDOFF.md
@@ -12,7 +12,8 @@
 - Earlier M2 and M3-R2 Sandboxes were not rerun in this ticket.
 - Preserve untracked `sandbox/real_low_margin_audit.cjs`.
 - Real bundle award, post-award unselected release and public testnet: not verified.
-- Next single action: M3-R3-03A deterministic candidate selection preflight.
+- Active ticket: M3-R3-03A deterministic candidate selection preflight; tests pending.
+- Next single action: run focused read-only clearing tests.
\x20
 ## Munkamenetindító parancsok
\x20
diff --git a/docs/worklog/M3-R3-03A-pair-preflight.md b/docs/worklog/M3-R3-03A-pair-preflight.md
new file mode 100644
index 0000000..9efc826
--- /dev/null
+++ b/docs/worklog/M3-R3-03A-pair-preflight.md
@@ -0,0 +1,37 @@
+# M3-R3-03A — deterministic pair preflight
+
+**Branch/base:** `feat/m2-escrow` / `46c0080`.
+**Starting worktree:** only `sandbox/real_low_margin_audit.cjs` untracked.
+**Status:** scaffold prepared; Codespaces tests pending.
+
+## Purpose
+
+Derive the cheapest admissible two-component pair from stored case jobs,
+mandates, offers, deadlines and the unified M2/M3 slot registry. The
+permissionless read-only preview accepts only a case ID. It exposes the
+eligible job IDs and cap total, but creates no bundle, lock, claimable or
+RecoveryRight.
+
+## Inputs and outputs
+
+Input: canonical case ID and chain timestamp. Output: optional pair in
+component order, price, eligible job IDs and cap total. Reject corrupt
+case indexes. Skip released, under-bonded, same-provider, occupied-slot
+and overflowing-fee pairs. Ties use ascending offer IDs.
+
+## Reproduction
+
+`python3 -B scripts/m3/m3_r3_03a_pair_preflight.py`
+
+Codespaces output and exit code pending. The focused command is
+`cargo test --locked --lib rescue_clearing_tests`. Record actual failures
+and repairs here before marking PASS.
+
+## Changed files and limitation
+
+`src/rescue_clearing.rs`, `src/rescue.rs`, `src/lib.rs`,
+`src/rescue_clearing_tests.rs`, `docs/HANDOFF.md`, this worklog and the
+Python builder. The local audit file remains untouched.
+
+No capped-equal allocation, credits, bundle creation or provider slot lock
+occurs in R3-03A. Next: run focused preflight tests and inspect the result.
diff --git a/src/lib.rs b/src/lib.rs
index 3ee57dd..684e953 100644
--- a/src/lib.rs
+++ b/src/lib.rs
@@ -4,6 +4,7 @@ mod escrow;
 mod ledger;
 mod offer;
 pub mod rescue;
+mod rescue_clearing;
 pub mod settlement;
 mod task;
 mod withdrawal;
@@ -730,6 +731,16 @@ impl Nomogenesis {
             .map(rescue::RescueOfferView::from)
     }
\x20
+    pub fn preview_rescue_pair(&self, case_id: Vec<u8>) -> Option<rescue::RescuePairView> {
+        let key = rescue::parse_case_id(case_id).expect("invalid rescue case ID");
+        self.select_rescue_pair(key, env::block_timestamp()).map(|plan| rescue::RescuePairView {
+            offer_ids: plan.offer_ids,
+            total_price: U128(plan.total_price),
+            eligible_job_ids: plan.eligible_job_ids,
+            eligible_cap_total: U128(plan.eligible_cap_total),
+        })
+    }
+
     #[payable]
     pub fn post_rescue_offer(&mut self, input: rescue::RescueOfferInput) -> u64 {
         let provider = env::predecessor_account_id();
@@ -1767,6 +1778,8 @@ mod rescue_schema_tests;
 #[cfg(test)]
 mod rescue_offer_release_tests;
 #[cfg(test)]
+mod rescue_clearing_tests;
+#[cfg(test)]
 mod rescue_offer_tests;
\x20
 #[cfg(test)]
diff --git a/src/rescue.rs b/src/rescue.rs
index b3e744e..40d3f4b 100644
--- a/src/rescue.rs
+++ b/src/rescue.rs
@@ -121,6 +121,15 @@ pub struct RescueOfferView {
     pub release_reason: Option<RescueOfferReleaseReason>,
 }
\x20
+#[near(serializers = [json])]
+#[derive(Debug, Clone, PartialEq, Eq)]
+pub struct RescuePairView {
+    pub offer_ids: [u64; COMPONENT_COUNT],
+    pub total_price: U128,
+    pub eligible_job_ids: Vec<u64>,
+    pub eligible_cap_total: U128,
+}
+
 impl From<&RescueOffer> for RescueOfferView {
     fn from(value: &RescueOffer) -> Self {
         Self {
diff --git a/src/rescue_clearing.rs b/src/rescue_clearing.rs
new file mode 100644
index 0000000..fa39b31
--- /dev/null
+++ b/src/rescue_clearing.rs
@@ -0,0 +1,94 @@
+use std::collections::BTreeSet;
+
+use crate::{Nomogenesis, capacity, rescue};
+
+pub(crate) struct RescuePairPlan {
+    pub offer_ids: [u64; 2],
+    pub total_price: u128,
+    pub eligible_job_ids: Vec<u64>,
+    pub eligible_cap_total: u128,
+}
+
+impl Nomogenesis {
+    pub(crate) fn select_rescue_pair(
+        &self,
+        case_id: [u8; 32],
+        now: u64,
+    ) -> Option<RescuePairPlan> {
+        let case = self.rescue_cases.get(&case_id).expect("unknown rescue case");
+        assert_eq!(case.phase, rescue::RescueCasePhase::Open, "case is not open");
+        assert!(case.awarded_bundle_id.is_none(), "case already awarded");
+        assert!(now >= case.bid_close && now < case.award_close, "outside award window");
+        assert!(now < case.recovery_deadline, "recovery deadline reached");
+        assert!(case.job_ids.len() <= rescue::MAX_RESCUE_JOBS, "case jobs exceed limit");
+        assert!(case.offer_ids.len() <= rescue::MAX_RESCUE_OFFERS, "case offers exceed limit");
+
+        let mut eligible_job_ids = Vec::new();
+        let mut cap_total = 0u128;
+        let mut job_ids = BTreeSet::new();
+        for id in &case.job_ids {
+            assert!(job_ids.insert(*id), "duplicate case job ID");
+            let job = self.rescue_jobs.get(id).expect("missing rescue job");
+            let mandate = self.rescue_mandates.get(id).expect("missing rescue mandate");
+            assert_eq!(job.id, *id, "rescue job ID mismatch");
+            assert_eq!(job.case_id, case_id, "rescue job case mismatch");
+            assert_eq!(mandate.job_id, *id, "rescue mandate ID mismatch");
+            if job.phase == rescue::RescueJobPhase::Accepted
+                && mandate.phase == rescue::RescueMandatePhase::Open
+                && mandate.held_principal > 0
+                && mandate.locked_bundle_id.is_none()
+                && mandate.locked_allocation.is_none()
+            {
+                cap_total = cap_total.checked_add(mandate.held_principal).expect("sponsor cap overflow");
+                eligible_job_ids.push(*id);
+            }
+        }
+        eligible_job_ids.sort_unstable();
+
+        let mut offer_ids = BTreeSet::new();
+        let offers: Vec<_> = case.offer_ids.iter().map(|id| {
+            assert!(offer_ids.insert(*id), "duplicate case offer ID");
+            let offer = self.rescue_offers.get(id).expect("missing rescue offer").clone();
+            assert_eq!(offer.id, *id, "rescue offer ID mismatch");
+            assert_eq!(offer.case_id, case_id, "rescue offer case mismatch");
+            offer
+        }).collect();
+
+        let mut best: Option<(u128, u64, u64)> = None;
+        for a in offers.iter().filter(|o| o.component_index == 0) {
+            for b in offers.iter().filter(|o| o.component_index == 1) {
+                if a.phase != rescue::RescueOfferPhase::Open
+                    || b.phase != rescue::RescueOfferPhase::Open
+                    || a.locked_bundle_id.is_some() || b.locked_bundle_id.is_some()
+                    || a.release_reason.is_some() || b.release_reason.is_some()
+                    || a.fee == 0 || b.fee == 0
+                    || a.provider == b.provider
+                {
+                    continue;
+                }
+                let Some(price) = a.fee.checked_add(b.fee) else { continue };
+                if price > cap_total || a.held_bond < price || b.held_bond < price {
+                    continue;
+                }
+                let a_key = capacity::capacity_key(&a.provider, &a.slot_id);
+                let b_key = capacity::capacity_key(&b.provider, &b.slot_id);
+                if self.capacity_locks.get(&a_key).is_some()
+                    || self.capacity_locks.get(&b_key).is_some()
+                {
+                    continue;
+                }
+                let candidate = (price, a.id, b.id);
+                if best.is_none_or(|old| candidate < old) {
+                    best = Some(candidate);
+                }
+            }
+        }
+
+        best.map(|(total_price, a, b)| RescuePairPlan {
+            offer_ids: [a, b],
+            total_price,
+            eligible_job_ids,
+            eligible_cap_total: cap_total,
+        })
+    }
+}
diff --git a/src/rescue_clearing_tests.rs b/src/rescue_clearing_tests.rs
new file mode 100644
index 0000000..7abbbc1
--- /dev/null
+++ b/src/rescue_clearing_tests.rs
@@ -0,0 +1,199 @@
+use super::*;
+use crate::{capacity::CapacityOwner, rescue::{FundedRescueJobInput, RescueCaseDescriptorInput, RescueOfferInput, RescueResultProfile}};
+use near_sdk::{NearToken, test_utils::VMContextBuilder, testing_env};
+use std::panic::{AssertUnwindSafe, catch_unwind};
+
+fn account(name: &str) -> AccountId { name.parse().unwrap() }
+
+fn context(actor: &str, now: u64, deposit: u128) {
+    let mut b = VMContextBuilder::new();
+    b.current_account_id(account("contract.near"))
+        .signer_account_id(account(actor))
+        .predecessor_account_id(account(actor))
+        .block_timestamp(now)
+        .attached_deposit(NearToken::from_yoctonear(deposit))
+        .account_balance(NearToken::from_near(100));
+    testing_env!(b.build());
+}
+
+fn rejected<T>(call: impl FnOnce() -> T) {
+    assert!(catch_unwind(AssertUnwindSafe(call)).is_err());
+}
+
+fn market() -> (Nomogenesis, Vec<u8>) {
+    let mut c = Nomogenesis::default();
+    context("creator.near", 100, rescue::case_storage_cost());
+    let id = c.create_rescue_case(RescueCaseDescriptorInput {
+        descriptor_version: 1,
+        original_provider: account("source.near"),
+        component_commitments: vec![vec![1; 32], vec![2; 32]],
+        dependency_deadline: 200,
+        bid_close: 220,
+        award_close: 240,
+        recovery_deadline: 260,
+    });
+    (c, id)
+}
+
+fn fund(c: &mut Nomogenesis, case_id: &[u8], n: usize, cap: u128) -> u64 {
+    let buyer = format!("buyer{n}.near");
+    let worker = format!("worker{n}.near");
+    context(&buyer, 110, 1 + cap + rescue::job_storage_cost());
+    c.create_funded_rescue_job(FundedRescueJobInput {
+        case_id: case_id.to_vec(),
+        worker: account(&worker),
+        worker_reward: U128(1),
+        rescue_cap: U128(cap),
+        result_profile: RescueResultProfile::ExactCommitment,
+        result_commitment: vec![9; 32],
+        threshold: None,
+        final_deadline: 300,
+    })
+}
+
+fn accept(c: &mut Nomogenesis, n: usize) {
+    context(&format!("worker{n}.near"), 115, 0);
+    c.accept_rescue_job(n as u64);
+}
+
+fn post(c: &mut Nomogenesis, case_id: &[u8], provider: &str, component: u8, fee: u128, bond: u128) -> u64 {
+    context(provider, 205, bond + rescue::offer_storage_cost());
+    c.post_rescue_offer(RescueOfferInput {
+        case_id: case_id.to_vec(),
+        component_index: component,
+        slot_id: format!("slot_{component}"),
+        fee: U128(fee),
+        bond_capacity: U128(bond),
+    })
+}
+
+fn three_sponsors(c: &mut Nomogenesis, id: &[u8]) {
+    for n in 0..3 { assert_eq!(fund(c, id, n, 5), n as u64); }
+    for n in 0..3 { accept(c, n); }
+}
+
+#[test]
+fn cheapest_eligible_pair_wins_and_preview_does_not_award() {
+    let (mut c, id) = market();
+    three_sponsors(&mut c, &id);
+    post(&mut c, &id, "cheap0.near", 0, 1, 1);
+    post(&mut c, &id, "cheap1.near", 1, 1, 1);
+    post(&mut c, &id, "funded0.near", 0, 6, 12);
+    post(&mut c, &id, "funded1.near", 1, 6, 12);
+    post(&mut c, &id, "tie0.near", 0, 6, 12);
+    post(&mut c, &id, "tie1.near", 1, 6, 12);
+    context("stranger.near", 220, 0);
+    let before = c.rescue_escrow_total();
+    let preview = c.preview_rescue_pair(id.clone()).unwrap();
+    assert_eq!(preview.offer_ids, [2, 3]);
+    assert_eq!(preview.total_price, U128(12));
+    assert_eq!(preview.eligible_job_ids, vec![0, 1, 2]);
+    assert_eq!(preview.eligible_cap_total, U128(15));
+    let key: [u8; 32] = id.clone().try_into().unwrap();
+    let mut case = c.rescue_cases.get(&key).unwrap().clone();
+    case.offer_ids.reverse();
+    c.rescue_cases.insert(key, case);
+    assert_eq!(c.preview_rescue_pair(id.clone()).unwrap().offer_ids, [2, 3]);
+    assert_eq!(c.rescue_escrow_total(), before);
+    assert_eq!(c.next_rescue_bundle_id(), 0);
+    assert_eq!(c.get_rescue_case(id).unwrap().awarded_bundle_id, None);
+    assert!(c.capacity_locks.get(&"funded0.near|slot_0".to_owned()).is_none());
+}
+
+#[test]
+fn unaccepted_job_does_not_supply_missing_cap() {
+    let (mut c, id) = market();
+    for n in 0..3 { fund(&mut c, &id, n, 5); }
+    accept(&mut c, 0);
+    accept(&mut c, 1);
+    post(&mut c, &id, "a.near", 0, 6, 12);
+    post(&mut c, &id, "b.near", 1, 6, 12);
+    context("keeper.near", 220, 0);
+    assert!(c.preview_rescue_pair(id).is_none());
+}
+
+#[test]
+fn revoked_open_mandate_no_longer_supplies_cap() {
+    let (mut c, id) = market();
+    three_sponsors(&mut c, &id);
+    post(&mut c, &id, "a.near", 0, 6, 12);
+    post(&mut c, &id, "b.near", 1, 6, 12);
+    context("keeper.near", 220, 0);
+    assert_eq!(c.preview_rescue_pair(id.clone()).unwrap().eligible_job_ids, vec![0, 1, 2]);
+    context("buyer2.near", 230, 0);
+    c.revoke_open_rescue_mandate(2);
+    context("keeper.near", 230, 0);
+    assert!(c.preview_rescue_pair(id).is_none());
+    assert_eq!(c.next_rescue_bundle_id(), 0);
+}
+
+#[test]
+fn occupied_m2_and_m3_slots_are_filtered_before_price_comparison() {
+    let (mut c, id) = market();
+    three_sponsors(&mut c, &id);
+    post(&mut c, &id, "a0.near", 0, 6, 14);
+    post(&mut c, &id, "b0.near", 1, 6, 14);
+    post(&mut c, &id, "a1.near", 0, 7, 14);
+    post(&mut c, &id, "b1.near", 1, 7, 14);
+    context("keeper.near", 220, 0);
+    assert_eq!(c.preview_rescue_pair(id.clone()).unwrap().offer_ids, [0, 1]);
+    c.capacity_locks.insert("a0.near|slot_0".into(), CapacityOwner::M2Offer(99));
+    assert_eq!(c.preview_rescue_pair(id.clone()).unwrap().offer_ids, [2, 1]);
+    c.capacity_locks.insert("b0.near|slot_1".into(), CapacityOwner::M3RescueOffer(98));
+    assert_eq!(c.preview_rescue_pair(id).unwrap().offer_ids, [2, 3]);
+    assert_eq!(c.capacity_locks.get(&"a0.near|slot_0".to_owned()), Some(&CapacityOwner::M2Offer(99)));
+}
+
+#[test]
+fn same_provider_cannot_fill_both_components() {
+    let (mut c, id) = market();
+    three_sponsors(&mut c, &id);
+    post(&mut c, &id, "same.near", 0, 6, 13);
+    post(&mut c, &id, "same.near", 1, 6, 13);
+    context("keeper.near", 220, 0);
+    assert!(c.preview_rescue_pair(id).is_none());
+}
+
+#[test]
+fn overflowing_fee_cannot_block_valid_pair() {
+    let (mut c, id) = market();
+    three_sponsors(&mut c, &id);
+    post(&mut c, &id, "same.near", 0, 6, 13);
+    post(&mut c, &id, "same.near", 1, 6, 13);
+    post(&mut c, &id, "other.near", 1, 7, 13);
+    context("keeper.near", 220, 0);
+    assert_eq!(c.preview_rescue_pair(id.clone()).unwrap().offer_ids, [0, 2]);
+    let mut offer = c.rescue_offers.get(&1).unwrap().clone();
+    offer.fee = u128::MAX;
+    c.rescue_offers.insert(1, offer);
+    assert_eq!(c.preview_rescue_pair(id).unwrap().offer_ids, [0, 2]);
+}
+
+#[test]
+fn time_gates_duplicate_indexes_and_closed_case_fail_without_award() {
+    let (mut c, id) = market();
+    three_sponsors(&mut c, &id);
+    post(&mut c, &id, "a.near", 0, 6, 12);
+    post(&mut c, &id, "b.near", 1, 6, 12);
+    context("keeper.near", 219, 0);
+    rejected(|| c.preview_rescue_pair(id.clone()));
+    context("keeper.near", 220, 0);
+    let key: [u8; 32] = id.clone().try_into().unwrap();
+    let mut case = c.rescue_cases.get(&key).unwrap().clone();
+    case.offer_ids.push(0);
+    c.rescue_cases.insert(key, case.clone());
+    rejected(|| c.preview_rescue_pair(id.clone()));
+    case.offer_ids.pop();
+    case.job_ids.push(0);
+    c.rescue_cases.insert(key, case.clone());
+    rejected(|| c.preview_rescue_pair(id.clone()));
+    case.job_ids.pop();
+    c.rescue_cases.insert(key, case.clone());
+    context("keeper.near", 240, 0);
+    rejected(|| c.preview_rescue_pair(id.clone()));
+    case.phase = rescue::RescueCasePhase::BundleAwarded;
+    c.rescue_cases.insert(key, case);
+    rejected(|| c.preview_rescue_pair(id));
+    assert_eq!(c.next_rescue_bundle_id(), 0);
+    assert!(!c.has_rescue_bundle(0));
+}
'''


def git(*args):
    return subprocess.check_output(["git", *args], text=True)


def main():
    if git("branch", "--show-current").strip() != "feat/m2-escrow":
        raise ValueError("unexpected branch")
    if git("rev-parse", "--short", "HEAD").strip() != BASE:
        raise ValueError("unexpected HEAD")
    expected = {"?? sandbox/real_low_margin_audit.cjs", f"?? {SELF}"}
    actual = set(git("status", "--porcelain").splitlines())
    if actual != expected or git("diff", "--cached", "--name-only").strip():
        raise ValueError(f"unexpected worktree: {sorted(actual)}")
    for name in ("src/rescue_clearing.rs", "src/rescue_clearing_tests.rs", "docs/worklog/M3-R3-03A-pair-preflight.md"):
        if Path(name).exists():
            raise ValueError(f"target already exists: {name}")
    patch = PATCH.replace("\\x20\n", " \n")
    subprocess.run(["git", "apply", "--check", "-"], input=patch, text=True, check=True)
    subprocess.run(["git", "apply", "-"], input=patch, text=True, check=True)
    print("M3-R3-03A SCAFFOLD PASS; focused tests pending")
    for name in ("docs/HANDOFF.md", "docs/worklog/M3-R3-03A-pair-preflight.md", "src/lib.rs", "src/rescue.rs", "src/rescue_clearing.rs", "src/rescue_clearing_tests.rs"):
        print(name)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as error:
        print(f"M3-R3-03A SCAFFOLD FAIL: {error}", file=sys.stderr)
        sys.exit(2)
