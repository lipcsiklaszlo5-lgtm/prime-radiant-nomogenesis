use super::*;

use crate::{
    rescue::{
        FundedRescueJobInput, RescueBundlePhase, RescueCaseDescriptorInput, RescueJobPhase,
        RescueOfferInput, RescueResultProfile,
    },
    rescue_proof::component_metadata_sibling,
    rescue_worker_result::{EXACT_SUM, MINIMUM_SUM, exact_commitment, minimum_commitment},
};

use near_sdk::{NearToken, test_utils::VMContextBuilder, testing_env};

use sha2::{Digest, Sha256};
use std::panic::{AssertUnwindSafe, catch_unwind};

fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}

fn ctx(actor: &str, now: u64, deposit: u128) {
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

fn rejected(call: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(call)).is_err());
}

fn component(index: u8) -> Vec<u8> {
    let rows = if index == 0 {
        [(4u16, 2u64), (8, 3)]
    } else {
        [(4u16, 5u64), (8, 7)]
    };

    let mut payload = vec![1, index + 1, 2];

    for (id, value) in rows {
        payload.extend(id.to_be_bytes());
        payload.extend(value.to_be_bytes());
    }

    payload
}

fn root(payload: &[u8], sibling: &[u8]) -> Vec<u8> {
    let mut leaf = Sha256::new();
    leaf.update([0u8]);
    leaf.update(0u64.to_be_bytes());
    leaf.update((payload.len() as u32).to_be_bytes());
    leaf.update(payload);

    let mut parent = Sha256::new();
    parent.update([1u8]);
    parent.update(leaf.finalize());
    parent.update(sibling);

    parent.finalize().to_vec()
}

fn result_payload(profile: u8, job_id: u64, result: u128) -> Vec<u8> {
    let mut bytes = vec![1u8, profile];
    bytes.extend(job_id.to_be_bytes());
    bytes.extend(result.to_be_bytes());
    bytes
}

type WorkerFixture = (Nomogenesis, [Vec<u8>; 2], [Vec<u8>; 2], Vec<u8>, Vec<u8>);

fn fixture(minimum: Option<u128>) -> WorkerFixture {
    let payloads = [component(0), component(1)];

    let siblings = [
        component_metadata_sibling(0).to_vec(),
        component_metadata_sibling(1).to_vec(),
    ];

    let commitments = payloads
        .iter()
        .enumerate()
        .map(|(i, payload)| root(payload, &siblings[i]))
        .collect();

    let mut c = Nomogenesis::default();

    ctx("creator.near", 100, rescue::case_storage_cost());

    let case_id = c.create_rescue_case(RescueCaseDescriptorInput {
        descriptor_version: 1,
        original_provider: account("source.near"),
        component_commitments: commitments,
        dependency_deadline: 200,
        bid_close: 220,
        award_close: 240,
        recovery_deadline: 260,
    });

    let id: [u8; 32] = case_id.as_slice().try_into().unwrap();

    let profile = if minimum.is_some() {
        MINIMUM_SUM
    } else {
        EXACT_SUM
    };

    let output = result_payload(profile, 0, 31);

    let commitment = if let Some(threshold) = minimum {
        minimum_commitment(&id, threshold)
    } else {
        exact_commitment(&id, &output)
    };

    ctx("buyer.near", 110, 37 + rescue::job_storage_cost());

    let job_id = c.create_funded_rescue_job(FundedRescueJobInput {
        case_id: case_id.clone(),
        worker: account("worker.near"),
        worker_reward: U128(25),
        rescue_cap: U128(12),
        result_profile: if minimum.is_some() {
            RescueResultProfile::MinimumThreshold
        } else {
            RescueResultProfile::ExactCommitment
        },
        result_commitment: commitment.to_vec(),
        threshold: minimum.map(U128),
        final_deadline: 300,
    });

    assert_eq!(job_id, 0);

    ctx("worker.near", 115, 0);
    c.accept_rescue_job(0);

    for (index, provider) in ["alpha.near", "beta.near"].iter().enumerate() {
        ctx(provider, 205, 12 + rescue::offer_storage_cost());

        let offer_id = c.post_rescue_offer(RescueOfferInput {
            case_id: case_id.clone(),
            component_index: index as u8,
            slot_id: format!("slot_{index}"),
            fee: U128(6),
            bond_capacity: U128(12),
        });

        assert_eq!(offer_id, index as u64);
    }

    ctx("keeper.near", 220, 0);
    assert_eq!(c.award_rescue_bundle(case_id.clone()), 0);

    assert_eq!(c.rescue_escrow, 61);
    assert_eq!(c.claimable_total, 0);

    (c, payloads, siblings, output, case_id)
}

fn prove(c: &mut Nomogenesis, index: usize, payloads: &[Vec<u8>; 2], siblings: &[Vec<u8>; 2]) {
    let actor = ["alpha.near", "beta.near"][index];

    ctx(actor, 230 + index as u64, 0);

    c.submit_rescue_component(
        0,
        index as u8,
        payloads[index].clone(),
        siblings[index].clone(),
    );
}

fn settle_success(c: &mut Nomogenesis, payloads: &[Vec<u8>; 2], siblings: &[Vec<u8>; 2]) {
    prove(c, 0, payloads, siblings);
    prove(c, 1, payloads, siblings);

    ctx("keeper.near", 240, 0);
    c.settle_rescue_bundle(0);

    assert_eq!(
        c.rescue_bundles.get(&0).unwrap().phase,
        RescueBundlePhase::SettledSuccess
    );
    assert_eq!(c.rescue_escrow, 25);
    assert_eq!(c.claimable_total, 36);
}

#[test]
fn exact_worker_success_pays_only_immutable_worker_once() {
    let (mut c, payloads, siblings, output, case_id) = fixture(None);

    ctx("worker.near", 225, 0);
    rejected(|| c.complete_rescue_job(0, output.clone()));

    settle_success(&mut c, &payloads, &siblings);

    let reserved = c.storage_reserves;

    ctx("outsider.near", 241, 0);
    rejected(|| c.complete_rescue_job(0, output.clone()));

    ctx("worker.near", 241, 0);
    c.complete_rescue_job(0, output.clone());

    assert_eq!(c.rescue_escrow, 0);
    assert_eq!(c.claimable_total, 61);
    assert_eq!(c.get_claimable(account("worker.near")), U128(25));
    assert_eq!(c.get_claimable(account("buyer.near")), U128(0));
    assert_eq!(
        c.get_rescue_job(0).unwrap().phase,
        RescueJobPhase::Completed
    );
    assert_eq!(c.get_rescue_job(0).unwrap().held_worker_reward, U128(0));
    assert_eq!(c.storage_reserves, reserved);

    rejected(|| c.complete_rescue_job(0, output));

    ctx("outsider.near", 300, 0);
    rejected(|| c.expire_rescue_job(0));

    assert_eq!(c.claimable_total, 61);

    c.rescue_jobs.flush();
    c.rescue_cases.flush();
    c.rescue_bundles.flush();
    c.rescue_mandates.flush();
    c.rescue_offers.flush();
    c.claimables.flush();
    c.capacity_locks.flush();

    env::state_write(&c);
    drop(c);

    let loaded: Nomogenesis = env::state_read().unwrap();

    assert_eq!(
        loaded.get_rescue_job(0).unwrap().phase,
        RescueJobPhase::Completed
    );
    assert_eq!(loaded.get_claimable(account("worker.near")), U128(25));
    assert_eq!(
        loaded.get_rescue_case(case_id).unwrap().phase,
        rescue::RescueCasePhase::Closed
    );
}

#[test]
fn threshold_worker_can_complete_at_boundary() {
    let (mut c, payloads, siblings, output, _) = fixture(Some(31));

    settle_success(&mut c, &payloads, &siblings);

    ctx("worker.near", 299, 0);
    c.complete_rescue_job(0, output);

    assert_eq!(c.rescue_escrow, 0);
    assert_eq!(c.get_claimable(account("worker.near")), U128(25));
}

#[test]
fn threshold_failure_cannot_release_worker_reward() {
    let (mut c, payloads, siblings, output, _) = fixture(Some(32));

    settle_success(&mut c, &payloads, &siblings);

    ctx("worker.near", 270, 0);
    rejected(|| c.complete_rescue_job(0, output));

    assert_eq!(c.rescue_escrow, 25);
    assert_eq!(c.claimable_total, 36);
    assert_eq!(c.get_rescue_job(0).unwrap().phase, RescueJobPhase::Accepted);

    ctx("outsider.near", 300, 0);
    c.expire_rescue_job(0);

    assert_eq!(c.rescue_escrow, 0);
    assert_eq!(c.get_claimable(account("buyer.near")), U128(25));
}

#[test]
fn defaulted_bundle_does_not_pay_worker() {
    let (mut c, payloads, siblings, output, _) = fixture(None);

    prove(&mut c, 0, &payloads, &siblings);

    ctx("keeper.near", 260, 0);
    c.settle_rescue_bundle(0);

    assert_eq!(
        c.rescue_bundles.get(&0).unwrap().phase,
        RescueBundlePhase::SettledDefault
    );

    ctx("worker.near", 270, 0);
    rejected(|| c.complete_rescue_job(0, output));

    assert_eq!(c.rescue_escrow, 25);
    assert_eq!(c.get_claimable(account("worker.near")), U128(0));

    ctx("outsider.near", 300, 0);
    c.expire_rescue_job(0);

    assert_eq!(c.rescue_escrow, 0);
    assert_eq!(c.claimable_total, 61);
    assert_eq!(c.get_claimable(account("buyer.near")), U128(43));
}

#[test]
fn exact_deadline_rejects_completion_and_allows_refund() {
    let (mut c, payloads, siblings, output, _) = fixture(None);

    settle_success(&mut c, &payloads, &siblings);

    ctx("worker.near", 300, 0);
    rejected(|| c.complete_rescue_job(0, output));

    assert_eq!(c.rescue_escrow, 25);

    ctx("keeper.near", 300, 0);
    c.expire_rescue_job(0);

    assert_eq!(c.rescue_escrow, 0);
    assert_eq!(c.get_claimable(account("buyer.near")), U128(25));
}

#[test]
fn forged_results_and_overflow_do_not_mutate_accounts() {
    let (mut c, payloads, siblings, output, case_id) = fixture(None);

    settle_success(&mut c, &payloads, &siblings);
    ctx("worker.near", 241, 0);

    let mut wrong_value = output.clone();
    wrong_value[25] ^= 1;

    let mut wrong_job = output.clone();
    wrong_job[9] = 1;

    let mut wrong_profile = output.clone();
    wrong_profile[1] = MINIMUM_SUM;

    for bad in [wrong_value, wrong_job, wrong_profile, output[..25].to_vec()] {
        rejected(|| c.complete_rescue_job(0, bad));

        assert_eq!(c.rescue_escrow, 25);
        assert_eq!(c.claimable_total, 36);
    }

    // Even the persisted component data must still
    // match the original Merkle commitment.
    let case_key: [u8; 32] = case_id.as_slice().try_into().unwrap();

    let mut case = c.rescue_cases.get(&case_key).unwrap().clone();

    case.resolved_payloads[0].as_mut().unwrap()[12] ^= 1;

    c.rescue_cases.insert(case_key, case);

    rejected(|| c.complete_rescue_job(0, output.clone()));
    assert_eq!(c.claimable_total, 36);

    let mut case = c.rescue_cases.get(&case_key).unwrap().clone();

    case.resolved_payloads[0] = Some(payloads[0].clone());
    c.rescue_cases.insert(case_key, case);

    let old_total = c.claimable_total;
    c.claimable_total = u128::MAX;

    rejected(|| c.complete_rescue_job(0, output.clone()));
    assert_eq!(c.rescue_escrow, 25);

    c.claimable_total = old_total;
    c.rescue_escrow = 0;

    rejected(|| c.complete_rescue_job(0, output.clone()));
    assert_eq!(c.claimable_total, 36);

    c.rescue_escrow = 25;
    c.complete_rescue_job(0, output);

    assert_eq!(c.rescue_escrow, 0);
    assert_eq!(c.claimable_total, 61);
}
