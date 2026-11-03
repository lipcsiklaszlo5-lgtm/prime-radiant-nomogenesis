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

fn rejected(f: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(f)).is_err());
}

fn make_terminal(phase: TaskPhase) -> (Nomogenesis, u64, u64) {
    let (root, siblings) = fixture();

    actor(0, 100);
    let mut c = Nomogenesis::default();
    let id = c.test_create_task(accounts(1), root, 2, 2, 200, 300);

    actor(1, 110);
    c.accept_primary(id);

    actor(2, 120);
    let offer = c.test_post_offer(id, "audit_slot".into(), 180);

    match phase {
        TaskPhase::Cancelled => {
            actor(0, 130);
            c.cancel_unmatched(id);
        }
        TaskPhase::UnmatchedExpired => {
            actor(4, 200);
            c.expire_unmatched(id);
        }
        TaskPhase::PrimaryProofAccepted => {
            actor(0, 130);
            c.select_offer(id, offer);
            actor(1, 150);
            c.submit_primary_proof(id, b"charlie".to_vec(), siblings);
        }
        TaskPhase::UnactivatedExpired => {
            actor(0, 130);
            c.select_offer(id, offer);
            actor(4, 300);
            c.close_unactivated(id);
        }
        TaskPhase::ReserveProofAccepted => {
            actor(0, 130);
            c.select_offer(id, offer);
            actor(4, 200);
            c.trigger_backup(id);
            actor(2, 250);
            c.submit_reserve_proof(id, b"charlie".to_vec(), siblings);
        }
        TaskPhase::ReserveFailed => {
            actor(0, 130);
            c.select_offer(id, offer);
            actor(4, 200);
            c.trigger_backup(id);
            actor(4, 300);
            c.finalize_reserve_failure(id);
        }
        _ => panic!("not a terminal phase"),
    }

    (c, id, offer)
}

fn audit_terminal(phase: TaskPhase) {
    let (mut c, id, offer) = make_terminal(phase.clone());
    let (_, siblings) = fixture();

    let before_task = c.get_task(id).unwrap();
    let before_offer = c.get_offer(offer).unwrap();
    let before_lock = c.slot_holder(accounts(2), "audit_slot".into());

    assert_eq!(before_task.phase, phase);

    actor(1, 310);
    rejected(|| c.accept_primary(id));
    rejected(|| c.submit_primary_proof(id, b"charlie".to_vec(), siblings.clone()));

    actor(2, 310);
    rejected(|| {
        c.test_post_offer(id, "new_slot".into(), 320);
    });
    rejected(|| c.submit_reserve_proof(id, b"charlie".to_vec(), siblings.clone()));

    actor(0, 310);
    rejected(|| c.cancel_unmatched(id));
    rejected(|| c.select_offer(id, offer));

    actor(4, 310);
    rejected(|| c.expire_unmatched(id));
    rejected(|| c.trigger_backup(id));
    rejected(|| c.close_unactivated(id));
    rejected(|| c.finalize_reserve_failure(id));

    if before_offer.status == OfferStatus::Released {
        actor(2, 310);
        rejected(|| c.release_unaccepted_offer(offer));
    }

    assert_eq!(
        c.get_task(id).unwrap(),
        before_task,
        "terminal task mutated"
    );
    assert_eq!(
        c.get_offer(offer).unwrap(),
        before_offer,
        "terminal offer mutated"
    );
    assert_eq!(
        c.slot_holder(accounts(2), "audit_slot".into()),
        before_lock,
        "terminal slot lock mutated"
    );
}

#[test]
fn cancelled_is_terminal() {
    audit_terminal(TaskPhase::Cancelled);
}

#[test]
fn unmatched_expired_is_terminal() {
    audit_terminal(TaskPhase::UnmatchedExpired);
}

#[test]
fn primary_proof_accepted_is_terminal() {
    audit_terminal(TaskPhase::PrimaryProofAccepted);
}

#[test]
fn reserve_proof_accepted_is_terminal() {
    audit_terminal(TaskPhase::ReserveProofAccepted);
}

#[test]
fn reserve_failed_is_terminal() {
    audit_terminal(TaskPhase::ReserveFailed);
}

#[test]
fn unactivated_expired_is_terminal() {
    audit_terminal(TaskPhase::UnactivatedExpired);
}

#[test]
fn offer_cleanup_after_cancel_does_not_mutate_terminal_task() {
    let (mut c, id, offer) = make_terminal(TaskPhase::Cancelled);

    let before = c.get_task(id).unwrap();

    actor(4, 131);
    c.release_unaccepted_offer(offer);

    assert_eq!(c.get_task(id).unwrap(), before);
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Released);
    assert_eq!(c.slot_holder(accounts(2), "audit_slot".into()), None);

    rejected(|| c.release_unaccepted_offer(offer));
}
