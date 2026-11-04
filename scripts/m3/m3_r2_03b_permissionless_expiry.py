from pathlib import Path
import subprocess
import sys

BASE = "a083eb2"
AUDIT = "?? sandbox/real_low_margin_audit.cjs"
SELF = "?? scripts/m3/m3_r2_03b_permissionless_expiry.py"

def fail(message: str) -> None:
    print(f"M3-R2-03B SCAFFOLD FAIL: {message}")
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
    "src/rescue_expiry_tests.rs",
    "docs/worklog/M3-R2-03B-permissionless-expiry.md",
):
    if Path(name).exists():
        fail(f"target already exists: {name}")

rescue_path = Path("src/rescue.rs")
rescue = read(str(rescue_path))

reason_anchor = """    JobExpired,
    ZeroAllocation,
"""
if rescue.count(reason_anchor) != 1:
    fail("mandate release reason anchor not found exactly once")

rescue = rescue.replace(
    reason_anchor,
    """    JobExpired,
    AwardExpired,
    ZeroAllocation,
""",
    1,
)

lib_path = Path("src/lib.rs")
lib = read(str(lib_path))

method_anchor = """    pub fn rescue_escrow_total(&self) -> U128 {
"""
if lib.count(method_anchor) != 1:
    fail("rescue escrow method anchor not found exactly once")

methods = r'''    pub fn expire_unaccepted_rescue_job(&mut self, job_id: u64) {
        let now = env::block_timestamp();

        let mut job = self
            .rescue_jobs
            .get(&job_id)
            .cloned()
            .expect("unknown rescue job");

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
            now >= case.dependency_deadline,
            "dependency deadline not reached"
        );

        let mut mandate = self
            .rescue_mandates
            .get(&job_id)
            .cloned()
            .expect("missing rescue mandate");

        let released_cap = match mandate.phase.clone() {
            rescue::RescueMandatePhase::Open => {
                assert!(
                    mandate.held_principal > 0,
                    "empty open rescue mandate"
                );
                assert!(
                    mandate.locked_bundle_id.is_none()
                        && mandate.locked_allocation.is_none(),
                    "open rescue mandate contains a lock"
                );

                let amount = mandate.held_principal;
                mandate.held_principal = 0;
                mandate.phase =
                    rescue::RescueMandatePhase::Released;
                mandate.release_reason =
                    Some(rescue::MandateReleaseReason::JobExpired);
                amount
            }
            rescue::RescueMandatePhase::Released => {
                let valid_reason = mandate.release_reason
                    == Some(rescue::MandateReleaseReason::Revoked)
                    || mandate.release_reason
                        == Some(
                            rescue::MandateReleaseReason::AwardExpired,
                        );

                assert!(
                    valid_reason,
                    "invalid released mandate for job expiry"
                );
                assert_eq!(
                    mandate.held_principal, 0,
                    "released mandate still holds principal"
                );
                0
            }
            rescue::RescueMandatePhase::Locked => {
                panic!("locked mandate on unaccepted rescue job")
            }
        };

        assert!(
            job.held_worker_reward > 0,
            "rescue job has no held worker reward"
        );

        let released = job
            .held_worker_reward
            .checked_add(released_cap)
            .expect("unaccepted expiry credit overflow");

        let next_escrow = self
            .rescue_escrow
            .checked_sub(released)
            .expect("rescue escrow underflow");

        job.held_worker_reward = 0;
        job.phase = rescue::RescueJobPhase::Expired;

        self.credit_accounts(&[(job.buyer.clone(), released)]);
        self.rescue_escrow = next_escrow;
        self.rescue_jobs.insert(job_id, job);
        self.rescue_mandates.insert(job_id, mandate);
    }

    pub fn release_expired_rescue_mandate(&mut self, job_id: u64) {
        let now = env::block_timestamp();

        let job = self
            .rescue_jobs
            .get(&job_id)
            .cloned()
            .expect("unknown rescue job");

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
            now >= case.award_close,
            "award close not reached"
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
            Some(rescue::MandateReleaseReason::AwardExpired);

        self.credit_accounts(&[(job.buyer, released)]);
        self.rescue_escrow = next_escrow;
        self.rescue_mandates.insert(job_id, mandate);
    }

    pub fn expire_rescue_job(&mut self, job_id: u64) {
        let now = env::block_timestamp();

        let mut job = self
            .rescue_jobs
            .get(&job_id)
            .cloned()
            .expect("unknown rescue job");

        assert_eq!(
            job.phase,
            rescue::RescueJobPhase::Accepted,
            "rescue job is not active"
        );
        assert!(
            now >= job.final_deadline,
            "final job deadline not reached"
        );
        assert!(
            job.held_worker_reward > 0,
            "rescue job has no held worker reward"
        );

        let released = job.held_worker_reward;
        let next_escrow = self
            .rescue_escrow
            .checked_sub(released)
            .expect("rescue escrow underflow");

        job.held_worker_reward = 0;
        job.phase = rescue::RescueJobPhase::Expired;

        self.credit_accounts(&[(job.buyer.clone(), released)]);
        self.rescue_escrow = next_escrow;
        self.rescue_jobs.insert(job_id, job);
    }

'''

lib = lib.replace(method_anchor, methods + method_anchor, 1)

module_anchor = """#[cfg(test)]
mod rescue_release_tests;
"""
if lib.count(module_anchor) != 1:
    fail("rescue release test module anchor not found exactly once")

lib = lib.replace(
    module_anchor,
    module_anchor + "\n#[cfg(test)]\nmod rescue_expiry_tests;\n",
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
fn unaccepted_expiry_is_permissionless_at_exact_boundary() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(
        &mut c,
        case_id,
        "buyer.near",
        "worker.near",
    );

    context("outsider.near", 199, 0);
    rejected(|| c.expire_unaccepted_rescue_job(job_id));

    assert_eq!(c.rescue_escrow_total(), U128(30));
    assert_eq!(c.get_claimable(account("buyer.near")), U128(0));

    context("outsider.near", 200, 0);
    c.expire_unaccepted_rescue_job(job_id);

    let job = c.get_rescue_job(job_id).unwrap();
    assert_eq!(job.phase, RescueJobPhase::Expired);
    assert_eq!(job.held_worker_reward, U128(0));

    let mandate = c.get_rescue_mandate(job_id).unwrap();
    assert_eq!(mandate.phase, RescueMandatePhase::Released);
    assert_eq!(mandate.held_principal, U128(0));
    assert_eq!(
        mandate.release_reason,
        Some(MandateReleaseReason::JobExpired)
    );

    assert_eq!(c.get_claimable(account("buyer.near")), U128(30));
    assert_eq!(c.claimable_total(), U128(30));
    assert_eq!(c.rescue_escrow_total(), U128(0));

    rejected(|| c.expire_unaccepted_rescue_job(job_id));

    context("worker.near", 200, 0);
    rejected(|| c.accept_rescue_job(job_id));

    assert_eq!(c.get_claimable(account("buyer.near")), U128(30));
}

#[test]
fn unaccepted_expiry_after_revoke_releases_reward_only() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(
        &mut c,
        case_id,
        "buyer.near",
        "worker.near",
    );

    context("buyer.near", 150, 0);
    c.revoke_open_rescue_mandate(job_id);

    assert_eq!(c.get_claimable(account("buyer.near")), U128(5));
    assert_eq!(c.rescue_escrow_total(), U128(25));

    context("keeper.near", 200, 0);
    c.expire_unaccepted_rescue_job(job_id);

    assert_eq!(c.get_claimable(account("buyer.near")), U128(30));
    assert_eq!(c.claimable_total(), U128(30));
    assert_eq!(c.rescue_escrow_total(), U128(0));

    let mandate = c.get_rescue_mandate(job_id).unwrap();
    assert_eq!(mandate.phase, RescueMandatePhase::Released);
    assert_eq!(
        mandate.release_reason,
        Some(MandateReleaseReason::Revoked)
    );
}

#[test]
fn award_expiry_releases_open_cap_only_at_exact_boundary() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(
        &mut c,
        case_id,
        "buyer.near",
        "worker.near",
    );

    context("worker.near", 150, 0);
    c.accept_rescue_job(job_id);

    context("outsider.near", 239, 0);
    rejected(|| c.release_expired_rescue_mandate(job_id));

    assert_eq!(c.rescue_escrow_total(), U128(30));

    context("keeper.near", 240, 0);
    c.release_expired_rescue_mandate(job_id);

    assert_eq!(
        c.get_rescue_job(job_id).unwrap().phase,
        RescueJobPhase::Accepted
    );
    assert_eq!(
        c.get_rescue_job(job_id).unwrap().held_worker_reward,
        U128(25)
    );

    let mandate = c.get_rescue_mandate(job_id).unwrap();
    assert_eq!(mandate.phase, RescueMandatePhase::Released);
    assert_eq!(mandate.held_principal, U128(0));
    assert_eq!(
        mandate.release_reason,
        Some(MandateReleaseReason::AwardExpired)
    );

    assert_eq!(c.get_claimable(account("buyer.near")), U128(5));
    assert_eq!(c.rescue_escrow_total(), U128(25));

    rejected(|| c.release_expired_rescue_mandate(job_id));

    assert_eq!(c.get_claimable(account("buyer.near")), U128(5));
}

#[test]
fn award_expiry_cannot_release_locked_mandate() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(
        &mut c,
        case_id,
        "buyer.near",
        "worker.near",
    );

    context("worker.near", 150, 0);
    c.accept_rescue_job(job_id);

    let mandate = c.rescue_mandates.get_mut(&job_id).unwrap();
    mandate.phase = RescueMandatePhase::Locked;
    mandate.locked_bundle_id = Some(7);
    mandate.locked_allocation = Some(5);

    context("keeper.near", 240, 0);
    rejected(|| c.release_expired_rescue_mandate(job_id));

    let mandate = c.get_rescue_mandate(job_id).unwrap();
    assert_eq!(mandate.phase, RescueMandatePhase::Locked);
    assert_eq!(mandate.held_principal, U128(5));
    assert_eq!(mandate.locked_bundle_id, Some(7));
    assert_eq!(mandate.locked_allocation, Some(U128(5)));
    assert_eq!(mandate.release_reason, None);

    assert_eq!(c.get_claimable(account("buyer.near")), U128(0));
    assert_eq!(c.rescue_escrow_total(), U128(30));
}

#[test]
fn accepted_job_expiry_releases_reward_independently() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(
        &mut c,
        case_id,
        "buyer.near",
        "worker.near",
    );

    context("worker.near", 150, 0);
    c.accept_rescue_job(job_id);

    context("outsider.near", 299, 0);
    rejected(|| c.expire_rescue_job(job_id));

    context("keeper.near", 300, 0);
    c.expire_rescue_job(job_id);

    let job = c.get_rescue_job(job_id).unwrap();
    assert_eq!(job.phase, RescueJobPhase::Expired);
    assert_eq!(job.held_worker_reward, U128(0));

    let mandate = c.get_rescue_mandate(job_id).unwrap();
    assert_eq!(mandate.phase, RescueMandatePhase::Open);
    assert_eq!(mandate.held_principal, U128(5));

    assert_eq!(c.get_claimable(account("buyer.near")), U128(25));
    assert_eq!(c.rescue_escrow_total(), U128(5));

    context("another-keeper.near", 300, 0);
    c.release_expired_rescue_mandate(job_id);

    assert_eq!(c.get_claimable(account("buyer.near")), U128(30));
    assert_eq!(c.claimable_total(), U128(30));
    assert_eq!(c.rescue_escrow_total(), U128(0));

    rejected(|| c.expire_rescue_job(job_id));
}

#[test]
fn expiry_credit_overflow_is_atomic() {
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

    context("keeper.near", 200, 0);
    rejected(|| c.expire_unaccepted_rescue_job(job_id));

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
fn permissionless_terminal_state_survives_reload() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(
        &mut c,
        case_id,
        "buyer.near",
        "worker.near",
    );

    context("worker.near", 150, 0);
    c.accept_rescue_job(job_id);

    context("keeper-a.near", 240, 0);
    c.release_expired_rescue_mandate(job_id);

    context("keeper-b.near", 300, 0);
    c.expire_rescue_job(job_id);

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
        RescueJobPhase::Expired
    );
    assert_eq!(
        reloaded.get_rescue_mandate(job_id)
            .unwrap()
            .release_reason,
        Some(MandateReleaseReason::AwardExpired)
    );
    assert_eq!(
        reloaded.get_claimable(account("buyer.near")),
        U128(30)
    );
    assert_eq!(reloaded.claimable_total(), U128(30));
    assert_eq!(reloaded.rescue_escrow_total(), U128(0));
}
'''

worklog = r'''# M3-R2-03B — permissionless deadline expiry

**Status:** scaffolded
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `a083eb2`

## Purpose

Prevent abandoned M3 capital from remaining trapped when a buyer, worker or
keeper stops acting.

This ticket adds three permissionless terminal transitions:

1. unaccepted job expiry at `dependency_deadline`;
2. open mandate release at `award_close`;
3. accepted job expiry at `final_deadline`.

## Boundary rule

Every active action uses a strict pre-deadline condition. Its matching expiry
uses an inclusive post-deadline condition:

- worker acceptance: `now < dependency_deadline`;
- unaccepted expiry: `now >= dependency_deadline`;
- future bundle award: `now < award_close`;
- open-mandate expiry: `now >= award_close`;
- future job proof: `now < final_deadline`;
- accepted-job expiry: `now >= final_deadline`.

There is no timestamp where both competing transitions are valid.

## Economic rules

- Unaccepted expiry returns held worker reward and any still-open rescue cap.
- A previously revoked or award-expired cap is not credited twice.
- Award expiry releases only an open, unlocked cap.
- A locked mandate remains protected for later bundle settlement.
- Accepted-job expiry releases only the worker reward.
- Every release decreases `rescue_escrow` by exactly the claimable credit.
- Any account may trigger expiry, but value always returns to the immutable
  buyer.

## Intended evidence

- exact-boundary behavior;
- permissionless callers cannot redirect value;
- replayed expiry creates no second credit;
- locked mandates cannot escape through award expiry;
- worker reward and rescue cap remain independent;
- overflow preserves all persistent economic state;
- terminal state and totals survive reload.

## Files

- `src/lib.rs`
- `src/rescue.rs`
- `src/rescue_expiry_tests.rs`
- `scripts/m3/m3_r2_03b_permissionless_expiry.py`
- `docs/worklog/M3-R2-03B-permissionless-expiry.md`

## Next single action

Run focused tests. If green, run the complete Rust, Clippy, WASM and diff gates
before committing the completed R2-03 liability lifecycle.
'''

write("src/lib.rs", lib)
write("src/rescue.rs", rescue)
write("src/rescue_expiry_tests.rs", tests)
write(
    "docs/worklog/M3-R2-03B-permissionless-expiry.md",
    worklog,
)

print("M3-R2-03B SCAFFOLD PASS")
for name in (
    "src/lib.rs",
    "src/rescue.rs",
    "src/rescue_expiry_tests.rs",
    "docs/worklog/M3-R2-03B-permissionless-expiry.md",
    "scripts/m3/m3_r2_03b_permissionless_expiry.py",
):
    print(name)
