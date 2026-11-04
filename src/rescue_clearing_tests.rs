use super::*;
use crate::{
    capacity::CapacityOwner,
    rescue::{
        FundedRescueJobInput, RescueCaseDescriptorInput, RescueOfferInput, RescueResultProfile,
    },
};
use near_sdk::{NearToken, test_utils::VMContextBuilder, testing_env};
use std::panic::{AssertUnwindSafe, catch_unwind};

fn account(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn context(actor: &str, now: u64, deposit: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(account("contract.near"))
        .signer_account_id(account(actor))
        .predecessor_account_id(account(actor))
        .block_timestamp(now)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100));
    testing_env!(b.build());
}

fn rejected<T>(call: impl FnOnce() -> T) {
    assert!(catch_unwind(AssertUnwindSafe(call)).is_err());
}

fn market() -> (Nomogenesis, Vec<u8>) {
    let mut c = Nomogenesis::default();
    context("creator.near", 100, rescue::case_storage_cost());
    let id = c.create_rescue_case(RescueCaseDescriptorInput {
        descriptor_version: 1,
        original_provider: account("source.near"),
        component_commitments: vec![vec![1; 32], vec![2; 32]],
        dependency_deadline: 200,
        bid_close: 220,
        award_close: 240,
        recovery_deadline: 260,
    });
    (c, id)
}

fn fund(c: &mut Nomogenesis, case_id: &[u8], n: usize, cap: u128) -> u64 {
    let buyer = format!("buyer{n}.near");
    let worker = format!("worker{n}.near");
    context(&buyer, 110, 1 + cap + rescue::job_storage_cost());
    c.create_funded_rescue_job(FundedRescueJobInput {
        case_id: case_id.to_vec(),
        worker: account(&worker),
        worker_reward: U128(1),
        rescue_cap: U128(cap),
        result_profile: RescueResultProfile::ExactCommitment,
        result_commitment: vec![9; 32],
        threshold: None,
        final_deadline: 300,
    })
}

fn accept(c: &mut Nomogenesis, n: usize) {
    context(&format!("worker{n}.near"), 115, 0);
    c.accept_rescue_job(n as u64);
}

fn post(
    c: &mut Nomogenesis,
    case_id: &[u8],
    provider: &str,
    component: u8,
    fee: u128,
    bond: u128,
) -> u64 {
    context(provider, 205, bond + rescue::offer_storage_cost());
    c.post_rescue_offer(RescueOfferInput {
        case_id: case_id.to_vec(),
        component_index: component,
        slot_id: format!("slot_{component}"),
        fee: U128(fee),
        bond_capacity: U128(bond),
    })
}

fn three_sponsors(c: &mut Nomogenesis, id: &[u8]) {
    for n in 0..3 {
        assert_eq!(fund(c, id, n, 5), n as u64);
    }
    for n in 0..3 {
        accept(c, n);
    }
}

#[test]
fn cheapest_eligible_pair_wins_and_preview_does_not_award() {
    let (mut c, id) = market();
    three_sponsors(&mut c, &id);
    post(&mut c, &id, "cheap0.near", 0, 1, 1);
    post(&mut c, &id, "cheap1.near", 1, 1, 1);
    post(&mut c, &id, "funded0.near", 0, 6, 12);
    post(&mut c, &id, "funded1.near", 1, 6, 12);
    post(&mut c, &id, "tie0.near", 0, 6, 12);
    post(&mut c, &id, "tie1.near", 1, 6, 12);
    context("stranger.near", 220, 0);
    let before = c.rescue_escrow_total();
    let preview = c.preview_rescue_pair(id.clone()).unwrap();
    assert_eq!(preview.offer_ids, [2, 3]);
    assert_eq!(preview.total_price, U128(12));
    assert_eq!(preview.eligible_job_ids, vec![0, 1, 2]);
    assert_eq!(preview.eligible_cap_total, U128(15));
    let key: [u8; 32] = id.clone().try_into().unwrap();
    let mut case = c.rescue_cases.get(&key).unwrap().clone();
    case.offer_ids.reverse();
    c.rescue_cases.insert(key, case);
    assert_eq!(c.preview_rescue_pair(id.clone()).unwrap().offer_ids, [2, 3]);
    assert_eq!(c.rescue_escrow_total(), before);
    assert_eq!(c.next_rescue_bundle_id(), 0);
    assert_eq!(c.get_rescue_case(id).unwrap().awarded_bundle_id, None);
    assert!(
        c.capacity_locks
            .get(&"funded0.near|slot_0".to_owned())
            .is_none()
    );
}

#[test]
fn unaccepted_job_does_not_supply_missing_cap() {
    let (mut c, id) = market();
    for n in 0..3 {
        fund(&mut c, &id, n, 5);
    }
    accept(&mut c, 0);
    accept(&mut c, 1);
    post(&mut c, &id, "a.near", 0, 6, 12);
    post(&mut c, &id, "b.near", 1, 6, 12);
    context("keeper.near", 220, 0);
    assert!(c.preview_rescue_pair(id).is_none());
}

#[test]
fn revoked_open_mandate_no_longer_supplies_cap() {
    let (mut c, id) = market();
    three_sponsors(&mut c, &id);
    post(&mut c, &id, "a.near", 0, 6, 12);
    post(&mut c, &id, "b.near", 1, 6, 12);
    context("keeper.near", 220, 0);
    assert_eq!(
        c.preview_rescue_pair(id.clone()).unwrap().eligible_job_ids,
        vec![0, 1, 2]
    );
    context("buyer2.near", 230, 0);
    c.revoke_open_rescue_mandate(2);
    context("keeper.near", 230, 0);
    assert!(c.preview_rescue_pair(id).is_none());
    assert_eq!(c.next_rescue_bundle_id(), 0);
}

#[test]
fn occupied_m2_and_m3_slots_are_filtered_before_price_comparison() {
    let (mut c, id) = market();
    three_sponsors(&mut c, &id);
    post(&mut c, &id, "a0.near", 0, 6, 14);
    post(&mut c, &id, "b0.near", 1, 6, 14);
    post(&mut c, &id, "a1.near", 0, 7, 14);
    post(&mut c, &id, "b1.near", 1, 7, 14);
    context("keeper.near", 220, 0);
    assert_eq!(c.preview_rescue_pair(id.clone()).unwrap().offer_ids, [0, 1]);
    c.capacity_locks
        .insert("a0.near|slot_0".into(), CapacityOwner::M2Offer(99));
    assert_eq!(c.preview_rescue_pair(id.clone()).unwrap().offer_ids, [2, 1]);
    c.capacity_locks
        .insert("b0.near|slot_1".into(), CapacityOwner::M3RescueOffer(98));
    assert_eq!(c.preview_rescue_pair(id).unwrap().offer_ids, [2, 3]);
    assert_eq!(
        c.capacity_locks.get(&"a0.near|slot_0".to_owned()),
        Some(&CapacityOwner::M2Offer(99))
    );
}

#[test]
fn same_provider_cannot_fill_both_components() {
    let (mut c, id) = market();
    three_sponsors(&mut c, &id);
    post(&mut c, &id, "same.near", 0, 6, 13);
    post(&mut c, &id, "same.near", 1, 6, 13);
    context("keeper.near", 220, 0);
    assert!(c.preview_rescue_pair(id).is_none());
}

#[test]
fn overflowing_fee_cannot_block_valid_pair() {
    let (mut c, id) = market();
    three_sponsors(&mut c, &id);
    post(&mut c, &id, "same.near", 0, 6, 13);
    post(&mut c, &id, "same.near", 1, 6, 13);
    post(&mut c, &id, "other.near", 1, 7, 13);
    context("keeper.near", 220, 0);
    assert_eq!(c.preview_rescue_pair(id.clone()).unwrap().offer_ids, [0, 2]);
    let mut offer = c.rescue_offers.get(&1).unwrap().clone();
    offer.fee = u128::MAX;
    c.rescue_offers.insert(1, offer);
    assert_eq!(c.preview_rescue_pair(id).unwrap().offer_ids, [0, 2]);
}

#[test]
fn time_gates_duplicate_indexes_and_closed_case_fail_without_award() {
    let (mut c, id) = market();
    three_sponsors(&mut c, &id);
    post(&mut c, &id, "a.near", 0, 6, 12);
    post(&mut c, &id, "b.near", 1, 6, 12);
    context("keeper.near", 219, 0);
    rejected(|| c.preview_rescue_pair(id.clone()));
    context("keeper.near", 220, 0);
    let key: [u8; 32] = id.clone().try_into().unwrap();
    let mut case = c.rescue_cases.get(&key).unwrap().clone();
    case.offer_ids.push(0);
    c.rescue_cases.insert(key, case.clone());
    rejected(|| c.preview_rescue_pair(id.clone()));
    case.offer_ids.pop();
    case.job_ids.push(0);
    c.rescue_cases.insert(key, case.clone());
    rejected(|| c.preview_rescue_pair(id.clone()));
    case.job_ids.pop();
    c.rescue_cases.insert(key, case.clone());
    context("keeper.near", 240, 0);
    rejected(|| c.preview_rescue_pair(id.clone()));
    case.phase = rescue::RescueCasePhase::BundleAwarded;
    c.rescue_cases.insert(key, case);
    rejected(|| c.preview_rescue_pair(id));
    assert_eq!(c.next_rescue_bundle_id(), 0);
    assert!(!c.has_rescue_bundle(0));
}

#[test]
fn award_three_sponsors_persists_and_replay_fails() {
    let (mut c, case_id) = market();
    three_sponsors(&mut c, &case_id);
    let a = post(&mut c, &case_id, "provider0.near", 0, 6, 12);
    let b = post(&mut c, &case_id, "provider1.near", 1, 6, 12);
    assert_eq!(c.rescue_escrow_total(), U128(42));

    context("keeper.near", 220, 0);
    let bundle_id = c.award_rescue_bundle(case_id.clone());
    assert_eq!(bundle_id, 0);
    assert_eq!(c.next_rescue_bundle_id(), 1);

    let bundle = c.rescue_bundles.get(&bundle_id).unwrap();
    assert_eq!(bundle.offer_ids, [a, b]);
    assert_eq!(bundle.total_price, 12);
    assert_eq!(bundle.phase, rescue::RescueBundlePhase::Awarded);
    assert_eq!(
        bundle
            .allocations
            .iter()
            .map(|x| (x.job_id, x.amount))
            .collect::<Vec<_>>(),
        vec![(0, 4), (1, 4), (2, 4)]
    );

    assert_eq!(c.rescue_escrow_total(), U128(39));
    assert_eq!(c.claimable_total(), U128(3));
    for n in 0..3 {
        assert_eq!(c.get_claimable(account(&format!("buyer{n}.near"))), U128(1));
        let mandate = c.get_rescue_mandate(n).unwrap();
        assert_eq!(mandate.phase, rescue::RescueMandatePhase::Locked);
        assert_eq!(mandate.locked_allocation, Some(U128(4)));
        assert_eq!(mandate.locked_bundle_id, Some(bundle_id));
    }

    for (provider, slot, offer_id) in [
        ("provider0.near", "slot_0", a),
        ("provider1.near", "slot_1", b),
    ] {
        assert_eq!(
            c.capacity_locks.get(&format!("{provider}|{slot}")),
            Some(&CapacityOwner::M3RescueOffer(offer_id))
        );
        assert_eq!(c.get_rescue_offer(offer_id).unwrap().held_bond, U128(12));
    }
    assert_eq!(c.rescue_escrow_total().0 + c.claimable_total().0, 42);

    rejected(|| c.award_rescue_bundle(case_id.clone()));
    assert_eq!(c.next_rescue_bundle_id(), 1);
    assert_eq!(c.rescue_escrow_total(), U128(39));
    assert_eq!(c.claimable_total(), U128(3));

    c.rescue_cases.flush();
    c.rescue_bundles.flush();
    c.rescue_mandates.flush();
    c.rescue_offers.flush();
    c.capacity_locks.flush();
    c.claimables.flush();
    env::state_write(&c);
    let loaded: Nomogenesis = env::state_read().unwrap();
    assert_eq!(loaded.next_rescue_bundle_id(), 1);
    assert!(loaded.has_rescue_bundle(0));
    assert_eq!(loaded.rescue_escrow_total(), U128(39));
    assert_eq!(loaded.claimable_total(), U128(3));
    assert_eq!(
        loaded
            .capacity_locks
            .get(&"provider0.near|slot_0".to_owned()),
        Some(&CapacityOwner::M3RescueOffer(a))
    );
}

#[test]
fn award_returns_excess_bonds_and_zero_caps() {
    let (mut c, case_id) = market();
    for n in 0..3 {
        fund(&mut c, &case_id, n, 10);
        accept(&mut c, n);
    }
    let a = post(&mut c, &case_id, "alpha.near", 0, 1, 4);
    let b = post(&mut c, &case_id, "beta.near", 1, 1, 4);
    assert_eq!(c.rescue_escrow_total(), U128(41));

    context("keeper.near", 220, 0);
    c.award_rescue_bundle(case_id);

    assert_eq!(c.rescue_escrow_total(), U128(9));
    assert_eq!(c.claimable_total(), U128(32));
    assert_eq!(c.get_claimable(account("buyer0.near")), U128(9));
    assert_eq!(c.get_claimable(account("buyer1.near")), U128(9));
    assert_eq!(c.get_claimable(account("buyer2.near")), U128(10));
    assert_eq!(c.get_claimable(account("alpha.near")), U128(2));
    assert_eq!(c.get_claimable(account("beta.near")), U128(2));
    assert_eq!(c.get_rescue_offer(a).unwrap().held_bond, U128(2));
    assert_eq!(c.get_rescue_offer(b).unwrap().held_bond, U128(2));

    let zero = c.get_rescue_mandate(2).unwrap();
    assert_eq!(zero.held_principal, U128(0));
    assert_eq!(zero.phase, rescue::RescueMandatePhase::Released);
    assert_eq!(
        zero.release_reason,
        Some(rescue::MandateReleaseReason::ZeroAllocation)
    );
    assert_eq!(c.rescue_bundles.get(&0).unwrap().allocations.len(), 2);
    assert_eq!(c.rescue_escrow_total().0 + c.claimable_total().0, 41);
}

#[test]
fn award_rejects_occupied_m2_and_m3_slots() {
    let (mut c, id) = market();
    three_sponsors(&mut c, &id);
    let a = post(&mut c, &id, "alpha.near", 0, 6, 12);
    post(&mut c, &id, "beta.near", 1, 6, 12);
    context("keeper.near", 220, 0);
    let escrow = c.rescue_escrow_total();
    let key = "alpha.near|slot_0".to_owned();

    for owner in [CapacityOwner::M2Offer(99), CapacityOwner::M3RescueOffer(98)] {
        c.capacity_locks.insert(key.clone(), owner.clone());
        rejected(|| c.award_rescue_bundle(id.clone()));
        assert_eq!(c.capacity_locks.get(&key), Some(&owner));
        assert_eq!(c.rescue_escrow_total(), escrow);
        assert_eq!(c.claimable_total(), U128(0));
        assert_eq!(c.next_rescue_bundle_id(), 0);
        assert!(!c.has_rescue_bundle(0));
        assert_eq!(
            c.get_rescue_offer(a).unwrap().phase,
            rescue::RescueOfferPhase::Open
        );
    }
}

#[test]
fn award_credit_overflow_preserves_all_state() {
    let (mut c, id) = market();
    three_sponsors(&mut c, &id);
    let a = post(&mut c, &id, "alpha.near", 0, 6, 14);
    post(&mut c, &id, "beta.near", 1, 6, 12);
    context("keeper.near", 220, 0);
    let escrow = c.rescue_escrow_total();

    for owner in ["buyer0.near", "alpha.near"] {
        let account_id = account(owner);
        c.claimables.insert(account_id.clone(), u128::MAX);
        rejected(|| c.award_rescue_bundle(id.clone()));
        assert_eq!(c.rescue_escrow_total(), escrow);
        assert_eq!(c.claimable_total(), U128(0));
        assert_eq!(c.next_rescue_bundle_id(), 0);
        assert!(!c.has_rescue_bundle(0));
        assert_eq!(
            c.get_rescue_offer(a).unwrap().phase,
            rescue::RescueOfferPhase::Open
        );
        assert!(
            c.capacity_locks
                .get(&"alpha.near|slot_0".to_owned())
                .is_none()
        );
        assert_eq!(
            c.get_rescue_mandate(0).unwrap().phase,
            rescue::RescueMandatePhase::Open
        );
        c.claimables.insert(account_id, 0);
    }
}

#[test]
fn award_rejects_both_time_boundaries() {
    let (mut c, id) = market();
    three_sponsors(&mut c, &id);
    post(&mut c, &id, "alpha.near", 0, 6, 12);
    post(&mut c, &id, "beta.near", 1, 6, 12);
    let escrow = c.rescue_escrow_total();

    for now in [219, 240] {
        context("keeper.near", now, 0);
        rejected(|| c.award_rescue_bundle(id.clone()));
        assert_eq!(c.rescue_escrow_total(), escrow);
        assert_eq!(c.claimable_total(), U128(0));
        assert_eq!(c.next_rescue_bundle_id(), 0);
        assert!(!c.has_rescue_bundle(0));
    }
}

#[test]
fn award_insufficient_caps_is_atomic() {
    let (mut c, id) = market();
    for n in 0..2 {
        fund(&mut c, &id, n, 5);
        accept(&mut c, n);
    }
    let a = post(&mut c, &id, "alpha.near", 0, 6, 12);
    post(&mut c, &id, "beta.near", 1, 6, 12);

    context("keeper.near", 220, 0);
    let before = c.rescue_escrow_total();
    rejected(|| c.award_rescue_bundle(id.clone()));

    assert_eq!(c.rescue_escrow_total(), before);
    assert_eq!(c.claimable_total(), U128(0));
    assert_eq!(c.next_rescue_bundle_id(), 0);
    assert!(!c.has_rescue_bundle(0));
    assert_eq!(
        c.get_rescue_case(id).unwrap().phase,
        rescue::RescueCasePhase::Open
    );
    assert_eq!(
        c.get_rescue_offer(a).unwrap().phase,
        rescue::RescueOfferPhase::Open
    );
    assert_eq!(
        c.get_rescue_mandate(0).unwrap().phase,
        rescue::RescueMandatePhase::Open
    );
    assert!(
        c.capacity_locks
            .get(&"alpha.near|slot_0".to_owned())
            .is_none()
    );
}

#[test]
fn award_total_credit_overflow_is_atomic() {
    let (mut c, id) = market();
    three_sponsors(&mut c, &id);
    post(&mut c, &id, "alpha.near", 0, 6, 12);
    post(&mut c, &id, "beta.near", 1, 6, 12);

    context("keeper.near", 220, 0);
    let before = c.rescue_escrow_total();
    c.claimable_total = u128::MAX;

    rejected(|| c.award_rescue_bundle(id));

    assert_eq!(c.claimable_total(), U128(u128::MAX));
    assert_eq!(c.rescue_escrow_total(), before);
    assert_eq!(c.next_rescue_bundle_id(), 0);
    assert!(!c.has_rescue_bundle(0));
    assert!(
        c.capacity_locks
            .get(&"alpha.near|slot_0".to_owned())
            .is_none()
    );
    assert_eq!(
        c.get_rescue_mandate(0).unwrap().phase,
        rescue::RescueMandatePhase::Open
    );
}

#[test]
fn award_selects_alternative_when_m2_slot_is_occupied() {
    let (mut c, id) = market();
    three_sponsors(&mut c, &id);

    let blocked = post(&mut c, &id, "alpha.near", 0, 6, 14);
    let chosen_b = post(&mut c, &id, "beta.near", 1, 6, 14);
    let chosen_a = post(&mut c, &id, "gamma.near", 0, 7, 14);
    post(&mut c, &id, "delta.near", 1, 7, 14);

    let blocked_key = "alpha.near|slot_0".to_owned();
    c.capacity_locks
        .insert(blocked_key.clone(), CapacityOwner::M2Offer(99));

    context("keeper.near", 220, 0);
    let bundle_id = c.award_rescue_bundle(id);
    let bundle = c.rescue_bundles.get(&bundle_id).unwrap();

    assert_eq!(bundle.offer_ids, [chosen_a, chosen_b]);
    assert_eq!(bundle.total_price, 13);
    assert_eq!(c.next_rescue_bundle_id(), 1);
    assert_eq!(
        c.capacity_locks.get(&blocked_key),
        Some(&CapacityOwner::M2Offer(99))
    );
    assert_eq!(
        c.capacity_locks.get(&"gamma.near|slot_0".to_owned()),
        Some(&CapacityOwner::M3RescueOffer(chosen_a))
    );
    assert_eq!(
        c.capacity_locks.get(&"beta.near|slot_1".to_owned()),
        Some(&CapacityOwner::M3RescueOffer(chosen_b))
    );
    assert_eq!(
        c.get_rescue_offer(blocked).unwrap().phase,
        rescue::RescueOfferPhase::Open
    );

    assert_eq!(c.rescue_escrow_total(), U128(70));
    assert_eq!(c.claimable_total(), U128(4));
    assert_eq!(c.rescue_escrow_total().0 + c.claimable_total().0, 74);
}

#[test]
fn real_m3_award_blocks_m2_slot_selection() {
    let (mut c, id) = market();
    three_sponsors(&mut c, &id);
    let selected = post(&mut c, &id, "provider0.near", 0, 6, 12);
    post(&mut c, &id, "provider1.near", 1, 6, 12);

    context("keeper.near", 220, 0);
    c.award_rescue_bundle(id);

    context("buyer0.near", 221, 0);
    let task = c.test_create_task(account("worker0.near"), vec![7; 32], 2, 2, 280, 350);
    context("worker0.near", 222, 0);
    c.accept_primary(task);

    context("provider0.near", 223, 0);
    let offer = c.test_post_offer(task, "slot_0".into(), 270);

    context("buyer0.near", 224, 0);
    rejected(|| c.select_offer(task, offer));

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::SeekingReserve);
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Available);
    assert_eq!(
        c.capacity_locks.get(&"provider0.near|slot_0".to_owned()),
        Some(&CapacityOwner::M3RescueOffer(selected))
    );
    assert_eq!(c.rescue_escrow_total(), U128(39));
}

fn proof_payload(component: u8) -> Vec<u8> {
    let mut result = vec![1, component + 1, 2];
    for (id, value) in [(4u16, 9u64), (8u16, 15u64)] {
        result.extend_from_slice(&id.to_be_bytes());
        result.extend_from_slice(&value.to_be_bytes());
    }
    result
}

fn proof_root(payload: &[u8], sibling: &[u8]) -> Vec<u8> {
    use sha2::{Digest, Sha256};

    let mut leaf = Sha256::new();
    leaf.update([0u8]);
    leaf.update(0u64.to_be_bytes());
    leaf.update((payload.len() as u32).to_be_bytes());
    leaf.update(payload);

    let mut root = Sha256::new();
    root.update([1u8]);
    root.update(leaf.finalize());
    root.update(sibling);
    root.finalize().to_vec()
}

type ProofFixture = (Nomogenesis, Vec<u8>, [Vec<u8>; 2], [Vec<u8>; 2]);

fn awarded_proof_fixture() -> ProofFixture {
    let payloads = [proof_payload(0), proof_payload(1)];
    let siblings = [
        crate::rescue_proof::component_metadata_sibling(0).to_vec(),
        crate::rescue_proof::component_metadata_sibling(1).to_vec(),
    ];
    let roots = [
        proof_root(&payloads[0], &siblings[0]),
        proof_root(&payloads[1], &siblings[1]),
    ];

    let mut c = Nomogenesis::default();
    context("creator.near", 100, rescue::case_storage_cost());
    let id = c.create_rescue_case(RescueCaseDescriptorInput {
        descriptor_version: 1,
        original_provider: account("source.near"),
        component_commitments: roots.to_vec(),
        dependency_deadline: 200,
        bid_close: 220,
        award_close: 240,
        recovery_deadline: 260,
    });

    three_sponsors(&mut c, &id);
    assert_eq!(post(&mut c, &id, "alpha.near", 0, 6, 12), 0);
    assert_eq!(post(&mut c, &id, "beta.near", 1, 6, 12), 1);

    context("keeper.near", 220, 0);
    assert_eq!(c.award_rescue_bundle(id.clone()), 0);

    (c, id, payloads, siblings)
}

#[test]
fn proof_success_is_authenticated_and_persistent() {
    let (mut c, id, payloads, siblings) = awarded_proof_fixture();

    assert_eq!(c.rescue_escrow_total(), U128(39));
    assert_eq!(c.claimable_total(), U128(3));
    let original_storage = c.storage_reserves;

    context("outsider.near", 225, 0);
    rejected(|| c.submit_rescue_component(0, 0, payloads[0].clone(), siblings[0].clone()));

    let mut corrupted = payloads[0].clone();
    let last = corrupted.len() - 1;
    corrupted[last] ^= 1;

    context("alpha.near", 226, 0);
    rejected(|| c.submit_rescue_component(0, 0, corrupted, siblings[0].clone()));

    rejected(|| c.submit_rescue_component(0, 0, payloads[0].clone(), siblings[0][..31].to_vec()));

    assert_eq!(
        c.get_rescue_case(id.clone()).unwrap().resolved_payloads,
        vec![None, None]
    );
    assert_eq!(
        c.get_rescue_offer(0).unwrap().phase,
        rescue::RescueOfferPhase::Locked
    );

    c.submit_rescue_component(0, 0, payloads[0].clone(), siblings[0].clone());

    assert_eq!(
        c.get_rescue_offer(0).unwrap().phase,
        rescue::RescueOfferPhase::Proven
    );
    assert_eq!(
        c.rescue_bundles.get(&0).unwrap().component_outcomes[0],
        rescue::RescueComponentOutcome::Proven
    );
    assert_eq!(
        c.get_rescue_case(id.clone()).unwrap().resolved_payloads[0],
        Some(payloads[0].clone())
    );

    rejected(|| c.submit_rescue_component(0, 0, payloads[0].clone(), siblings[0].clone()));

    context("beta.near", 230, 0);
    c.submit_rescue_component(0, 1, payloads[1].clone(), siblings[1].clone());

    let bundle = c.rescue_bundles.get(&0).unwrap();
    assert_eq!(
        bundle.component_outcomes,
        [
            rescue::RescueComponentOutcome::Proven,
            rescue::RescueComponentOutcome::Proven
        ]
    );
    assert_eq!(bundle.phase, rescue::RescueBundlePhase::Awarded);
    assert_eq!(
        c.get_rescue_case(id.clone()).unwrap().phase,
        rescue::RescueCasePhase::BundleAwarded
    );

    for (provider, component, offer_id) in [("alpha.near", "slot_0", 0), ("beta.near", "slot_1", 1)]
    {
        assert_eq!(
            c.capacity_lock_holder(account(provider), component.to_owned()),
            Some(CapacityOwner::M3RescueOffer(offer_id))
        );
    }

    assert_eq!(c.rescue_escrow_total(), U128(39));
    assert_eq!(c.claimable_total(), U128(3));
    assert_eq!(c.storage_reserves, original_storage);

    c.rescue_cases.flush();
    c.rescue_bundles.flush();
    c.rescue_offers.flush();
    c.capacity_locks.flush();
    env::state_write(&c);
    drop(c);

    let reloaded: Nomogenesis = env::state_read().expect("state missing");
    let case = reloaded.get_rescue_case(id).unwrap();

    assert_eq!(
        case.resolved_payloads,
        vec![Some(payloads[0].clone()), Some(payloads[1].clone())]
    );
    assert_eq!(
        reloaded.rescue_bundles.get(&0).unwrap().component_outcomes,
        [
            rescue::RescueComponentOutcome::Proven,
            rescue::RescueComponentOutcome::Proven
        ]
    );
    assert_eq!(reloaded.rescue_escrow_total(), U128(39));
    assert_eq!(reloaded.claimable_total(), U128(3));
}

#[test]
fn proof_rejects_deadline_component_and_capacity_mismatch() {
    let (mut c, id, payloads, siblings) = awarded_proof_fixture();

    context("alpha.near", 225, 0);
    rejected(|| c.submit_rescue_component(99, 0, payloads[0].clone(), siblings[0].clone()));
    rejected(|| c.submit_rescue_component(0, 2, payloads[0].clone(), siblings[0].clone()));

    context("beta.near", 226, 0);
    rejected(|| c.submit_rescue_component(0, 1, payloads[0].clone(), siblings[0].clone()));

    let key = "alpha.near|slot_0".to_owned();
    let expected_owner = CapacityOwner::M3RescueOffer(0);
    assert_eq!(c.capacity_locks.get(&key), Some(&expected_owner));

    c.capacity_locks
        .insert(key.clone(), CapacityOwner::M2Offer(99));

    context("alpha.near", 227, 0);
    rejected(|| c.submit_rescue_component(0, 0, payloads[0].clone(), siblings[0].clone()));

    assert_eq!(
        c.capacity_locks.get(&key),
        Some(&CapacityOwner::M2Offer(99))
    );
    c.capacity_locks.insert(key, expected_owner);

    context("alpha.near", 260, 0);
    rejected(|| c.submit_rescue_component(0, 0, payloads[0].clone(), siblings[0].clone()));

    assert_eq!(
        c.get_rescue_case(id).unwrap().resolved_payloads,
        vec![None, None]
    );
    assert_eq!(
        c.rescue_bundles.get(&0).unwrap().component_outcomes,
        [
            rescue::RescueComponentOutcome::Pending,
            rescue::RescueComponentOutcome::Pending
        ]
    );
    assert_eq!(
        c.get_rescue_offer(0).unwrap().phase,
        rescue::RescueOfferPhase::Locked
    );
    assert_eq!(c.rescue_escrow_total(), U128(39));
    assert_eq!(c.claimable_total(), U128(3));
}
