from pathlib import Path
import subprocess
import sys

BASE = "f19bad9"
AUDIT = "?? sandbox/real_low_margin_audit.cjs"
SELF = "?? scripts/m3/m3_r2_03a_manual_release.py"

def fail(message: str) -> None:
    print(f"M3-R2-03A SCAFFOLD FAIL: {message}")
    sys.exit(2)

def read(name: str) -> str:
    return Path(name).read_text(encoding="utf-8")

def write(name: str, content: str) -> None:
    path = Path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")

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
    "src/rescue_release_tests.rs",
    "docs/worklog/M3-R2-03A-manual-release.md",
):
    if Path(name).exists():
        fail(f"target already exists: {name}")

lib_path = Path("src/lib.rs")
lib = read(str(lib_path))

method_anchor = """    pub fn rescue_escrow_total(&self) -> U128 {
"""
if lib.count(method_anchor) != 1:
    fail("rescue escrow method anchor not found exactly once")

methods = r'''    pub fn cancel_unaccepted_rescue_job(&mut self, job_id: u64) {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();

        let mut job = self
            .rescue_jobs
            .get(&job_id)
            .cloned()
            .expect("unknown rescue job");

        assert_eq!(caller, job.buyer, "not rescue job buyer");
        assert_eq!(
            job.phase,
            rescue::RescueJobPhase::Funded,
            "rescue job is not awaiting acceptance"
        );

        let case = self
            .rescue_cases
            .get(&job.case_id)
            .expect("missing rescue case");

        assert_eq!(
            case.phase,
            rescue::RescueCasePhase::Open,
            "rescue case is not open"
        );
        assert!(
            now < case.dependency_deadline,
            "use expiry after dependency deadline"
        );

        let mut mandate = self
            .rescue_mandates
            .get(&job_id)
            .cloned()
            .expect("missing rescue mandate");

        let released_cap = match mandate.phase.clone() {
            rescue::RescueMandatePhase::Open => {
                assert!(mandate.held_principal > 0, "empty open rescue mandate");
                let amount = mandate.held_principal;
                mandate.held_principal = 0;
                mandate.phase = rescue::RescueMandatePhase::Released;
                mandate.release_reason =
                    Some(rescue::MandateReleaseReason::JobCancelled);
                amount
            }
            rescue::RescueMandatePhase::Released => {
                assert_eq!(
                    mandate.release_reason,
                    Some(rescue::MandateReleaseReason::Revoked),
                    "invalid released mandate for cancellation"
                );
                assert_eq!(
                    mandate.held_principal, 0,
                    "released mandate still holds principal"
                );
                0
            }
            rescue::RescueMandatePhase::Locked => {
                panic!("locked rescue mandate cannot be cancelled")
            }
        };

        assert!(
            job.held_worker_reward > 0,
            "rescue job has no held worker reward"
        );

        let released = job
            .held_worker_reward
            .checked_add(released_cap)
            .expect("rescue cancellation credit overflow");

        let next_escrow = self
            .rescue_escrow
            .checked_sub(released)
            .expect("rescue escrow underflow");

        job.held_worker_reward = 0;
        job.phase = rescue::RescueJobPhase::Cancelled;

        self.credit_accounts(&[(job.buyer.clone(), released)]);
        self.rescue_escrow = next_escrow;
        self.rescue_jobs.insert(job_id, job);
        self.rescue_mandates.insert(job_id, mandate);
    }

    pub fn revoke_open_rescue_mandate(&mut self, job_id: u64) {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();

        let job = self
            .rescue_jobs
            .get(&job_id)
            .cloned()
            .expect("unknown rescue job");

        assert_eq!(caller, job.buyer, "not rescue job buyer");
        assert!(
            matches!(
                job.phase,
                rescue::RescueJobPhase::Funded
                    | rescue::RescueJobPhase::Accepted
            ),
            "rescue job cannot revoke its mandate"
        );

        let case = self
            .rescue_cases
            .get(&job.case_id)
            .expect("missing rescue case");

        assert_eq!(
            case.phase,
            rescue::RescueCasePhase::Open,
            "rescue case is not open"
        );
        assert!(
            now < case.award_close,
            "use expiry after award close"
        );

        let mut mandate = self
            .rescue_mandates
            .get(&job_id)
            .cloned()
            .expect("missing rescue mandate");

        assert_eq!(
            mandate.phase,
            rescue::RescueMandatePhase::Open,
            "rescue mandate is not open"
        );
        assert!(
            mandate.held_principal > 0,
            "open rescue mandate holds no principal"
        );
        assert!(
            mandate.locked_bundle_id.is_none()
                && mandate.locked_allocation.is_none(),
            "open rescue mandate contains a lock"
        );

        let released = mandate.held_principal;
        let next_escrow = self
            .rescue_escrow
            .checked_sub(released)
            .expect("rescue escrow underflow");

        mandate.held_principal = 0;
        mandate.phase = rescue::RescueMandatePhase::Released;
        mandate.release_reason =
            Some(rescue::MandateReleaseReason::Revoked);

        self.credit_accounts(&[(job.buyer, released)]);
        self.rescue_escrow = next_escrow;
        self.rescue_mandates.insert(job_id, mandate);
    }

'''

lib = lib.replace(method_anchor, methods + method_anchor, 1)

module_anchor = """#[cfg(test)]
mod rescue_funding_tests;
"""
if lib.count(module_anchor) != 1:
    fail("rescue funding test module anchor not found exactly once")

lib = lib.replace(
    module_anchor,
    module_anchor + "\n#[cfg(test)]\nmod rescue_release_tests;\n",
    1,
)

tests = r'''use super::*;
use crate::rescue::{
    FundedRescueJobInput, MandateReleaseReason,
    RescueCaseDescriptorInput, RescueJobPhase,
    RescueMandatePhase, RescueResultProfile,
};

use near_sdk::{
    NearToken,
    test_utils::VMContextBuilder,
    testing_env,
};

use std::panic::{AssertUnwindSafe, catch_unwind};

fn account(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn context(actor: &str, now: u64, deposit: u128) {
    let mut builder = VMContextBuilder::new();

    builder
        .current_account_id(account("contract.near"))
        .signer_account_id(account(actor))
        .predecessor_account_id(account(actor))
        .block_timestamp(now)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100));

    testing_env!(builder.build());
}

fn rejected<T>(call: impl FnOnce() -> T) {
    assert!(catch_unwind(AssertUnwindSafe(call)).is_err());
}

fn create_case(c: &mut Nomogenesis) -> Vec<u8> {
    context("creator.near", 100, 0);
    let quote = c.m3_storage_quote().case_storage_cost.0;

    context("creator.near", 100, quote);
    c.create_rescue_case(RescueCaseDescriptorInput {
        descriptor_version: 1,
        original_provider: account("source.near"),
        component_commitments: vec![vec![1; 32], vec![2; 32]],
        dependency_deadline: 200,
        bid_close: 220,
        award_close: 240,
        recovery_deadline: 260,
    })
}

fn input(
    case_id: Vec<u8>,
    worker: &str,
) -> FundedRescueJobInput {
    FundedRescueJobInput {
        case_id,
        worker: account(worker),
        worker_reward: U128(25),
        rescue_cap: U128(5),
        result_profile: RescueResultProfile::ExactCommitment,
        result_commitment: vec![9; 32],
        threshold: None,
        final_deadline: 300,
    }
}

fn fund(
    c: &mut Nomogenesis,
    case_id: Vec<u8>,
    buyer: &str,
    worker: &str,
) -> u64 {
    context(buyer, 110, 0);
    let quote = c.m3_storage_quote().job_storage_cost.0;

    context(buyer, 110, 30 + quote);
    c.create_funded_rescue_job(input(case_id, worker))
}

#[test]
fn buyer_cancels_reward_and_open_cap_exactly_once() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(
        &mut c,
        case_id,
        "buyer.near",
        "worker.near",
    );

    context("outsider.near", 150, 0);
    rejected(|| c.cancel_unaccepted_rescue_job(job_id));

    assert_eq!(c.rescue_escrow_total(), U128(30));
    assert_eq!(c.get_claimable(account("buyer.near")), U128(0));

    context("buyer.near", 150, 0);
    c.cancel_unaccepted_rescue_job(job_id);

    assert_eq!(c.rescue_escrow_total(), U128(0));
    assert_eq!(c.get_claimable(account("buyer.near")), U128(30));
    assert_eq!(c.claimable_total(), U128(30));

    let job = c.get_rescue_job(job_id).unwrap();
    assert_eq!(job.phase, RescueJobPhase::Cancelled);
    assert_eq!(job.held_worker_reward, U128(0));

    let mandate = c.get_rescue_mandate(job_id).unwrap();
    assert_eq!(mandate.phase, RescueMandatePhase::Released);
    assert_eq!(mandate.held_principal, U128(0));
    assert_eq!(
        mandate.release_reason,
        Some(MandateReleaseReason::JobCancelled)
    );

    rejected(|| c.cancel_unaccepted_rescue_job(job_id));

    assert_eq!(c.rescue_escrow_total(), U128(0));
    assert_eq!(c.get_claimable(account("buyer.near")), U128(30));
}

#[test]
fn accept_and_cancel_have_only_one_valid_order() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);

    let cancelled = fund(
        &mut c,
        case_id.clone(),
        "buyer-a.near",
        "worker-a.near",
    );

    context("buyer-a.near", 140, 0);
    c.cancel_unaccepted_rescue_job(cancelled);

    context("worker-a.near", 150, 0);
    rejected(|| c.accept_rescue_job(cancelled));

    let accepted = fund(
        &mut c,
        case_id,
        "buyer-b.near",
        "worker-b.near",
    );

    context("worker-b.near", 150, 0);
    c.accept_rescue_job(accepted);

    context("buyer-b.near", 160, 0);
    rejected(|| c.cancel_unaccepted_rescue_job(accepted));

    assert_eq!(
        c.get_rescue_job(cancelled).unwrap().phase,
        RescueJobPhase::Cancelled
    );
    assert_eq!(
        c.get_rescue_job(accepted).unwrap().phase,
        RescueJobPhase::Accepted
    );
    assert_eq!(c.get_claimable(account("buyer-a.near")), U128(30));
    assert_eq!(c.get_claimable(account("buyer-b.near")), U128(0));
    assert_eq!(c.rescue_escrow_total(), U128(30));
}

#[test]
fn mandate_revoke_releases_only_cap_and_preserves_job() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(
        &mut c,
        case_id,
        "buyer.near",
        "worker.near",
    );

    context("worker.near", 140, 0);
    c.accept_rescue_job(job_id);

    context("outsider.near", 150, 0);
    rejected(|| c.revoke_open_rescue_mandate(job_id));

    context("buyer.near", 160, 0);
    c.revoke_open_rescue_mandate(job_id);

    let job = c.get_rescue_job(job_id).unwrap();
    assert_eq!(job.phase, RescueJobPhase::Accepted);
    assert_eq!(job.held_worker_reward, U128(25));

    let mandate = c.get_rescue_mandate(job_id).unwrap();
    assert_eq!(mandate.phase, RescueMandatePhase::Released);
    assert_eq!(mandate.held_principal, U128(0));
    assert_eq!(
        mandate.release_reason,
        Some(MandateReleaseReason::Revoked)
    );

    assert_eq!(c.get_claimable(account("buyer.near")), U128(5));
    assert_eq!(c.claimable_total(), U128(5));
    assert_eq!(c.rescue_escrow_total(), U128(25));

    rejected(|| c.revoke_open_rescue_mandate(job_id));

    context("buyer.near", 170, 0);
    rejected(|| c.cancel_unaccepted_rescue_job(job_id));

    assert_eq!(c.get_claimable(account("buyer.near")), U128(5));
    assert_eq!(c.rescue_escrow_total(), U128(25));
}

#[test]
fn revoked_cap_then_cancel_releases_only_reward() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(
        &mut c,
        case_id,
        "buyer.near",
        "worker.near",
    );

    context("buyer.near", 140, 0);
    c.revoke_open_rescue_mandate(job_id);

    assert_eq!(c.get_claimable(account("buyer.near")), U128(5));
    assert_eq!(c.rescue_escrow_total(), U128(25));

    context("buyer.near", 150, 0);
    c.cancel_unaccepted_rescue_job(job_id);

    assert_eq!(c.get_claimable(account("buyer.near")), U128(30));
    assert_eq!(c.claimable_total(), U128(30));
    assert_eq!(c.rescue_escrow_total(), U128(0));

    let mandate = c.get_rescue_mandate(job_id).unwrap();
    assert_eq!(mandate.phase, RescueMandatePhase::Released);
    assert_eq!(
        mandate.release_reason,
        Some(MandateReleaseReason::Revoked)
    );
    assert_eq!(
        c.get_rescue_job(job_id).unwrap().phase,
        RescueJobPhase::Cancelled
    );
}

#[test]
fn claimable_overflow_preserves_job_mandate_and_escrow() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(
        &mut c,
        case_id,
        "buyer.near",
        "worker.near",
    );

    c.claimables
        .insert(account("buyer.near"), u128::MAX);
    c.claimable_total = u128::MAX;

    context("buyer.near", 150, 0);
    rejected(|| c.cancel_unaccepted_rescue_job(job_id));

    assert_eq!(
        c.get_rescue_job(job_id).unwrap().phase,
        RescueJobPhase::Funded
    );
    assert_eq!(
        c.get_rescue_job(job_id).unwrap().held_worker_reward,
        U128(25)
    );
    assert_eq!(
        c.get_rescue_mandate(job_id).unwrap().phase,
        RescueMandatePhase::Open
    );
    assert_eq!(
        c.get_rescue_mandate(job_id).unwrap().held_principal,
        U128(5)
    );
    assert_eq!(c.rescue_escrow_total(), U128(30));
    assert_eq!(
        c.get_claimable(account("buyer.near")),
        U128(u128::MAX)
    );
    assert_eq!(c.claimable_total(), U128(u128::MAX));
}

#[test]
fn manual_release_state_survives_reload() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(
        &mut c,
        case_id,
        "buyer.near",
        "worker.near",
    );

    context("buyer.near", 140, 0);
    c.revoke_open_rescue_mandate(job_id);

    context("buyer.near", 150, 0);
    c.cancel_unaccepted_rescue_job(job_id);

    c.rescue_cases.flush();
    c.rescue_jobs.flush();
    c.rescue_mandates.flush();
    c.claimables.flush();
    env::state_write(&c);
    drop(c);

    let reloaded: Nomogenesis =
        env::state_read().expect("state missing");

    assert_eq!(
        reloaded.get_rescue_job(job_id).unwrap().phase,
        RescueJobPhase::Cancelled
    );
    assert_eq!(
        reloaded.get_rescue_mandate(job_id)
            .unwrap()
            .release_reason,
        Some(MandateReleaseReason::Revoked)
    );
    assert_eq!(
        reloaded.get_claimable(account("buyer.near")),
        U128(30)
    );
    assert_eq!(reloaded.claimable_total(), U128(30));
    assert_eq!(reloaded.rescue_escrow_total(), U128(0));
}
'''

worklog = r'''# M3-R2-03A — manual pre-award liability release

**Status:** scaffolded
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `f19bad9`

## Purpose

Add the first terminal release paths for funded M3 principal:

- buyer cancellation of an unaccepted rescue job;
- buyer revocation of an open rescue mandate;
- exact one-time movement from `rescue_escrow` to the buyer's
  authenticated claimable balance;
- preservation of independent worker-reward and rescue-cap lifecycles.

This ticket does not add permissionless deadline expiry. That remains R2-03B.

## Economic rules

Cancellation before the dependency deadline releases:

- the still-held worker reward; and
- the rescue cap only when its mandate is still open.

A previously revoked mandate is not credited twice. Its release reason remains
`Revoked`.

Mandate revocation releases only the still-held rescue cap. It does not cancel
or pay the worker job.

Every successful release performs equal and opposite accounting:

`rescue_escrow -= released`
`claimable_total += released`
`claimable[buyer] += released`

## Intended evidence

- only the buyer may cancel or revoke;
- accept/cancel ordering has one valid terminal outcome;
- cancellation releases reward plus an open cap once;
- revocation releases only the cap;
- revoke-then-cancel releases the two principals once each;
- claimable overflow changes no persistent job, mandate or escrow state;
- terminal state and totals survive reload.

## Files

- `src/lib.rs`
- `src/rescue_release_tests.rs`
- `scripts/m3/m3_r2_03a_manual_release.py`
- `docs/worklog/M3-R2-03A-manual-release.md`

## Next single action

Run focused tests. If green, run the full Rust, Clippy, WASM and diff gates before
committing. Then implement R2-03B permissionless deadline expiry.
'''

write("src/lib.rs", lib)
write("src/rescue_release_tests.rs", tests)
write("docs/worklog/M3-R2-03A-manual-release.md", worklog)

print("M3-R2-03A SCAFFOLD PASS")
for name in (
    "src/lib.rs",
    "src/rescue_release_tests.rs",
    "docs/worklog/M3-R2-03A-manual-release.md",
    "scripts/m3/m3_r2_03a_manual_release.py",
):
    print(name)
