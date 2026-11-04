use super::*;
use crate::rescue::{
    FundedRescueJobInput, MandateReleaseReason, RescueCaseDescriptorInput, RescueJobPhase,
    RescueMandatePhase, RescueResultProfile,
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

fn input(case_id: Vec<u8>, worker: &str) -> FundedRescueJobInput {
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

fn fund(c: &mut Nomogenesis, case_id: Vec<u8>, buyer: &str, worker: &str) -> u64 {
    context(buyer, 110, 0);
    let quote = c.m3_storage_quote().job_storage_cost.0;

    context(buyer, 110, 30 + quote);
    c.create_funded_rescue_job(input(case_id, worker))
}

#[test]
fn unaccepted_expiry_is_permissionless_at_exact_boundary() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(&mut c, case_id, "buyer.near", "worker.near");

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
    let job_id = fund(&mut c, case_id, "buyer.near", "worker.near");

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
    assert_eq!(mandate.release_reason, Some(MandateReleaseReason::Revoked));
}

#[test]
fn award_expiry_releases_open_cap_only_at_exact_boundary() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(&mut c, case_id, "buyer.near", "worker.near");

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
    let job_id = fund(&mut c, case_id, "buyer.near", "worker.near");

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
    let job_id = fund(&mut c, case_id, "buyer.near", "worker.near");

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
    let job_id = fund(&mut c, case_id, "buyer.near", "worker.near");

    c.claimables.insert(account("buyer.near"), u128::MAX);
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
    assert_eq!(c.get_claimable(account("buyer.near")), U128(u128::MAX));
    assert_eq!(c.claimable_total(), U128(u128::MAX));
}

#[test]
fn permissionless_terminal_state_survives_reload() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let job_id = fund(&mut c, case_id, "buyer.near", "worker.near");

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

    let reloaded: Nomogenesis = env::state_read().expect("state missing");

    assert_eq!(
        reloaded.get_rescue_job(job_id).unwrap().phase,
        RescueJobPhase::Expired
    );
    assert_eq!(
        reloaded.get_rescue_mandate(job_id).unwrap().release_reason,
        Some(MandateReleaseReason::AwardExpired)
    );
    assert_eq!(reloaded.get_claimable(account("buyer.near")), U128(30));
    assert_eq!(reloaded.claimable_total(), U128(30));
    assert_eq!(reloaded.rescue_escrow_total(), U128(0));
}
