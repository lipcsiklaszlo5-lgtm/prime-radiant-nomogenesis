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

fn new_task(contract: &mut Nomogenesis) -> u64 {
    context(0, 100);
    contract.create_task(accounts(1), vec![7; 32], 2, 2, 200, 400)
}

#[test]
fn buyer_creates_persistent_task() {
    let mut contract = Nomogenesis::default();
    let id = new_task(&mut contract);
    let task = contract.get_task(id).unwrap();
    assert_eq!(task.buyer, accounts(0));
    assert_eq!(task.primary, accounts(1));
    assert_eq!(task.phase, TaskPhase::SeekingPrimary);
    assert_eq!(task.index, 2);
    assert!(contract.get_task(999).is_none());
}

#[test]
fn only_designated_primary_can_accept() {
    let mut contract = Nomogenesis::default();
    let id = new_task(&mut contract);

    context(2, 150);
    let denied = catch_unwind(AssertUnwindSafe(|| contract.accept_primary(id)));
    assert!(denied.is_err());
    assert_eq!(
        contract.get_task(id).unwrap().phase,
        TaskPhase::SeekingPrimary
    );

    context(1, 151);
    contract.accept_primary(id);
    assert_eq!(
        contract.get_task(id).unwrap().phase,
        TaskPhase::SeekingReserve
    );

    let duplicate = catch_unwind(AssertUnwindSafe(|| contract.accept_primary(id)));
    assert!(duplicate.is_err());
}

#[test]
fn expired_primary_cannot_accept() {
    let mut contract = Nomogenesis::default();
    let id = new_task(&mut contract);
    context(1, 200);
    assert!(catch_unwind(AssertUnwindSafe(|| contract.accept_primary(id))).is_err());
    assert_eq!(
        contract.get_task(id).unwrap().phase,
        TaskPhase::SeekingPrimary
    );
}

#[test]
fn invalid_commitment_does_not_create_task() {
    let mut contract = Nomogenesis::default();
    context(0, 100);
    let invalid = catch_unwind(AssertUnwindSafe(|| {
        contract.create_task(accounts(1), vec![0; 31], 2, 2, 200, 400)
    }));
    assert!(invalid.is_err());
    assert!(contract.get_task(0).is_none());
    assert_eq!(new_task(&mut contract), 0);
}

#[test]
fn invalid_deadlines_and_same_account_fail() {
    let mut contract = Nomogenesis::default();
    context(0, 100);
    for (primary, first, second) in [
        (accounts(0), 200, 400),
        (accounts(1), 100, 400),
        (accounts(1), 200, 200),
    ] {
        assert!(
            catch_unwind(AssertUnwindSafe(|| {
                contract.create_task(primary, vec![0; 32], 2, 2, first, second)
            }))
            .is_err()
        );
    }
    assert!(contract.get_task(0).is_none());
}

#[test]
fn task_ids_do_not_collide() {
    let mut contract = Nomogenesis::default();
    let first = new_task(&mut contract);
    let second = new_task(&mut contract);
    assert_eq!((first, second), (0, 1));
}
