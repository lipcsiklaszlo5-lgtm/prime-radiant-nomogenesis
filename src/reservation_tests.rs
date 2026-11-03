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
    let id = c.create_task(accounts(1), vec![7; 32], 2, 2, deadline, deadline + 100);
    actor(1, 110);
    c.accept_primary(id);
    id
}

fn listed(c: &mut Nomogenesis, task: u64, reserve: usize, slot: &str, expiry: u64) -> u64 {
    actor(reserve, 120);
    c.post_offer(task, slot.into(), expiry)
}

fn rejected(f: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(f)).is_err());
}

#[test]
fn buyer_selects_offer_and_locks_slot() {
    let mut c = Nomogenesis::default();
    let task = ready(&mut c, 0, 200);
    let offer = listed(&mut c, task, 2, "slot_A", 180);
    actor(0, 130);
    c.select_offer(task, offer);

    let t = c.get_task(task).unwrap();
    assert_eq!(t.phase, TaskPhase::OfferSelected);
    assert_eq!(t.selected_offer, Some(offer));
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Selected);
    assert_eq!(c.slot_holder(accounts(2), "slot_A".into()), Some(offer));
}

#[test]
fn separate_buyers_cannot_double_book_same_provider_slot() {
    let mut c = Nomogenesis::default();
    let first = ready(&mut c, 0, 200);
    let second = ready(&mut c, 3, 260);
    let a = listed(&mut c, first, 2, "shared", 180);
    let b = listed(&mut c, second, 2, "shared", 240);

    actor(0, 130);
    c.select_offer(first, a);
    actor(3, 131);
    rejected(|| c.select_offer(second, b));

    assert_eq!(c.slot_holder(accounts(2), "shared".into()), Some(a));
    assert_eq!(c.get_offer(b).unwrap().status, OfferStatus::Available);
    assert_eq!(c.get_task(second).unwrap().phase, TaskPhase::SeekingReserve);
}

#[test]
fn unauthorized_buyer_and_wrong_task_offer_fail() {
    let mut c = Nomogenesis::default();
    let first = ready(&mut c, 0, 200);
    let second = ready(&mut c, 3, 260);
    let offer = listed(&mut c, first, 2, "x", 180);

    actor(3, 130);
    rejected(|| c.select_offer(first, offer));
    actor(3, 131);
    rejected(|| c.select_offer(second, offer));

    assert_eq!(c.slot_holder(accounts(2), "x".into()), None);
}

#[test]
fn expired_offer_and_repeated_selection_fail() {
    let mut c = Nomogenesis::default();
    let task = ready(&mut c, 0, 200);
    let expired = listed(&mut c, task, 2, "old", 140);
    let valid = listed(&mut c, task, 2, "new", 180);

    actor(0, 140);
    rejected(|| c.select_offer(task, expired));
    actor(0, 150);
    c.select_offer(task, valid);
    rejected(|| c.select_offer(task, valid));
    rejected(|| c.select_offer(task, expired));

    assert_eq!(c.slot_holder(accounts(2), "new".into()), Some(valid));
}

#[test]
fn different_providers_can_use_identical_slot_names() {
    let mut c = Nomogenesis::default();
    let first = ready(&mut c, 0, 200);
    let second = ready(&mut c, 3, 260);
    let a = listed(&mut c, first, 2, "gpu_0", 180);
    let b = listed(&mut c, second, 4, "gpu_0", 240);

    actor(0, 130);
    c.select_offer(first, a);
    actor(3, 131);
    c.select_offer(second, b);

    assert_eq!(c.slot_holder(accounts(2), "gpu_0".into()), Some(a));
    assert_eq!(c.slot_holder(accounts(4), "gpu_0".into()), Some(b));
}

#[test]
fn unactivated_option_releases_slot_for_new_buyer() {
    let mut c = Nomogenesis::default();
    let first = ready(&mut c, 0, 200);
    let second = ready(&mut c, 3, 450);
    let a = listed(&mut c, first, 2, "shared", 180);
    let b = listed(&mut c, second, 2, "shared", 430);

    actor(0, 130);
    c.select_offer(first, a);

    actor(4, 299);
    rejected(|| c.close_unactivated(first));

    actor(4, 300);
    c.close_unactivated(first);
    assert_eq!(c.slot_holder(accounts(2), "shared".into()), None);
    assert_eq!(c.get_offer(a).unwrap().status, OfferStatus::Released);
    assert_eq!(
        c.get_task(first).unwrap().phase,
        TaskPhase::UnactivatedExpired
    );
    rejected(|| c.close_unactivated(first));

    actor(3, 301);
    c.select_offer(second, b);
    assert_eq!(c.slot_holder(accounts(2), "shared".into()), Some(b));
}
