use super::tests::fixture;
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

fn selected(c: &mut Nomogenesis) -> (u64, u64) {
    let (root, _) = fixture();

    actor(0, 100);
    let task = c.test_create_task(accounts(1), root, 2, 2, 200, 300);

    actor(1, 110);
    c.accept_primary(task);

    actor(2, 120);
    let offer = c.test_post_offer(task, "shared".into(), 180);

    actor(0, 130);
    c.select_offer(task, offer);
    (task, offer)
}

fn active(c: &mut Nomogenesis) -> (u64, u64) {
    let result = selected(c);
    actor(4, 200);
    c.trigger_backup(result.0);
    result
}

fn rejected(f: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(f)).is_err());
}

#[test]
fn unrelated_caller_finalizes_at_exact_deadline() {
    let mut c = Nomogenesis::default();
    let (task, offer) = active(&mut c);

    actor(3, 300);
    c.finalize_reserve_failure(task);

    let state = c.get_task(task).unwrap();
    assert_eq!(state.phase, TaskPhase::ReserveFailed);
    assert_eq!(state.backup_activator, Some(accounts(4)));
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Released);
    assert_eq!(c.slot_holder(accounts(2), "shared".into()), None);
}

#[test]
fn premature_or_unactivated_failure_is_rejected() {
    let mut c = Nomogenesis::default();
    let (task, offer) = active(&mut c);

    actor(3, 299);
    rejected(|| c.finalize_reserve_failure(task));

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::BackupActive);
    assert_eq!(c.slot_holder(accounts(2), "shared".into()), Some(offer));

    let mut other = Nomogenesis::default();
    let (pending, _) = selected(&mut other);

    actor(3, 300);
    rejected(|| other.finalize_reserve_failure(pending));
    rejected(|| other.finalize_reserve_failure(999));
}

#[test]
fn successful_reserve_proof_cannot_be_marked_failed() {
    let mut c = Nomogenesis::default();
    let (task, offer) = active(&mut c);
    let (_, siblings) = fixture();

    actor(2, 250);
    c.submit_reserve_proof(task, b"charlie".to_vec(), siblings);

    actor(3, 300);
    rejected(|| c.finalize_reserve_failure(task));

    assert_eq!(
        c.get_task(task).unwrap().phase,
        TaskPhase::ReserveProofAccepted
    );
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Released);
}

#[test]
fn failure_replay_and_late_proof_cannot_change_state() {
    let mut c = Nomogenesis::default();
    let (task, offer) = active(&mut c);
    let (_, siblings) = fixture();

    actor(3, 300);
    c.finalize_reserve_failure(task);
    rejected(|| c.finalize_reserve_failure(task));

    actor(2, 301);
    rejected(|| c.submit_reserve_proof(task, b"charlie".to_vec(), siblings));

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::ReserveFailed);
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Released);
    assert_eq!(c.slot_holder(accounts(2), "shared".into()), None);
}

#[test]
fn old_failure_cannot_unlock_new_buyers_reservation() {
    let mut c = Nomogenesis::default();
    let (first, old_offer) = active(&mut c);

    actor(3, 300);
    c.finalize_reserve_failure(first);

    let (root, _) = fixture();
    actor(3, 301);
    let second = c.test_create_task(accounts(1), root, 2, 2, 400, 500);

    actor(1, 302);
    c.accept_primary(second);

    actor(2, 303);
    let new_offer = c.test_post_offer(second, "shared".into(), 380);

    actor(3, 304);
    c.select_offer(second, new_offer);

    actor(4, 305);
    rejected(|| c.finalize_reserve_failure(first));
    rejected(|| c.release_unaccepted_offer(old_offer));

    assert_eq!(c.slot_holder(accounts(2), "shared".into()), Some(new_offer));
    assert_eq!(c.get_task(second).unwrap().phase, TaskPhase::OfferSelected);
}
