use super::*;
use crate::capacity::{CapacityOwner, capacity_key};

use near_sdk::{
    env,
    test_utils::{VMContextBuilder, accounts},
    testing_env,
};

use std::panic::{AssertUnwindSafe, catch_unwind};

fn actor(id: usize, now: u64) {
    let mut context = VMContextBuilder::new();

    context
        .predecessor_account_id(accounts(id))
        .block_timestamp(now);

    testing_env!(context.build());
}

fn rejected<T>(call: impl FnOnce() -> T) {
    assert!(catch_unwind(AssertUnwindSafe(call)).is_err());
}

fn ready(contract: &mut Nomogenesis, buyer: usize) -> u64 {
    actor(buyer, 100);

    let task = contract.test_create_task(accounts(1), vec![7; 32], 2, 2, 200, 300);

    actor(1, 110);
    contract.accept_primary(task);

    task
}

fn listed(contract: &mut Nomogenesis, task: u64, slot: &str) -> u64 {
    actor(2, 120);
    contract.test_post_offer(task, slot.into(), 180)
}

#[test]
fn default_capacity_registry_is_empty_and_zero_liability() {
    let contract = Nomogenesis::default();

    assert_eq!(
        contract.capacity_lock_holder(accounts(2), "shared".into(),),
        None
    );

    assert_eq!(contract.slot_holder(accounts(2), "shared".into(),), None);

    assert_eq!(contract.rescue_escrow_total(), U128(0));
    assert_eq!(contract.escrow_totals(), (U128(0), U128(0), U128(0)));
}

#[test]
fn m2_selection_writes_typed_owner_and_legacy_view() {
    let mut contract = Nomogenesis::default();
    let task = ready(&mut contract, 0);
    let offer = listed(&mut contract, task, "typed");

    actor(0, 130);
    contract.select_offer(task, offer);

    assert_eq!(
        contract.capacity_lock_holder(accounts(2), "typed".into(),),
        Some(CapacityOwner::M2Offer(offer))
    );

    assert_eq!(
        contract.slot_holder(accounts(2), "typed".into(),),
        Some(offer)
    );
}

#[test]
fn simulated_m3_owner_blocks_m2_selection_atomically() {
    let mut contract = Nomogenesis::default();
    let task = ready(&mut contract, 0);
    let offer = listed(&mut contract, task, "shared");

    contract.capacity_locks.insert(
        capacity_key(&accounts(2), "shared"),
        CapacityOwner::M3RescueOffer(77),
    );

    actor(0, 130);
    rejected(|| contract.select_offer(task, offer));

    assert_eq!(
        contract.capacity_lock_holder(accounts(2), "shared".into(),),
        Some(CapacityOwner::M3RescueOffer(77))
    );

    assert_eq!(contract.slot_holder(accounts(2), "shared".into(),), None);

    assert_eq!(
        contract.get_task(task).unwrap().phase,
        TaskPhase::SeekingReserve
    );

    assert_eq!(
        contract.get_offer(offer).unwrap().status,
        OfferStatus::Available
    );
}

#[test]
fn m2_terminal_path_removes_exact_typed_owner() {
    let mut contract = Nomogenesis::default();
    let task = ready(&mut contract, 0);
    let offer = listed(&mut contract, task, "release");

    actor(0, 130);
    contract.select_offer(task, offer);

    assert_eq!(
        contract.capacity_lock_holder(accounts(2), "release".into(),),
        Some(CapacityOwner::M2Offer(offer))
    );

    actor(4, 300);
    contract.close_unactivated(task);

    assert_eq!(
        contract.capacity_lock_holder(accounts(2), "release".into(),),
        None
    );

    assert_eq!(contract.slot_holder(accounts(2), "release".into(),), None);
}

#[test]
fn typed_capacity_owner_survives_state_reload() {
    let mut contract = Nomogenesis::default();
    let task = ready(&mut contract, 0);
    let offer = listed(&mut contract, task, "persisted");

    actor(0, 130);
    contract.select_offer(task, offer);

    contract.capacity_locks.flush();
    env::state_write(&contract);
    drop(contract);

    let reloaded: Nomogenesis = env::state_read().expect("state missing");

    assert_eq!(
        reloaded.capacity_lock_holder(accounts(2), "persisted".into(),),
        Some(CapacityOwner::M2Offer(offer))
    );

    assert_eq!(
        reloaded.slot_holder(accounts(2), "persisted".into(),),
        Some(offer)
    );
}
