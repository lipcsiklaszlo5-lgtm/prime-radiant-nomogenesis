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
    let task = c.create_task(accounts(1), root, 2, 2, 200, 300);

    actor(1, 110);
    c.accept_primary(task);

    actor(2, 120);
    let offer = c.post_offer(task, "shared".into(), 180);

    actor(0, 130);
    c.select_offer(task, offer);

    (task, offer)
}

fn rejected(f: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(f)).is_err());
}

#[test]
fn any_caller_closes_at_exact_reserve_deadline() {
    let mut c = Nomogenesis::default();
    let (task, offer) = selected(&mut c);

    actor(4, 300);
    c.close_unactivated(task);

    let state = c.get_task(task).unwrap();
    assert_eq!(state.phase, TaskPhase::UnactivatedExpired);
    assert_eq!(state.backup_activator, None);
    assert_eq!(state.selected_offer, Some(offer));
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Released);
    assert_eq!(c.slot_holder(accounts(2), "shared".into()), None);
}

#[test]
fn cannot_close_while_backup_activation_remains_possible() {
    let mut c = Nomogenesis::default();
    let (task, offer) = selected(&mut c);

    for now in [199, 200, 299] {
        actor(4, now);
        rejected(|| c.close_unactivated(task));
    }

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::OfferSelected);
    assert_eq!(c.slot_holder(accounts(2), "shared".into()), Some(offer));
}

#[test]
fn activated_backup_must_use_its_own_settlement_path() {
    let mut c = Nomogenesis::default();
    let (task, offer) = selected(&mut c);

    actor(4, 200);
    c.trigger_backup(task);

    actor(3, 300);
    rejected(|| c.close_unactivated(task));

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::BackupActive);
    assert_eq!(c.slot_holder(accounts(2), "shared".into()), Some(offer));

    c.finalize_reserve_failure(task);
    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::ReserveFailed);
}

#[test]
fn primary_success_cannot_be_closed_as_unactivated() {
    let mut c = Nomogenesis::default();
    let (task, offer) = selected(&mut c);
    let (_, siblings) = fixture();

    actor(1, 150);
    c.submit_primary_proof(task, b"charlie".to_vec(), siblings);

    actor(4, 300);
    rejected(|| c.close_unactivated(task));

    assert_eq!(
        c.get_task(task).unwrap().phase,
        TaskPhase::PrimaryProofAccepted
    );
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Released);
}

#[test]
fn replay_cannot_unlock_another_buyers_reservation() {
    let mut c = Nomogenesis::default();
    let (first, old_offer) = selected(&mut c);
    let (root, _) = fixture();

    actor(3, 140);
    let second = c.create_task(accounts(1), root, 2, 2, 450, 550);

    actor(1, 145);
    c.accept_primary(second);

    actor(2, 150);
    let new_offer = c.post_offer(second, "shared".into(), 430);

    actor(3, 151);
    rejected(|| c.select_offer(second, new_offer));

    actor(4, 300);
    c.close_unactivated(first);

    actor(3, 301);
    c.select_offer(second, new_offer);

    actor(4, 302);
    rejected(|| c.close_unactivated(first));
    rejected(|| c.release_unaccepted_offer(old_offer));

    assert_eq!(c.slot_holder(accounts(2), "shared".into()), Some(new_offer));
    assert_eq!(c.get_task(second).unwrap().phase, TaskPhase::OfferSelected);
}
