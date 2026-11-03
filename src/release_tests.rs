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

fn ready(c: &mut Nomogenesis, buyer: usize, deadline: u64) -> u64 {
    actor(buyer, 100);
    let id = c.test_create_task(accounts(1), vec![7; 32], 2, 2, deadline, deadline + 100);
    actor(1, 110);
    c.accept_primary(id);
    id
}

fn listed(c: &mut Nomogenesis, task: u64, expiry: u64) -> u64 {
    actor(2, 120);
    c.test_post_offer(task, "shared".into(), expiry)
}

fn rejected(f: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(f)).is_err());
}

#[test]
fn owner_can_withdraw_unaccepted_offer_before_expiry() {
    let mut c = Nomogenesis::default();
    let task = ready(&mut c, 0, 200);
    let offer = listed(&mut c, task, 180);

    actor(2, 130);
    c.release_unaccepted_offer(offer);

    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Released);
    assert_eq!(c.slot_holder(accounts(2), "shared".into()), None);

    actor(0, 131);
    rejected(|| c.select_offer(task, offer));
}

#[test]
fn stranger_cannot_release_live_unaccepted_offer() {
    let mut c = Nomogenesis::default();
    let task = ready(&mut c, 0, 200);
    let offer = listed(&mut c, task, 180);

    actor(4, 130);
    rejected(|| c.release_unaccepted_offer(offer));

    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Available);
}

#[test]
fn stranger_can_release_expired_unaccepted_offer_once() {
    let mut c = Nomogenesis::default();
    let task = ready(&mut c, 0, 200);
    let offer = listed(&mut c, task, 180);

    actor(4, 180);
    c.release_unaccepted_offer(offer);
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Released);

    rejected(|| c.release_unaccepted_offer(offer));
    rejected(|| c.release_unaccepted_offer(999));
}

#[test]
fn selected_offer_cannot_be_cancelled_by_owner_or_stranger() {
    let mut c = Nomogenesis::default();
    let task = ready(&mut c, 0, 200);
    let offer = listed(&mut c, task, 180);

    actor(0, 130);
    c.select_offer(task, offer);

    actor(2, 150);
    rejected(|| c.release_unaccepted_offer(offer));

    actor(4, 180);
    rejected(|| c.release_unaccepted_offer(offer));

    assert_eq!(c.slot_holder(accounts(2), "shared".into()), Some(offer));
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Selected);
}

#[test]
fn old_release_cannot_unlock_new_buyers_reservation() {
    let mut c = Nomogenesis::default();
    let first = ready(&mut c, 0, 200);
    let second = ready(&mut c, 3, 450);
    let old = listed(&mut c, first, 180);
    let new = listed(&mut c, second, 430);

    actor(0, 130);
    c.select_offer(first, old);

    actor(4, 300);
    c.close_unactivated(first);

    actor(3, 301);
    c.select_offer(second, new);

    actor(4, 302);
    rejected(|| c.release_unaccepted_offer(old));
    rejected(|| c.close_unactivated(first));

    assert_eq!(c.slot_holder(accounts(2), "shared".into()), Some(new));
    assert_eq!(c.get_offer(new).unwrap().status, OfferStatus::Selected);
    assert_eq!(c.get_task(second).unwrap().phase, TaskPhase::OfferSelected);
}
