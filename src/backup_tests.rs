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
    let offer = c.post_offer(task, "backup_slot".into(), 180);

    actor(0, 130);
    c.select_offer(task, offer);

    (task, offer)
}

fn rejected(f: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(f)).is_err());
}

#[test]
fn unrelated_keeper_activates_at_exact_deadline() {
    let mut c = Nomogenesis::default();
    let (task, offer) = selected(&mut c);

    actor(4, 200);
    c.trigger_backup(task);

    let state = c.get_task(task).unwrap();
    assert_eq!(state.phase, TaskPhase::BackupActive);
    assert_eq!(state.backup_activator, Some(accounts(4)));
    assert_eq!(
        c.slot_holder(accounts(2), "backup_slot".into()),
        Some(offer)
    );
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Selected);
}

#[test]
fn neither_activation_nor_expiration_can_preempt_deadline() {
    let mut c = Nomogenesis::default();
    let (task, offer) = selected(&mut c);

    actor(4, 199);
    rejected(|| c.trigger_backup(task));
    rejected(|| c.close_unactivated(task));

    actor(4, 200);
    rejected(|| c.close_unactivated(task));

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::OfferSelected);
    assert_eq!(
        c.slot_holder(accounts(2), "backup_slot".into()),
        Some(offer)
    );

    c.trigger_backup(task);
    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::BackupActive);
}

#[test]
fn activation_at_reserve_deadline_is_too_late() {
    let mut c = Nomogenesis::default();
    let (task, offer) = selected(&mut c);

    actor(4, 300);
    rejected(|| c.trigger_backup(task));

    c.close_unactivated(task);
    assert_eq!(
        c.get_task(task).unwrap().phase,
        TaskPhase::UnactivatedExpired
    );
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Released);
    assert_eq!(c.slot_holder(accounts(2), "backup_slot".into()), None);
}

#[test]
fn repeated_activation_cannot_replace_original_keeper() {
    let mut c = Nomogenesis::default();
    let (task, offer) = selected(&mut c);

    actor(4, 200);
    c.trigger_backup(task);

    actor(3, 201);
    rejected(|| c.trigger_backup(task));

    assert_eq!(
        c.get_task(task).unwrap().backup_activator,
        Some(accounts(4))
    );
    assert_eq!(
        c.slot_holder(accounts(2), "backup_slot".into()),
        Some(offer)
    );
}

#[test]
fn tasks_without_selection_cannot_activate() {
    let mut c = Nomogenesis::default();
    let (root, _) = fixture();

    actor(0, 100);
    let task = c.create_task(accounts(1), root, 2, 2, 200, 300);

    actor(4, 200);
    rejected(|| c.trigger_backup(task));

    actor(1, 110);
    c.accept_primary(task);

    actor(4, 200);
    rejected(|| c.trigger_backup(task));
    rejected(|| c.trigger_backup(999));

    assert_eq!(c.get_task(task).unwrap().backup_activator, None);
}

#[test]
fn primary_success_blocks_backup_and_backup_blocks_primary() {
    let (_, siblings) = fixture();

    let mut first = Nomogenesis::default();
    let (task, _) = selected(&mut first);

    actor(1, 150);
    first.submit_primary_proof(task, b"charlie".to_vec(), siblings.clone());

    actor(4, 200);
    rejected(|| first.trigger_backup(task));

    let mut second = Nomogenesis::default();
    let (task, offer) = selected(&mut second);

    actor(4, 200);
    second.trigger_backup(task);

    actor(1, 201);
    rejected(|| second.submit_primary_proof(task, b"charlie".to_vec(), siblings));

    actor(4, 300);
    rejected(|| second.close_unactivated(task));

    assert_eq!(
        second.get_task(task).unwrap().phase,
        TaskPhase::BackupActive
    );
    assert_eq!(
        second.slot_holder(accounts(2), "backup_slot".into()),
        Some(offer)
    );
}
