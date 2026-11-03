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
    let offer = c.test_post_offer(task, "reserve_slot".into(), 180);

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
fn valid_reserve_proof_completes_and_releases_slot() {
    let mut c = Nomogenesis::default();
    let (task, offer) = active(&mut c);
    let (_, siblings) = fixture();

    actor(2, 201);
    c.submit_reserve_proof(task, b"charlie".to_vec(), siblings);

    let state = c.get_task(task).unwrap();
    assert_eq!(state.phase, TaskPhase::ReserveProofAccepted);
    assert_eq!(state.backup_activator, Some(accounts(4)));
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Released);
    assert_eq!(c.slot_holder(accounts(2), "reserve_slot".into()), None);
}

#[test]
fn buyer_primary_keeper_and_stranger_cannot_submit() {
    let mut c = Nomogenesis::default();
    let (task, offer) = active(&mut c);
    let (_, siblings) = fixture();

    for account in [0, 1, 3, 4] {
        actor(account, 201);
        rejected(|| c.submit_reserve_proof(task, b"charlie".to_vec(), siblings.clone()));
    }

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::BackupActive);
    assert_eq!(
        c.slot_holder(accounts(2), "reserve_slot".into()),
        Some(offer)
    );
}

#[test]
fn reserve_cannot_submit_before_backup_activation() {
    let mut c = Nomogenesis::default();
    let (task, offer) = selected(&mut c);
    let (_, siblings) = fixture();

    actor(2, 190);
    rejected(|| c.submit_reserve_proof(task, b"charlie".to_vec(), siblings.clone()));

    actor(2, 200);
    rejected(|| c.submit_reserve_proof(task, b"charlie".to_vec(), siblings));

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::OfferSelected);
    assert_eq!(
        c.slot_holder(accounts(2), "reserve_slot".into()),
        Some(offer)
    );
}

#[test]
fn forged_and_malformed_proofs_preserve_active_reservation() {
    let mut c = Nomogenesis::default();
    let (task, offer) = active(&mut c);
    let (_, siblings) = fixture();

    actor(2, 201);

    rejected(|| c.submit_reserve_proof(task, b"forged".to_vec(), siblings.clone()));

    let mut corrupt = siblings.clone();
    corrupt[0][0] ^= 1;
    rejected(|| c.submit_reserve_proof(task, b"charlie".to_vec(), corrupt));

    rejected(|| c.submit_reserve_proof(task, b"charlie".to_vec(), vec![]));

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::BackupActive);
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Selected);
    assert_eq!(
        c.slot_holder(accounts(2), "reserve_slot".into()),
        Some(offer)
    );
}

#[test]
fn reserve_proof_at_or_after_deadline_is_rejected() {
    let mut c = Nomogenesis::default();
    let (task, offer) = active(&mut c);
    let (_, siblings) = fixture();

    for now in [300, 301] {
        actor(2, now);
        rejected(|| c.submit_reserve_proof(task, b"charlie".to_vec(), siblings.clone()));
    }

    assert_eq!(c.get_task(task).unwrap().phase, TaskPhase::BackupActive);
    assert_eq!(
        c.slot_holder(accounts(2), "reserve_slot".into()),
        Some(offer)
    );
}

#[test]
fn replay_cannot_unlock_another_buyers_slot() {
    let mut c = Nomogenesis::default();
    let (first, old_offer) = active(&mut c);
    let (root, siblings) = fixture();

    actor(3, 201);
    let second = c.test_create_task(accounts(1), root, 2, 2, 400, 500);

    actor(1, 202);
    c.accept_primary(second);

    actor(2, 203);
    let new_offer = c.test_post_offer(second, "reserve_slot".into(), 380);

    actor(3, 204);
    rejected(|| c.select_offer(second, new_offer));

    actor(2, 210);
    c.submit_reserve_proof(first, b"charlie".to_vec(), siblings.clone());

    assert_eq!(
        c.get_offer(old_offer).unwrap().status,
        OfferStatus::Released
    );

    actor(3, 211);
    c.select_offer(second, new_offer);

    actor(2, 212);
    rejected(|| c.submit_reserve_proof(first, b"charlie".to_vec(), siblings));

    assert_eq!(
        c.slot_holder(accounts(2), "reserve_slot".into()),
        Some(new_offer)
    );
    assert_eq!(c.get_task(second).unwrap().phase, TaskPhase::OfferSelected);
}
