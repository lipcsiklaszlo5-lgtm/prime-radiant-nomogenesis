use super::*;
use near_sdk::test_utils::{VMContextBuilder, accounts};
use near_sdk::testing_env;
use std::panic::{AssertUnwindSafe, catch_unwind};

fn actor(id: usize, now: u64) {
    let mut ctx = VMContextBuilder::new();
    ctx.predecessor_account_id(accounts(id))
        .block_timestamp(now);
    testing_env!(ctx.build());
}

fn create(c: &mut Nomogenesis, buyer: usize) -> u64 {
    actor(buyer, 100);
    c.test_create_task(accounts(1), vec![7; 32], 2, 2, 200, 300)
}

fn accepted(c: &mut Nomogenesis, buyer: usize) -> u64 {
    let id = create(c, buyer);
    actor(1, 110);
    c.accept_primary(id);
    id
}

fn rejected(f: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(f)).is_err());
}

#[test]
fn buyer_cancels_before_primary_acceptance() {
    let mut c = Nomogenesis::default();
    let task = create(&mut c, 0);

    actor(0, 120);
    c.cancel_unmatched(task);

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::Cancelled);

    actor(1, 121);
    rejected(|| c.accept_primary(task));

    actor(4, 300);
    rejected(|| c.expire_unmatched(task));
}

#[test]
fn cancellation_keeps_unaccepted_offer_releasable() {
    let mut c = Nomogenesis::default();
    let task = accepted(&mut c, 0);

    actor(2, 120);
    let offer = c.test_post_offer(task, "slot_A".into(), 180);

    actor(0, 121);
    c.cancel_unmatched(task);

    actor(4, 122);
    c.release_unaccepted_offer(offer);

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::Cancelled);
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Released);
    assert_eq!(c.slot_holder(accounts(2), "slot_A".into()), None);
    rejected(|| c.release_unaccepted_offer(offer));
}

#[test]
fn stranger_cannot_cancel_and_buyer_cannot_cancel_twice() {
    let mut c = Nomogenesis::default();
    let task = accepted(&mut c, 0);

    actor(3, 130);
    rejected(|| c.cancel_unmatched(task));

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::SeekingReserve);

    actor(0, 131);
    c.cancel_unmatched(task);
    rejected(|| c.cancel_unmatched(task));
    rejected(|| c.cancel_unmatched(999));
}

#[test]
fn unrelated_caller_expires_unmatched_task_at_deadline() {
    let mut c = Nomogenesis::default();
    let task = create(&mut c, 0);

    actor(4, 199);
    rejected(|| c.expire_unmatched(task));

    actor(4, 200);
    c.expire_unmatched(task);
    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::UnmatchedExpired);

    rejected(|| c.expire_unmatched(task));

    actor(1, 201);
    rejected(|| c.accept_primary(task));
}

#[test]
fn unmatched_expiry_cannot_destroy_selected_slot() {
    let mut c = Nomogenesis::default();
    let task = accepted(&mut c, 0);

    actor(2, 120);
    let offer = c.test_post_offer(task, "slot_A".into(), 180);

    actor(0, 130);
    c.select_offer(task, offer);
    rejected(|| c.cancel_unmatched(task));

    actor(4, 200);
    rejected(|| c.expire_unmatched(task));

    actor(4, 300);
    rejected(|| c.expire_unmatched(task));

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::OfferSelected);
    assert_eq!(c.slot_holder(accounts(2), "slot_A".into()), Some(offer));
}

#[test]
fn one_buyers_cancellation_does_not_change_other_task() {
    let mut c = Nomogenesis::default();
    let first = create(&mut c, 0);
    let second = create(&mut c, 3);

    actor(0, 120);
    c.cancel_unmatched(first);

    assert_eq!(c.get_task(first).unwrap().phase, TaskPhase::Cancelled);
    assert_eq!(c.get_task(second).unwrap().phase, TaskPhase::SeekingPrimary);

    actor(1, 121);
    c.accept_primary(second);
    assert_eq!(c.get_task(second).unwrap().phase, TaskPhase::SeekingReserve);
}
