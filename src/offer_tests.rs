use super::*;
use near_sdk::test_utils::{VMContextBuilder, accounts};
use near_sdk::testing_env;
use std::panic::{AssertUnwindSafe, catch_unwind};

fn context(actor: usize, timestamp: u64) {
    let mut builder = VMContextBuilder::new();
    builder
        .predecessor_account_id(accounts(actor))
        .block_timestamp(timestamp);
    testing_env!(builder.build());
}

fn ready_task(contract: &mut Nomogenesis) -> u64 {
    context(0, 100);
    let id = contract.test_create_task(accounts(1), vec![7; 32], 2, 2, 200, 400);
    context(1, 110);
    contract.accept_primary(id);
    id
}

#[test]
fn reserve_registers_offer_for_existing_task() {
    let mut contract = Nomogenesis::default();
    let task = ready_task(&mut contract);

    context(2, 120);
    let id = contract.test_post_offer(task, "node_A".into(), 180);
    let offer = contract.get_offer(id).unwrap();

    assert_eq!(offer.id, 0);
    assert_eq!(offer.task_id, task);
    assert_eq!(offer.reserve, accounts(2));
    assert_eq!(offer.slot_id, "node_A");
    assert_eq!(offer.expires_at, 180);
    assert!(contract.get_offer(999).is_none());
}

#[test]
fn buyer_and_primary_cannot_list_reserve_offer() {
    let mut contract = Nomogenesis::default();
    let task = ready_task(&mut contract);

    for actor in [0, 1] {
        context(actor, 120);
        assert!(
            catch_unwind(AssertUnwindSafe(|| {
                contract.test_post_offer(task, "slot_1".into(), 180)
            }))
            .is_err()
        );
    }

    assert!(contract.get_offer(0).is_none());
}

#[test]
fn invalid_expiry_slot_and_task_state_are_rejected() {
    let mut contract = Nomogenesis::default();

    context(0, 100);
    let pending = contract.test_create_task(accounts(1), vec![7; 32], 2, 2, 200, 400);
    context(2, 120);
    assert!(
        catch_unwind(AssertUnwindSafe(|| {
            contract.test_post_offer(pending, "slot_1".into(), 180)
        }))
        .is_err()
    );

    let task = ready_task(&mut contract);
    context(2, 120);

    for (slot, expiry) in [
        ("".to_string(), 180),
        ("invalid/slot".to_string(), 180),
        ("x".repeat(65), 180),
        ("slot_1".to_string(), 120),
        ("slot_1".to_string(), 201),
    ] {
        assert!(
            catch_unwind(AssertUnwindSafe(|| {
                contract.test_post_offer(task, slot, expiry)
            }))
            .is_err()
        );
    }

    assert!(contract.get_offer(0).is_none());
}

#[test]
fn independent_offer_ids_do_not_collide() {
    let mut contract = Nomogenesis::default();
    let task = ready_task(&mut contract);

    context(2, 120);
    let first = contract.test_post_offer(task, "slot_A".into(), 180);
    let second = contract.test_post_offer(task, "slot_B".into(), 190);

    assert_eq!((first, second), (0, 1));
    assert_ne!(
        contract.get_offer(first).unwrap().slot_id,
        contract.get_offer(second).unwrap().slot_id
    );
}
