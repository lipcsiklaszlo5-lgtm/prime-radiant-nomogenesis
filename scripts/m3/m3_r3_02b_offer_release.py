"""Apply the reviewed M3-R3-02B release patch at its exact base."""
from pathlib import Path
import subprocess
import sys

BASE = "71a1350"
SELF = "scripts/m3/m3_r3_02b_offer_release.py"
AUDIT = "?? sandbox/real_low_margin_audit.cjs"
PATCH = r'''diff --git a/docs/HANDOFF.md b/docs/HANDOFF.md
index 0bfccbd..8478d0e 100644
--- a/docs/HANDOFF.md
+++ b/docs/HANDOFF.md
@@ -11,7 +11,8 @@
 - Two separate provider bonds are funded; offer posting leaves slots unreserved.
 - Preserve untracked `sandbox/real_low_margin_audit.cjs`.
 - Offer terminal release, bundle award and public testnet: not verified.
-- Next single action: M3-R3-02B provider offer terminal release.
+- Active ticket: M3-R3-02B provider offer terminal release; verification pending.
+- Next single action: run focused offer release tests.
\x20
 ## Munkamenetindító parancsok
\x20
diff --git a/docs/worklog/M3-R3-02B-offer-release.md b/docs/worklog/M3-R3-02B-offer-release.md
new file mode 100644
index 0000000..f3b8871
--- /dev/null
+++ b/docs/worklog/M3-R3-02B-offer-release.md
@@ -0,0 +1,34 @@
+# M3-R3-02B — terminal offer release
+
+**Branch/base:** `feat/m2-escrow` / `71a1350`.
+**Worktree:** only `sandbox/real_low_margin_audit.cjs` was untracked at start.
+**Status:** scaffold prepared; execution in Codespaces pending.
+
+## Purpose and contract
+
+An open offer's provider may cancel before bid close. After award close,
+anyone may release it. Once a case is awarded, anyone may release an
+unselected open offer. A selected or locked offer stays inaccessible to
+these paths. The provider's held bond becomes claimable exactly once;
+storage reserves and capacity locks do not change.
+
+## Inputs and outputs
+
+Inputs: offer ID, authenticated predecessor and chain timestamp. Output:
+terminal phase/reason, zero held bond, matching `rescue_escrow` decrement
+and provider claimable increment. The caller cannot supply a recipient.
+
+## Reproduction and observed output
+
+`python3 -B scripts/m3/m3_r3_02b_offer_release.py`
+
+Pending execution and exit code. Focused Rust tests, full regression,
+Clippy, compatible WASM and Sandbox results must be recorded from actual
+output before marking this checkpoint verified.
+
+## Files and next action
+
+`src/lib.rs`, `src/rescue_offer_release_tests.rs`, `docs/HANDOFF.md`, this
+worklog and the Python builder. The existing local audit file is preserved.
+Next: run the focused Rust release tests; inspect any failure before
+proceeding to the Sandbox release lifecycle.
diff --git a/src/lib.rs b/src/lib.rs
index be61fc9..602b58b 100644
--- a/src/lib.rs
+++ b/src/lib.rs
@@ -839,6 +839,48 @@ impl Nomogenesis {
         id
     }
\x20
+    pub fn cancel_rescue_offer(&mut self, offer_id: u64) {
+        let offer = self.rescue_offers.get(&offer_id).expect("unknown rescue offer");
+        assert_eq!(
+            env::predecessor_account_id(),
+            offer.provider,
+            "not rescue offer provider"
+        );
+        let case = self.rescue_cases.get(&offer.case_id).expect("missing rescue case");
+        assert!(env::block_timestamp() < case.bid_close, "bid close reached");
+        self.release_rescue_offer(offer_id, rescue::RescueOfferReleaseReason::Cancelled);
+    }
+
+    pub fn release_open_rescue_offer(&mut self, offer_id: u64) {
+        let offer = self.rescue_offers.get(&offer_id).expect("unknown rescue offer");
+        let case = self.rescue_cases.get(&offer.case_id).expect("missing rescue case");
+        let reason = if case.phase == rescue::RescueCasePhase::BundleAwarded {
+            let bundle_id = case.awarded_bundle_id.expect("missing awarded bundle ID");
+            let bundle = self.rescue_bundles.get(&bundle_id).expect("missing awarded bundle");
+            assert_eq!(bundle.case_id, case.id, "awarded bundle case mismatch");
+            assert!(!bundle.offer_ids.contains(&offer_id), "selected offer cannot be released");
+            rescue::RescueOfferReleaseReason::Unselected
+        } else {
+            assert!(env::block_timestamp() >= case.award_close, "award close not reached");
+            rescue::RescueOfferReleaseReason::AwardExpired
+        };
+        self.release_rescue_offer(offer_id, reason);
+    }
+
+    fn release_rescue_offer(&mut self, offer_id: u64, reason: rescue::RescueOfferReleaseReason) {
+        let mut offer = self.rescue_offers.get(&offer_id).cloned().expect("unknown rescue offer");
+        assert_eq!(offer.phase, rescue::RescueOfferPhase::Open, "rescue offer is not open");
+        assert!(offer.held_bond > 0, "open offer holds no bond");
+        assert!(offer.locked_bundle_id.is_none() && offer.release_reason.is_none(), "open offer contains terminal data");
+        let next_escrow = self.rescue_escrow.checked_sub(offer.held_bond).expect("rescue escrow underflow");
+        self.credit_accounts(&[(offer.provider.clone(), offer.held_bond)]);
+        self.rescue_escrow = next_escrow;
+        offer.held_bond = 0;
+        offer.phase = rescue::RescueOfferPhase::Released;
+        offer.release_reason = Some(reason);
+        self.rescue_offers.insert(offer_id, offer);
+    }
+
     pub fn has_rescue_bundle(&self, bundle_id: u64) -> bool {
         self.rescue_bundles.get(&bundle_id).is_some()
     }
@@ -1689,6 +1731,8 @@ mod rescue_schema_tests;
\x20
 #[cfg(test)]
 mod rescue_offer_tests;
+#[cfg(test)]
+mod rescue_offer_release_tests;
\x20
 #[cfg(test)]
 mod rescue_case_tests;
diff --git a/src/rescue_offer_release_tests.rs b/src/rescue_offer_release_tests.rs
new file mode 100644
index 0000000..42026ee
--- /dev/null
+++ b/src/rescue_offer_release_tests.rs
@@ -0,0 +1,169 @@
+use super::*;
+use crate::rescue::{
+    RescueBundle, RescueBundlePhase, RescueCaseDescriptorInput, RescueCasePhase,
+    RescueComponentOutcome, RescueOfferInput, RescueOfferPhase, RescueOfferReleaseReason,
+};
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
+fn rejected(call: impl FnOnce()) {
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
+fn post(c: &mut Nomogenesis, id: &[u8], provider: &str, component: u8) -> u64 {
+    context(provider, 205, 12 + rescue::offer_storage_cost());
+    c.post_rescue_offer(RescueOfferInput {
+        case_id: id.to_vec(),
+        component_index: component,
+        slot_id: "slot_1".into(),
+        fee: U128(6),
+        bond_capacity: U128(12),
+    })
+}
+
+#[test]
+fn provider_cancel_is_authenticated_and_single_use() {
+    let (mut c, id) = market();
+    let first = post(&mut c, &id, "provider.near", 0);
+    let second = post(&mut c, &id, "other.near", 1);
+    let storage = c.storage_reserves;
+    context("outsider.near", 219, 0);
+    rejected(|| c.cancel_rescue_offer(first));
+    assert_eq!(c.rescue_escrow_total(), U128(24));
+    context("provider.near", 219, 0);
+    c.cancel_rescue_offer(first);
+    let offer = c.get_rescue_offer(first).unwrap();
+    assert_eq!(offer.phase, RescueOfferPhase::Released);
+    assert_eq!(offer.release_reason, Some(RescueOfferReleaseReason::Cancelled));
+    assert_eq!(offer.held_bond, U128(0));
+    assert_eq!(c.get_rescue_offer(second).unwrap().phase, RescueOfferPhase::Open);
+    assert_eq!(c.rescue_escrow_total(), U128(12));
+    assert_eq!(c.get_claimable(account("provider.near")), U128(12));
+    assert_eq!(c.claimable_total(), U128(12));
+    assert_eq!(c.storage_reserves, storage);
+    assert!(c.capacity_locks.get(&"provider.near|slot_1".to_owned()).is_none());
+    rejected(|| c.cancel_rescue_offer(first));
+    assert_eq!(c.get_claimable(account("provider.near")), U128(12));
+}
+
+#[test]
+fn bid_and_award_boundaries_do_not_overlap() {
+    let (mut c, id) = market();
+    let offer = post(&mut c, &id, "provider.near", 0);
+    context("provider.near", 220, 0);
+    rejected(|| c.cancel_rescue_offer(offer));
+    context("keeper.near", 239, 0);
+    rejected(|| c.release_open_rescue_offer(offer));
+    assert_eq!(c.rescue_escrow_total(), U128(12));
+    context("keeper.near", 240, 0);
+    c.release_open_rescue_offer(offer);
+    assert_eq!(c.get_rescue_offer(offer).unwrap().release_reason, Some(RescueOfferReleaseReason::AwardExpired));
+    assert_eq!(c.get_claimable(account("provider.near")), U128(12));
+    rejected(|| c.release_open_rescue_offer(offer));
+    assert_eq!(c.rescue_escrow_total(), U128(0));
+}
+
+#[test]
+fn credit_overflow_and_locked_offer_cannot_release() {
+    let (mut c, id) = market();
+    let offer_id = post(&mut c, &id, "provider.near", 0);
+    context("provider.near", 210, 0);
+    c.claimables.insert(account("provider.near"), u128::MAX);
+    rejected(|| c.cancel_rescue_offer(offer_id));
+    assert_eq!(c.rescue_escrow_total(), U128(12));
+    assert_eq!(c.get_rescue_offer(offer_id).unwrap().phase, RescueOfferPhase::Open);
+    c.claimables.insert(account("provider.near"), 0);
+    c.claimable_total = u128::MAX;
+    rejected(|| c.cancel_rescue_offer(offer_id));
+    assert_eq!(c.get_claimable(account("provider.near")), U128(0));
+    c.claimable_total = 0;
+    c.rescue_escrow = 11;
+    rejected(|| c.cancel_rescue_offer(offer_id));
+    assert_eq!(c.get_claimable(account("provider.near")), U128(0));
+    c.rescue_escrow = 12;
+    let mut offer = c.rescue_offers.get(&offer_id).unwrap().clone();
+    offer.phase = RescueOfferPhase::Locked;
+    offer.locked_bundle_id = Some(0);
+    c.rescue_offers.insert(offer_id, offer);
+    rejected(|| c.cancel_rescue_offer(offer_id));
+    context("keeper.near", 240, 0);
+    rejected(|| c.release_open_rescue_offer(offer_id));
+    assert_eq!(c.rescue_escrow_total(), U128(12));
+}
+
+#[test]
+fn unselected_offer_releases_after_award_but_selected_remains_locked() {
+    let (mut c, id) = market();
+    let selected = post(&mut c, &id, "selected.near", 0);
+    let other_selected = post(&mut c, &id, "other.near", 1);
+    let unselected = post(&mut c, &id, "unselected.near", 1);
+    let case_id: [u8; 32] = id.try_into().unwrap();
+    let mut case = c.rescue_cases.get(&case_id).unwrap().clone();
+    case.phase = RescueCasePhase::BundleAwarded;
+    case.awarded_bundle_id = Some(0);
+    c.rescue_cases.insert(case_id, case);
+    c.rescue_bundles.insert(0, RescueBundle {
+        id: 0,
+        case_id,
+        offer_ids: [selected, other_selected],
+        total_price: 12,
+        allocations: vec![],
+        recovery_deadline: 260,
+        phase: RescueBundlePhase::Awarded,
+        component_outcomes: [RescueComponentOutcome::Pending, RescueComponentOutcome::Pending],
+    });
+    context("keeper.near", 225, 0);
+    rejected(|| c.release_open_rescue_offer(selected));
+    c.release_open_rescue_offer(unselected);
+    assert_eq!(c.get_rescue_offer(unselected).unwrap().release_reason, Some(RescueOfferReleaseReason::Unselected));
+    assert_eq!(c.get_claimable(account("unselected.near")), U128(12));
+    assert_eq!(c.get_claimable(account("selected.near")), U128(0));
+    assert_eq!(c.rescue_escrow_total(), U128(24));
+}
+
+#[test]
+fn released_offer_survives_state_reload() {
+    let (mut c, id) = market();
+    let offer_id = post(&mut c, &id, "provider.near", 0);
+    context("provider.near", 219, 0);
+    c.cancel_rescue_offer(offer_id);
+    c.rescue_cases.flush();
+    c.rescue_offers.flush();
+    c.claimables.flush();
+    env::state_write(&c);
+    let reloaded: Nomogenesis = env::state_read().unwrap();
+    assert_eq!(reloaded.get_rescue_offer(offer_id).unwrap().phase, RescueOfferPhase::Released);
+    assert_eq!(reloaded.get_claimable(account("provider.near")), U128(12));
+    assert_eq!(reloaded.rescue_escrow_total(), U128(0));
+}
'''


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def main():
    if git("branch", "--show-current") != "feat/m2-escrow":
        raise ValueError("unexpected branch")
    if git("rev-parse", "--short", "HEAD") != BASE:
        raise ValueError("unexpected HEAD")
    status = set(git("status", "--porcelain").splitlines())
    if status != {AUDIT, f"?? {SELF}"}:
        raise ValueError(f"unexpected worktree: {sorted(status)}")
    for name in ("src/rescue_offer_release_tests.rs", "docs/worklog/M3-R3-02B-offer-release.md"):
        if Path(name).exists():
            raise ValueError(f"target already exists: {name}")
    patch = PATCH.replace("\\x20\n", " \n")
    subprocess.run(["git", "apply", "--check", "-"], input=patch, text=True, check=True)
    subprocess.run(["git", "apply", "-"], input=patch, text=True, check=True)
    print("M3-R3-02B SCAFFOLD PASS; tests pending")
    for name in ("docs/HANDOFF.md", "docs/worklog/M3-R3-02B-offer-release.md", "src/lib.rs", "src/rescue_offer_release_tests.rs"):
        print(name)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as error:
        print(f"M3-R3-02B SCAFFOLD FAIL: {error}", file=sys.stderr)
        sys.exit(2)
