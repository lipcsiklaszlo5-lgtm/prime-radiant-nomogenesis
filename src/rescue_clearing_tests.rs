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
