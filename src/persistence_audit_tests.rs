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

fn reload(c: Nomogenesis) -> Nomogenesis {
    env::state_write(&c);
    drop(c);
    env::state_read::<Nomogenesis>().expect("contract state missing after reload")
}

fn selected() -> (Nomogenesis, u64, u64) {
    let (root, _) = fixture();

    actor(0, 100);
    let mut c = Nomogenesis::default();
    let id = c.test_create_task(accounts(1), root, 2, 2, 200, 300);

    actor(1, 110);
    c.accept_primary(id);

    actor(2, 120);
    let offer = c.test_post_offer(id, "audit_slot".into(), 180);

    actor(0, 130);
    c.select_offer(id, offer);

    (c, id, offer)
}

fn rejected(f: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(f)).is_err());
}

#[test]
fn reserve_lifecycle_survives_multiple_storage_reloads() {
    let (c, task, offer) = selected();
    let mut c = reload(c);

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::OfferSelected);
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Selected);
    assert_eq!(c.slot_holder(accounts(2), "audit_slot".into()), Some(offer));

    actor(4, 200);
    c.trigger_backup(task);
    let mut c = reload(c);

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::BackupActive);
    assert_eq!(
        c.get_task(task).unwrap().backup_activator,
        Some(accounts(4))
    );

    let (_, siblings) = fixture();
    actor(2, 201);
    c.submit_reserve_proof(task, b"charlie".to_vec(), siblings);
    let c = reload(c);

    assert_eq!(
        c.get_task(task).unwrap().phase,
        TaskPhase::ReserveProofAccepted
    );
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Released);
    assert_eq!(c.slot_holder(accounts(2), "audit_slot".into()), None);
}

#[test]
fn primary_terminal_state_remains_immutable_after_reload() {
    let (mut c, task, offer) = selected();
    let (_, siblings) = fixture();

    actor(1, 150);
    c.submit_primary_proof(task, b"charlie".to_vec(), siblings.clone());

    let mut c = reload(c);

    assert_eq!(
        c.get_task(task).unwrap().phase,
        TaskPhase::PrimaryProofAccepted
    );

    actor(4, 300);
    rejected(|| c.trigger_backup(task));
    rejected(|| c.close_unactivated(task));
    rejected(|| c.finalize_reserve_failure(task));
    rejected(|| c.expire_unmatched(task));

    actor(1, 301);
    rejected(|| c.submit_primary_proof(task, b"charlie".to_vec(), siblings));

    let c = reload(c);

    assert_eq!(
        c.get_task(task).unwrap().phase,
        TaskPhase::PrimaryProofAccepted
    );
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Released);
    assert_eq!(c.slot_holder(accounts(2), "audit_slot".into()), None);
}
