use super::*;
use crate::rescue::{
    FundedRescueJobInput, RescueCaseDescriptorInput, RescueJobPhase, RescueMandatePhase,
    RescueResultProfile,
};

use near_sdk::{NearToken, test_utils::VMContextBuilder, testing_env};

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

fn job_input(case_id: Vec<u8>, worker: &str, reward: u128, cap: u128) -> FundedRescueJobInput {
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
    c.create_funded_rescue_job(job_input(case_id, worker, reward, cap))
}

#[test]
fn funding_atomically_creates_job_mandate_and_liability() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);

    context("buyer.near", 110, 0);
    let job_quote = c.m3_storage_quote().job_storage_cost.0;
    let before = env::storage_usage();

    context("buyer.near", 110, 30 + job_quote);
    let job_id = c.create_funded_rescue_job(job_input(case_id.clone(), "worker.near", 25, 5));

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
            c.create_funded_rescue_job(job_input(case_id.clone(), "worker.near", 25, 5));
        });
    }

    context("buyer.near", 110, quote + 5);
    rejected(|| {
        c.create_funded_rescue_job(job_input(case_id.clone(), "worker.near", 0, 5));
    });

    context("buyer.near", 110, quote + 25);
    rejected(|| {
        c.create_funded_rescue_job(job_input(case_id.clone(), "worker.near", 25, 0));
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

        let id = fund(&mut c, case_id.clone(), &buyer, &worker, 25, 5);
        assert_eq!(id, index);
    }

    context("buyer0.near", 120, 30 + crate::rescue::job_storage_cost());
    rejected(|| {
        c.create_funded_rescue_job(job_input(case_id.clone(), "other-worker.near", 25, 5));
    });

    context("buyer6.near", 120, 30 + crate::rescue::job_storage_cost());
    rejected(|| {
        c.create_funded_rescue_job(job_input(case_id.clone(), "worker6.near", 25, 5));
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
    let job_id = fund(&mut c, case_id, "buyer.near", "worker.near", 25, 5);

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
    let mut malformed = job_input(case_id.clone(), "buyer.near", 25, 5);
    malformed.result_commitment = vec![1; 31];
    rejected(|| c.create_funded_rescue_job(malformed));

    context("buyer.near", 110, 30 + quote);
    let mut mismatch = job_input(case_id.clone(), "worker.near", 25, 5);
    mismatch.result_profile = RescueResultProfile::MinimumThreshold;
    mismatch.threshold = None;
    rejected(|| c.create_funded_rescue_job(mismatch));

    context("buyer.near", 110, 30 + quote);
    let mut bad_deadline = job_input(case_id.clone(), "worker.near", 25, 5);
    bad_deadline.final_deadline = 260;
    rejected(|| c.create_funded_rescue_job(bad_deadline));

    context("buyer.near", 110, 0);
    rejected(|| {
        c.create_funded_rescue_job(job_input(case_id.clone(), "worker.near", u128::MAX, 1));
    });

    c.rescue_escrow = u128::MAX;
    context("buyer.near", 110, 30 + quote);
    rejected(|| {
        c.create_funded_rescue_job(job_input(case_id.clone(), "worker.near", 25, 5));
    });

    assert_eq!(c.next_rescue_job_id(), 0);
    assert_eq!(c.rescue_escrow_total(), U128(u128::MAX));
    assert!(c.get_rescue_case(case_id).unwrap().job_ids.is_empty());
}

#[test]
fn funded_job_and_acceptance_survive_state_reload() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(&mut c, case_id, "buyer.near", "worker.near", 25, 5);

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
