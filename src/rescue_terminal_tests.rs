use super::*;
use crate::{
    capacity::CapacityOwner,
    rescue::{
        FundedRescueJobInput, MandateReleaseReason, RescueBundlePhase, RescueCaseDescriptorInput,
        RescueCasePhase, RescueComponentOutcome, RescueJobPhase, RescueMandatePhase,
        RescueOfferInput, RescueOfferPhase, RescueResultProfile,
    },
    rescue_proof::component_metadata_sibling,
};
use near_sdk::{NearToken, test_utils::VMContextBuilder, testing_env};
use sha2::{Digest, Sha256};
use std::panic::{AssertUnwindSafe, catch_unwind};

fn account(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(actor: &str, now: u64, deposit: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(account("contract.near"))
        .signer_account_id(account(actor))
        .predecessor_account_id(account(actor))
        .block_timestamp(now)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100));
    testing_env!(b.build());
}

fn rejected(call: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(call)).is_err());
}

fn payload(component: u8) -> Vec<u8> {
    let mut data = vec![1, component + 1, 1];
    data.extend_from_slice(&4u16.to_be_bytes());
    data.extend_from_slice(&9u64.to_be_bytes());
    data
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

type TerminalFixture = (Nomogenesis, Vec<u8>, [Vec<u8>; 2], [Vec<u8>; 2]);

fn fixture() -> TerminalFixture {
    let payloads = [payload(0), payload(1)];
    let siblings = [
        component_metadata_sibling(0).to_vec(),
        component_metadata_sibling(1).to_vec(),
    ];
    let commitments = vec![
        root(&payloads[0], &siblings[0]),
        root(&payloads[1], &siblings[1]),
    ];

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

    for n in 0..3 {
        let buyer = format!("buyer{n}.near");
        let worker = format!("worker{n}.near");

        ctx(&buyer, 110, 6 + rescue::job_storage_cost());
        let id = c.create_funded_rescue_job(FundedRescueJobInput {
            case_id: case_id.clone(),
            worker: account(&worker),
            worker_reward: U128(1),
            rescue_cap: U128(5),
            result_profile: RescueResultProfile::ExactCommitment,
            result_commitment: vec![9; 32],
            threshold: None,
            final_deadline: 300,
        });
        assert_eq!(id, n);

        ctx(&worker, 115, 0);
        c.accept_rescue_job(id);
    }

    for (index, provider) in ["alpha.near", "beta.near"].iter().enumerate() {
        ctx(provider, 205, 12 + rescue::offer_storage_cost());
        let id = c.post_rescue_offer(RescueOfferInput {
            case_id: case_id.clone(),
            component_index: index as u8,
            slot_id: format!("slot_{index}"),
            fee: U128(6),
            bond_capacity: U128(12),
        });
        assert_eq!(id, index as u64);
    }

    ctx("keeper.near", 220, 0);
    assert_eq!(c.award_rescue_bundle(case_id.clone()), 0);
    assert_eq!(c.rescue_escrow, 39);
    assert_eq!(c.claimable_total, 3);

    (c, case_id, payloads, siblings)
}

fn prove(c: &mut Nomogenesis, index: usize, payloads: &[Vec<u8>; 2], siblings: &[Vec<u8>; 2]) {
    let provider = ["alpha.near", "beta.near"][index];
    ctx(provider, 230 + index as u64, 0);
    c.submit_rescue_component(
        0,
        index as u8,
        payloads[index].clone(),
        siblings[index].clone(),
    );
}

fn check_terminal(
    c: &Nomogenesis,
    case_id: &[u8],
    expected_bundle: RescueBundlePhase,
    expected_outcomes: [RescueComponentOutcome; 2],
) {
    let key: [u8; 32] = case_id.try_into().unwrap();
    assert_eq!(c.rescue_bundles.get(&0).unwrap().phase, expected_bundle);
    assert_eq!(
        c.rescue_bundles.get(&0).unwrap().component_outcomes,
        expected_outcomes
    );
    assert_eq!(
        c.rescue_cases.get(&key).unwrap().phase,
        RescueCasePhase::Closed
    );

    assert_eq!(c.rescue_escrow, 3);
    assert_eq!(c.claimable_total, 39);

    for index in 0..3 {
        let mandate = c.rescue_mandates.get(&(index as u64)).unwrap();
        assert_eq!(mandate.phase, RescueMandatePhase::Released);
        assert_eq!(mandate.release_reason, Some(MandateReleaseReason::Settled));
        assert_eq!(mandate.held_principal, 0);
        assert_eq!(mandate.locked_bundle_id, None);
        assert_eq!(mandate.locked_allocation, None);

        let job = c.rescue_jobs.get(&(index as u64)).unwrap();
        assert_eq!(job.phase, RescueJobPhase::Accepted);
        assert_eq!(job.held_worker_reward, 1);
    }

    for (index, provider) in ["alpha.near", "beta.near"].iter().enumerate() {
        assert_eq!(
            c.capacity_lock_holder(account(provider), format!("slot_{index}")),
            None
        );
        assert_eq!(c.rescue_offers.get(&(index as u64)).unwrap().held_bond, 0);
    }
}

#[test]
fn success_settles_before_deadline_without_worker_reward() {
    let (mut c, id, payloads, siblings) = fixture();
    let reserve = c.storage_reserves;

    prove(&mut c, 0, &payloads, &siblings);
    prove(&mut c, 1, &payloads, &siblings);

    ctx("outsider.near", 240, 0);
    c.settle_rescue_bundle(0);

    check_terminal(
        &c,
        &id,
        RescueBundlePhase::SettledSuccess,
        [
            RescueComponentOutcome::Proven,
            RescueComponentOutcome::Proven,
        ],
    );

    assert_eq!(c.get_claimable(account("alpha.near")), U128(18));
    assert_eq!(c.get_claimable(account("beta.near")), U128(18));
    for index in 0..3 {
        assert_eq!(
            c.get_claimable(account(&format!("buyer{index}.near"))),
            U128(1)
        );
    }
    assert_eq!(c.storage_reserves, reserve);
    assert_eq!(
        c.rescue_offers.get(&0).unwrap().phase,
        RescueOfferPhase::Proven
    );

    let before = c.claimable_total;
    rejected(|| c.settle_rescue_bundle(0));
    assert_eq!(c.claimable_total, before);

    c.rescue_cases.flush();
    c.rescue_bundles.flush();
    c.rescue_offers.flush();
    c.rescue_mandates.flush();
    c.capacity_locks.flush();
    c.claimables.flush();
    env::state_write(&c);
    drop(c);

    let loaded: Nomogenesis = env::state_read().unwrap();
    check_terminal(
        &loaded,
        &id,
        RescueBundlePhase::SettledSuccess,
        [
            RescueComponentOutcome::Proven,
            RescueComponentOutcome::Proven,
        ],
    );
    assert_eq!(loaded.get_claimable(account("alpha.near")), U128(18));
}

fn verify_single_default(proven_index: usize) {
    let (mut c, id, payloads, siblings) = fixture();

    prove(&mut c, proven_index, &payloads, &siblings);

    ctx("keeper.near", 259, 0);
    rejected(|| c.settle_rescue_bundle(0));
    assert_eq!(c.rescue_escrow, 39);
    assert_eq!(c.claimable_total, 3);

    ctx("stranger.near", 260, 0);
    c.settle_rescue_bundle(0);

    let mut expected = [
        RescueComponentOutcome::Defaulted,
        RescueComponentOutcome::Defaulted,
    ];
    expected[proven_index] = RescueComponentOutcome::Proven;

    check_terminal(&c, &id, RescueBundlePhase::SettledDefault, expected);

    for index in 0..2 {
        let provider = ["alpha.near", "beta.near"][index];
        assert_eq!(
            c.get_claimable(account(provider)),
            U128(if index == proven_index { 18 } else { 0 })
        );
        assert_eq!(
            c.rescue_offers.get(&(index as u64)).unwrap().phase,
            if index == proven_index {
                RescueOfferPhase::Proven
            } else {
                RescueOfferPhase::Defaulted
            }
        );
    }

    for index in 0..3 {
        assert_eq!(
            c.get_claimable(account(&format!("buyer{index}.near"))),
            U128(7)
        );
    }
}

#[test]
fn first_provider_proven_second_defaulted() {
    verify_single_default(0);
}

#[test]
fn second_provider_proven_first_defaulted() {
    verify_single_default(1);
}

#[test]
fn both_defaults_return_all_rescue_principal() {
    let (mut c, id, _, _) = fixture();

    ctx("random.near", 260, 0);
    c.settle_rescue_bundle(0);

    check_terminal(
        &c,
        &id,
        RescueBundlePhase::SettledDefault,
        [
            RescueComponentOutcome::Defaulted,
            RescueComponentOutcome::Defaulted,
        ],
    );

    for index in 0..3 {
        assert_eq!(
            c.get_claimable(account(&format!("buyer{index}.near"))),
            U128(13)
        );
    }

    assert_eq!(c.get_claimable(account("alpha.near")), U128(0));
    assert_eq!(c.get_claimable(account("beta.near")), U128(0));

    // Worker rewards remain separately funded and expire later.
    ctx("random.near", 300, 0);
    for index in 0..3 {
        c.expire_rescue_job(index);
    }
    assert_eq!(c.rescue_escrow, 0);
    assert_eq!(c.claimable_total, 42);
}

#[test]
fn corrupted_typed_lock_rejects_without_other_writes() {
    let (mut c, id, payloads, siblings) = fixture();
    prove(&mut c, 0, &payloads, &siblings);
    prove(&mut c, 1, &payloads, &siblings);

    let slot = "alpha.near|slot_0".to_owned();
    c.capacity_locks
        .insert(slot.clone(), CapacityOwner::M2Offer(88));

    let bundle_before = c.rescue_bundles.get(&0).unwrap().clone();
    let case_key: [u8; 32] = id.try_into().unwrap();
    let case_before = c.rescue_cases.get(&case_key).unwrap().clone();

    ctx("stranger.near", 240, 0);
    rejected(|| c.settle_rescue_bundle(0));

    assert_eq!(c.rescue_escrow, 39);
    assert_eq!(c.claimable_total, 3);
    assert_eq!(c.rescue_bundles.get(&0), Some(&bundle_before));
    assert_eq!(c.rescue_cases.get(&case_key), Some(&case_before));
    assert_eq!(
        c.capacity_locks.get(&slot),
        Some(&CapacityOwner::M2Offer(88))
    );
    assert_eq!(
        c.rescue_mandates.get(&0).unwrap().phase,
        RescueMandatePhase::Locked
    );

    c.capacity_locks
        .insert(slot, CapacityOwner::M3RescueOffer(0));
    c.settle_rescue_bundle(0);
    assert_eq!(c.rescue_escrow, 3);
}

#[test]
fn credit_overflow_rejects_without_partial_settlement() {
    let (mut c, id, payloads, siblings) = fixture();
    prove(&mut c, 0, &payloads, &siblings);
    prove(&mut c, 1, &payloads, &siblings);

    let key: [u8; 32] = id.try_into().unwrap();
    let original_total = c.claimable_total;
    let original_bundle = c.rescue_bundles.get(&0).unwrap().clone();

    c.claimable_total = u128::MAX;

    ctx("keeper.near", 240, 0);
    rejected(|| c.settle_rescue_bundle(0));

    assert_eq!(c.claimable_total, u128::MAX);
    assert_eq!(c.rescue_escrow, 39);
    assert_eq!(c.rescue_bundles.get(&0), Some(&original_bundle));
    assert_eq!(
        c.rescue_cases.get(&key).unwrap().phase,
        RescueCasePhase::BundleAwarded
    );

    c.claimable_total = original_total;
    c.claimables.insert(account("alpha.near"), u128::MAX);

    rejected(|| c.settle_rescue_bundle(0));
    assert_eq!(c.rescue_escrow, 39);
    assert_eq!(c.rescue_bundles.get(&0), Some(&original_bundle));
    assert_eq!(c.claimables.get(&account("beta.near")), None);

    c.claimables.remove(&account("alpha.near"));
    c.settle_rescue_bundle(0);
    assert_eq!(c.rescue_escrow, 3);
}

#[test]
fn corrupted_sponsor_or_bond_rejects_without_credits() {
    let (mut c, _, payloads, siblings) = fixture();
    prove(&mut c, 0, &payloads, &siblings);
    prove(&mut c, 1, &payloads, &siblings);

    ctx("keeper.near", 240, 0);

    let mut mandate = c.rescue_mandates.get(&0).unwrap().clone();
    mandate.held_principal = 3;
    c.rescue_mandates.insert(0, mandate);

    rejected(|| c.settle_rescue_bundle(0));
    assert_eq!(c.claimable_total, 3);
    assert_eq!(c.rescue_escrow, 39);

    let mut mandate = c.rescue_mandates.get(&0).unwrap().clone();
    mandate.held_principal = 4;
    c.rescue_mandates.insert(0, mandate);

    let mut offer = c.rescue_offers.get(&0).unwrap().clone();
    offer.held_bond = 11;
    c.rescue_offers.insert(0, offer);

    rejected(|| c.settle_rescue_bundle(0));
    assert_eq!(c.claimable_total, 3);
    assert_eq!(c.rescue_escrow, 39);

    let mut offer = c.rescue_offers.get(&0).unwrap().clone();
    offer.held_bond = 12;
    c.rescue_offers.insert(0, offer);

    let mut bundle = c.rescue_bundles.get(&0).unwrap().clone();
    bundle.allocations[1].job_id = bundle.allocations[0].job_id;
    c.rescue_bundles.insert(0, bundle);

    rejected(|| c.settle_rescue_bundle(0));
    assert_eq!(c.claimable_total, 3);
    assert_eq!(c.rescue_escrow, 39);
}
