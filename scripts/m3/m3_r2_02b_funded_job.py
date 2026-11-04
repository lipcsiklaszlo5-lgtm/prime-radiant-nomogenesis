from pathlib import Path
import subprocess
import sys

BASE = "df44175"

def fail(message: str) -> None:
    print(f"M3-R2-02B SCAFFOLD FAIL: {message}")
    sys.exit(2)

def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"{name}: expected one target, found {count}")
    return text.replace(old, new, 1)

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

expected_status = {
    "?? sandbox/real_low_margin_audit.cjs",
    "?? scripts/m3/m3_r2_02b_funded_job.py",
}

if branch != "feat/m2-escrow":
    fail(f"unexpected branch: {branch}")
if head != BASE:
    fail(f"unexpected HEAD: {head}")
if status != expected_status:
    fail(f"unexpected status: {sorted(status)}")

for name in (
    "src/rescue_funding_tests.rs",
    "docs/worklog/M3-R2-02B-funded-job.md",
):
    if Path(name).exists():
        fail(f"target already exists: {name}")

rescue_path = Path("src/rescue.rs")
rescue = rescue_path.read_text(encoding="utf-8")

rescue_addition = r'''
#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueResultProfile {
    ExactCommitment,
    MinimumThreshold,
}

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FundedRescueJobInput {
    pub case_id: Vec<u8>,
    pub worker: AccountId,
    pub worker_reward: U128,
    pub rescue_cap: U128,
    pub result_profile: RescueResultProfile,
    pub result_commitment: Vec<u8>,
    pub threshold: Option<U128>,
    pub final_deadline: u64,
}

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueJobView {
    pub id: u64,
    pub case_id: Vec<u8>,
    pub buyer: AccountId,
    pub worker: AccountId,
    pub worker_reward: U128,
    pub held_worker_reward: U128,
    pub result_profile: RescueResultProfile,
    pub result_commitment: Vec<u8>,
    pub threshold: Option<U128>,
    pub final_deadline: u64,
    pub phase: RescueJobPhase,
}

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueMandateView {
    pub job_id: u64,
    pub original_cap: U128,
    pub held_principal: U128,
    pub phase: RescueMandatePhase,
    pub locked_bundle_id: Option<u64>,
    pub locked_allocation: Option<U128>,
    pub release_reason: Option<MandateReleaseReason>,
}

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct M3TotalsView {
    pub rescue_escrow: U128,
    pub storage_reserves: U128,
    pub next_rescue_job_id: u64,
}

impl From<&RescueJob> for RescueJobView {
    fn from(value: &RescueJob) -> Self {
        Self {
            id: value.id,
            case_id: value.case_id.to_vec(),
            buyer: value.buyer.clone(),
            worker: value.worker.clone(),
            worker_reward: U128(value.worker_reward),
            held_worker_reward: U128(value.held_worker_reward),
            result_profile: if value.threshold.is_some() {
                RescueResultProfile::MinimumThreshold
            } else {
                RescueResultProfile::ExactCommitment
            },
            result_commitment: value.result_commitment.to_vec(),
            threshold: value.threshold.map(U128),
            final_deadline: value.final_deadline,
            phase: value.phase.clone(),
        }
    }
}

impl From<&RescueMandate> for RescueMandateView {
    fn from(value: &RescueMandate) -> Self {
        Self {
            job_id: value.job_id,
            original_cap: U128(value.original_cap),
            held_principal: U128(value.held_principal),
            phase: value.phase.clone(),
            locked_bundle_id: value.locked_bundle_id,
            locked_allocation: value.locked_allocation.map(U128),
            release_reason: value.release_reason.clone(),
        }
    }
}

pub fn parse_result_commitment(
    value: Vec<u8>,
) -> Result<[u8; COMMITMENT_BYTES], &'static str> {
    value
        .try_into()
        .map_err(|_| "invalid result commitment")
}

pub fn validated_threshold(
    profile: &RescueResultProfile,
    threshold: Option<U128>,
) -> Result<Option<u128>, &'static str> {
    match (profile, threshold) {
        (RescueResultProfile::ExactCommitment, None) => Ok(None),
        (RescueResultProfile::MinimumThreshold, Some(U128(value)))
            if value > 0 =>
        {
            Ok(Some(value))
        }
        _ => Err("result profile and threshold mismatch"),
    }
}
'''

if "pub struct FundedRescueJobInput" in rescue:
    fail("src/rescue.rs: funded job input already exists")

rescue = rescue.rstrip() + "\n\n" + rescue_addition.strip() + "\n"
rescue_path.write_text(rescue, encoding="utf-8")

lib_path = Path("src/lib.rs")
lib = lib_path.read_text(encoding="utf-8")

job_methods = r'''
    pub fn m3_totals(&self) -> rescue::M3TotalsView {
        rescue::M3TotalsView {
            rescue_escrow: U128(self.rescue_escrow),
            storage_reserves: U128(self.storage_reserves),
            next_rescue_job_id: self.next_rescue_job_id,
        }
    }

    pub fn get_rescue_job(&self, job_id: u64) -> Option<rescue::RescueJobView> {
        self.rescue_jobs
            .get(&job_id)
            .map(rescue::RescueJobView::from)
    }

    pub fn get_rescue_mandate(
        &self,
        job_id: u64,
    ) -> Option<rescue::RescueMandateView> {
        self.rescue_mandates
            .get(&job_id)
            .map(rescue::RescueMandateView::from)
    }

    #[payable]
    pub fn create_funded_rescue_job(
        &mut self,
        input: rescue::FundedRescueJobInput,
    ) -> u64 {
        let buyer = env::predecessor_account_id();
        let now = env::block_timestamp();

        let rescue::FundedRescueJobInput {
            case_id,
            worker,
            worker_reward,
            rescue_cap,
            result_profile,
            result_commitment,
            threshold,
            final_deadline,
        } = input;

        let case_id =
            rescue::parse_case_id(case_id).expect("invalid rescue case ID");
        let mut case = self
            .rescue_cases
            .get(&case_id)
            .cloned()
            .expect("unknown rescue case");

        assert_eq!(
            case.phase,
            rescue::RescueCasePhase::Open,
            "rescue case is not open"
        );
        assert!(
            now < case.dependency_deadline,
            "dependency deadline passed"
        );
        assert!(
            case.job_ids.len() < rescue::MAX_RESCUE_JOBS,
            "rescue case is full"
        );
        assert_ne!(buyer, worker, "buyer and worker must differ");
        assert_ne!(
            worker,
            env::current_account_id(),
            "contract cannot be worker"
        );
        assert!(worker_reward.0 > 0, "zero worker reward");
        assert!(rescue_cap.0 > 0, "zero rescue cap");
        assert!(
            final_deadline > case.recovery_deadline,
            "job deadline must follow recovery deadline"
        );

        for existing_id in &case.job_ids {
            let existing = self
                .rescue_jobs
                .get(existing_id)
                .expect("case job index is corrupt");
            assert_ne!(
                existing.buyer, buyer,
                "buyer already registered in rescue case"
            );
        }

        let result_commitment =
            rescue::parse_result_commitment(result_commitment)
                .expect("invalid result commitment");
        let threshold =
            rescue::validated_threshold(&result_profile, threshold)
                .expect("invalid result profile");

        let principal = worker_reward
            .0
            .checked_add(rescue_cap.0)
            .expect("rescue principal overflow");
        let storage_payment = rescue::job_storage_cost();
        let required = principal
            .checked_add(storage_payment)
            .expect("rescue job deposit overflow");

        assert_eq!(
            env::attached_deposit().as_yoctonear(),
            required,
            "incorrect funded rescue job deposit"
        );

        let next_id = self
            .next_rescue_job_id
            .checked_add(1)
            .expect("rescue job ID overflow");
        let next_escrow = self
            .rescue_escrow
            .checked_add(principal)
            .expect("rescue escrow overflow");
        let next_storage = self
            .storage_reserves
            .checked_add(storage_payment)
            .expect("storage reserve overflow");

        let job_id = self.next_rescue_job_id;
        assert!(
            self.rescue_jobs.get(&job_id).is_none()
                && self.rescue_mandates.get(&job_id).is_none(),
            "rescue job ID already used"
        );

        case.job_ids.push(job_id);

        self.rescue_jobs.insert(
            job_id,
            rescue::RescueJob {
                id: job_id,
                case_id,
                buyer,
                worker,
                worker_reward: worker_reward.0,
                held_worker_reward: worker_reward.0,
                result_commitment,
                threshold,
                final_deadline,
                phase: rescue::RescueJobPhase::Funded,
            },
        );

        self.rescue_mandates.insert(
            job_id,
            rescue::RescueMandate {
                job_id,
                original_cap: rescue_cap.0,
                held_principal: rescue_cap.0,
                phase: rescue::RescueMandatePhase::Open,
                locked_bundle_id: None,
                locked_allocation: None,
                release_reason: None,
            },
        );

        self.rescue_cases.insert(case_id, case);
        self.next_rescue_job_id = next_id;
        self.rescue_escrow = next_escrow;
        self.storage_reserves = next_storage;

        job_id
    }

    pub fn accept_rescue_job(&mut self, job_id: u64) {
        let caller = env::predecessor_account_id();
        let job = self
            .rescue_jobs
            .get(&job_id)
            .cloned()
            .expect("unknown rescue job");

        assert_eq!(caller, job.worker, "not designated worker");
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
            env::block_timestamp() < case.dependency_deadline,
            "dependency deadline passed"
        );

        self.rescue_jobs.get_mut(&job_id).unwrap().phase =
            rescue::RescueJobPhase::Accepted;
    }
'''

lib = replace_once(
    lib,
    """    pub fn rescue_escrow_total(&self) -> U128 {""",
    job_methods.strip("\n") + """

    pub fn rescue_escrow_total(&self) -> U128 {""",
    "src/lib.rs funded job methods",
)

lib = replace_once(
    lib,
    """#[cfg(test)]
mod rescue_case_tests;

#[cfg(test)]
mod storage_admission_tests;""",
    """#[cfg(test)]
mod rescue_case_tests;

#[cfg(test)]
mod rescue_funding_tests;

#[cfg(test)]
mod storage_admission_tests;""",
    "src/lib.rs funding test module",
)

lib_path.write_text(lib, encoding="utf-8")

Path("src/rescue_funding_tests.rs").write_text(r'''
use super::*;
use crate::rescue::{
    FundedRescueJobInput, RescueCaseDescriptorInput, RescueJobPhase,
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
    let case_id = c.create_rescue_case(RescueCaseDescriptorInput {
        descriptor_version: 1,
        original_provider: account("source.near"),
        component_commitments: vec![vec![1; 32], vec![2; 32]],
        dependency_deadline: 200,
        bid_close: 220,
        award_close: 240,
        recovery_deadline: 260,
    });

    c.rescue_cases.flush();
    case_id
}

fn job_input(
    case_id: Vec<u8>,
    worker: &str,
    reward: u128,
    cap: u128,
) -> FundedRescueJobInput {
    FundedRescueJobInput {
        case_id,
        worker: account(worker),
        worker_reward: U128(reward),
        rescue_cap: U128(cap),
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
    reward: u128,
    cap: u128,
) -> u64 {
    context(buyer, 110, 0);
    let quote = c.m3_storage_quote().job_storage_cost.0;
    let required = reward.checked_add(cap).unwrap().checked_add(quote).unwrap();

    context(buyer, 110, required);
    c.create_funded_rescue_job(job_input(
        case_id,
        worker,
        reward,
        cap,
    ))
}

#[test]
fn funding_atomically_creates_job_mandate_and_liability() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);

    context("buyer.near", 110, 0);
    let job_quote = c.m3_storage_quote().job_storage_cost.0;
    let before = env::storage_usage();

    context("buyer.near", 110, 30 + job_quote);
    let job_id = c.create_funded_rescue_job(job_input(
        case_id.clone(),
        "worker.near",
        25,
        5,
    ));

    c.rescue_cases.flush();
    c.rescue_jobs.flush();
    c.rescue_mandates.flush();
    let measured = env::storage_usage() - before;

    println!(
        "M3_JOB_STORAGE measured={} quoted={}",
        measured,
        crate::rescue::JOB_STORAGE_BYTES
    );

    assert!(measured > 0);
    assert!(measured <= crate::rescue::JOB_STORAGE_BYTES);
    assert_eq!(job_id, 0);
    assert_eq!(c.rescue_escrow_total(), U128(30));

    let job = c.get_rescue_job(job_id).unwrap();
    assert_eq!(job.buyer, account("buyer.near"));
    assert_eq!(job.worker, account("worker.near"));
    assert_eq!(job.worker_reward, U128(25));
    assert_eq!(job.held_worker_reward, U128(25));
    assert_eq!(job.phase, RescueJobPhase::Funded);

    let mandate = c.get_rescue_mandate(job_id).unwrap();
    assert_eq!(mandate.original_cap, U128(5));
    assert_eq!(mandate.held_principal, U128(5));
    assert_eq!(mandate.phase, RescueMandatePhase::Open);

    let case = c.get_rescue_case(case_id).unwrap();
    assert_eq!(case.job_ids, vec![job_id]);

    let totals = c.m3_totals();
    assert_eq!(totals.rescue_escrow, U128(30));
    assert_eq!(totals.next_rescue_job_id, 1);
}

#[test]
fn exact_deposit_and_positive_principal_are_required() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);

    context("buyer.near", 110, 0);
    let quote = c.m3_storage_quote().job_storage_cost.0;
    let required = 30 + quote;

    for deposit in [0, required - 1, required + 1] {
        context("buyer.near", 110, deposit);
        rejected(|| {
            c.create_funded_rescue_job(job_input(
                case_id.clone(),
                "worker.near",
                25,
                5,
            ));
        });
    }

    context("buyer.near", 110, quote + 5);
    rejected(|| {
        c.create_funded_rescue_job(job_input(
            case_id.clone(),
            "worker.near",
            0,
            5,
        ));
    });

    context("buyer.near", 110, quote + 25);
    rejected(|| {
        c.create_funded_rescue_job(job_input(
            case_id.clone(),
            "worker.near",
            25,
            0,
        ));
    });

    assert_eq!(c.next_rescue_job_id(), 0);
    assert_eq!(c.rescue_escrow_total(), U128(0));
    assert!(!c.has_rescue_job(0));
    assert!(!c.has_rescue_mandate(0));
    assert!(c.get_rescue_case(case_id).unwrap().job_ids.is_empty());
}

#[test]
fn duplicate_buyer_and_seventh_job_are_rejected() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);

    for index in 0..6 {
        let buyer = format!("buyer{index}.near");
        let worker = format!("worker{index}.near");

        let id = fund(
            &mut c,
            case_id.clone(),
            &buyer,
            &worker,
            25,
            5,
        );
        assert_eq!(id, index);
    }

    context("buyer0.near", 120, 30 + crate::rescue::job_storage_cost());
    rejected(|| {
        c.create_funded_rescue_job(job_input(
            case_id.clone(),
            "other-worker.near",
            25,
            5,
        ));
    });

    context("buyer6.near", 120, 30 + crate::rescue::job_storage_cost());
    rejected(|| {
        c.create_funded_rescue_job(job_input(
            case_id.clone(),
            "worker6.near",
            25,
            5,
        ));
    });

    assert_eq!(c.next_rescue_job_id(), 6);
    assert_eq!(c.rescue_escrow_total(), U128(180));
    assert_eq!(c.get_rescue_case(case_id).unwrap().job_ids.len(), 6);
    assert!(!c.has_rescue_job(6));
}

#[test]
fn only_worker_accepts_before_dependency_deadline_once() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(
        &mut c,
        case_id,
        "buyer.near",
        "worker.near",
        25,
        5,
    );

    context("outsider.near", 150, 0);
    rejected(|| c.accept_rescue_job(job_id));
    assert_eq!(
        c.get_rescue_job(job_id).unwrap().phase,
        RescueJobPhase::Funded
    );

    context("worker.near", 150, 0);
    c.accept_rescue_job(job_id);

    assert_eq!(
        c.get_rescue_job(job_id).unwrap().phase,
        RescueJobPhase::Accepted
    );
    assert_eq!(c.rescue_escrow_total(), U128(30));

    rejected(|| c.accept_rescue_job(job_id));
    assert_eq!(c.rescue_escrow_total(), U128(30));
}

#[test]
fn malformed_and_overflowing_funding_is_atomic() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let quote = crate::rescue::job_storage_cost();

    context("buyer.near", 110, 30 + quote);
    let mut malformed = job_input(
        case_id.clone(),
        "buyer.near",
        25,
        5,
    );
    malformed.result_commitment = vec![1; 31];
    rejected(|| c.create_funded_rescue_job(malformed));

    context("buyer.near", 110, 30 + quote);
    let mut mismatch = job_input(
        case_id.clone(),
        "worker.near",
        25,
        5,
    );
    mismatch.result_profile = RescueResultProfile::MinimumThreshold;
    mismatch.threshold = None;
    rejected(|| c.create_funded_rescue_job(mismatch));

    context("buyer.near", 110, 30 + quote);
    let mut bad_deadline = job_input(
        case_id.clone(),
        "worker.near",
        25,
        5,
    );
    bad_deadline.final_deadline = 260;
    rejected(|| c.create_funded_rescue_job(bad_deadline));

    context("buyer.near", 110, 0);
    rejected(|| {
        c.create_funded_rescue_job(job_input(
            case_id.clone(),
            "worker.near",
            u128::MAX,
            1,
        ));
    });

    c.rescue_escrow = u128::MAX;
    context("buyer.near", 110, 30 + quote);
    rejected(|| {
        c.create_funded_rescue_job(job_input(
            case_id.clone(),
            "worker.near",
            25,
            5,
        ));
    });

    assert_eq!(c.next_rescue_job_id(), 0);
    assert_eq!(c.rescue_escrow_total(), U128(u128::MAX));
    assert!(c.get_rescue_case(case_id).unwrap().job_ids.is_empty());
}

#[test]
fn funded_job_and_acceptance_survive_state_reload() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(
        &mut c,
        case_id,
        "buyer.near",
        "worker.near",
        25,
        5,
    );

    context("worker.near", 150, 0);
    c.accept_rescue_job(job_id);

    c.rescue_cases.flush();
    c.rescue_jobs.flush();
    c.rescue_mandates.flush();
    env::state_write(&c);
    drop(c);

    let reloaded: Nomogenesis = env::state_read().expect("state missing");

    assert_eq!(
        reloaded.get_rescue_job(job_id).unwrap().phase,
        RescueJobPhase::Accepted
    );
    assert_eq!(
        reloaded.get_rescue_mandate(job_id).unwrap().phase,
        RescueMandatePhase::Open
    );
    assert_eq!(reloaded.rescue_escrow_total(), U128(30));
    assert_eq!(reloaded.next_rescue_job_id(), 1);
}
'''.strip() + "\n", encoding="utf-8")

Path("docs/worklog/M3-R2-02B-funded-job.md").write_text(r'''
# M3-R2-02B — Atomic funded rescue job and mandate

**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `df44175`
**State:** scaffold generated; verification pending

## Purpose

Enable the first M3 economic transaction: a buyer atomically creates one
worker job and one bounded rescue mandate with fully attached principal.

## Funding identity

Required attached value is exactly:

`worker_reward + rescue_cap + job_storage_quote`

The economic principal enters `rescue_escrow`. Storage payment enters
`storage_reserves`. Worker acceptance changes authority state but does not
create, release or reclassify money.

## Enforced boundaries

- authenticated buyer from `predecessor_account_id`;
- distinct buyer and worker;
- existing open case before dependency deadline;
- final job deadline after recovery deadline;
- positive reward and rescue cap;
- exact result commitment and profile/threshold pairing;
- one buyer per case;
- at most six jobs per case;
- checked principal, escrow, storage and ID arithmetic;
- rejected calls consume no ID and create no partial record.

## Builder command

`python3 scripts/m3/m3_r2_02b_funded_job.py`

## Intended verification

- exact deposit and atomic dual-record creation;
- liability and storage separation;
- buyer duplication and six-job boundary;
- worker authorization, deadline and replay;
- malformed and overflow rejection;
- state reload;
- full Rust regression, Clippy, WASM and diff checks.

## Claim boundary

This checkpoint does not release principal, award bundles, accept recovery
proofs or perform native payout. Sandbox deposit evidence remains pending.

## Exactly one next action

Verify R2-02B before commit.
'''.strip() + "\n", encoding="utf-8")

for name in (
    "src/rescue.rs",
    "src/lib.rs",
    "src/rescue_funding_tests.rs",
    "docs/worklog/M3-R2-02B-funded-job.md",
):
    text = Path(name).read_text(encoding="utf-8")
    if any(line.rstrip() != line for line in text.splitlines()):
        fail(f"trailing whitespace in {name}")

required = {
    "src/rescue.rs": (
        "pub struct FundedRescueJobInput",
        "pub struct RescueJobView",
        "pub struct RescueMandateView",
        "pub struct M3TotalsView",
    ),
    "src/lib.rs": (
        "pub fn create_funded_rescue_job",
        "pub fn accept_rescue_job",
        "rescue_escrow = next_escrow",
        "mod rescue_funding_tests",
    ),
    "src/rescue_funding_tests.rs": (
        "M3_JOB_STORAGE",
        "duplicate_buyer_and_seventh_job_are_rejected",
        "funded_job_and_acceptance_survive_state_reload",
    ),
}

for name, markers in required.items():
    text = Path(name).read_text(encoding="utf-8")
    for marker in markers:
        if marker not in text:
            fail(f"{name}: missing marker {marker}")

print("M3-R2-02B SCAFFOLD PASS")
for name in (
    "src/rescue.rs",
    "src/lib.rs",
    "src/rescue_funding_tests.rs",
    "docs/worklog/M3-R2-02B-funded-job.md",
    "scripts/m3/m3_r2_02b_funded_job.py",
):
    print(name)
