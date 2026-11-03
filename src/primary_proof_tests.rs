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

fn ready(c: &mut Nomogenesis, buyer: usize, deadline: u64) -> u64 {
    let (root, _) = fixture();

    actor(buyer, 100);
    let id = c.test_create_task(accounts(1), root, 2, 2, deadline, deadline + 100);
    actor(1, 110);
    c.accept_primary(id);
    id
}

fn selected(c: &mut Nomogenesis, buyer: usize, deadline: u64) -> (u64, u64) {
    let id = ready(c, buyer, deadline);

    actor(2, 120);
    let offer = c.test_post_offer(id, "shared".into(), deadline - 20);

    actor(buyer, 130);
    c.select_offer(id, offer);

    (id, offer)
}

fn rejected(f: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(f)).is_err());
}

#[test]
fn valid_primary_proof_completes_and_releases_slot() {
    let mut c = Nomogenesis::default();
    let (id, offer) = selected(&mut c, 0, 200);
    let (_, siblings) = fixture();

    actor(1, 150);
    c.submit_primary_proof(id, b"charlie".to_vec(), siblings);

    assert_eq!(
        c.get_task(id).unwrap().phase,
        TaskPhase::PrimaryProofAccepted
    );
    assert_eq!(c.get_offer(offer).unwrap().status, OfferStatus::Released);
    assert_eq!(c.slot_holder(accounts(2), "shared".into()), None);
}

#[test]
fn buyer_reserve_and_stranger_cannot_submit_primary_proof() {
    let mut c = Nomogenesis::default();
    let (id, offer) = selected(&mut c, 0, 200);
    let (_, siblings) = fixture();

    for account in [0, 2, 4] {
        actor(account, 150);
        rejected(|| c.submit_primary_proof(id, b"charlie".to_vec(), siblings.clone()));
    }

    assert_eq!(c.get_task(id).unwrap().phase, TaskPhase::OfferSelected);
    assert_eq!(c.slot_holder(accounts(2), "shared".into()), Some(offer));
}

#[test]
fn forged_or_malformed_proof_preserves_reservation() {
    let mut c = Nomogenesis::default();
    let (id, offer) = selected(&mut c, 0, 200);
    let (_, siblings) = fixture();

    actor(1, 150);

    rejected(|| c.submit_primary_proof(id, b"forged".to_vec(), siblings.clone()));

    let mut corrupt = siblings.clone();
    corrupt[0][0] ^= 1;
    rejected(|| c.submit_primary_proof(id, b"charlie".to_vec(), corrupt));

    rejected(|| c.submit_primary_proof(id, b"charlie".to_vec(), vec![]));

    assert_eq!(c.get_task(id).unwrap().phase, TaskPhase::OfferSelected);
    assert_eq!(c.slot_holder(accounts(2), "shared".into()), Some(offer));
}

#[test]
fn proof_before_offer_selection_and_unknown_task_fail() {
    let mut c = Nomogenesis::default();
    let id = ready(&mut c, 0, 200);
    let (_, siblings) = fixture();

    actor(1, 150);
    rejected(|| c.submit_primary_proof(id, b"charlie".to_vec(), siblings.clone()));
    rejected(|| c.submit_primary_proof(999, b"charlie".to_vec(), siblings));

    assert_eq!(c.get_task(id).unwrap().phase, TaskPhase::SeekingReserve);
}

#[test]
fn proof_at_primary_deadline_is_rejected() {
    let mut c = Nomogenesis::default();
    let (id, offer) = selected(&mut c, 0, 200);
    let (_, siblings) = fixture();

    actor(1, 200);
    rejected(|| c.submit_primary_proof(id, b"charlie".to_vec(), siblings));

    assert_eq!(c.get_task(id).unwrap().phase, TaskPhase::OfferSelected);
    assert_eq!(c.slot_holder(accounts(2), "shared".into()), Some(offer));
}

#[test]
fn completed_proof_cannot_unlock_next_buyers_slot() {
    let mut c = Nomogenesis::default();
    let (first, old_offer) = selected(&mut c, 0, 200);
    let (_, siblings) = fixture();

    actor(1, 150);
    c.submit_primary_proof(first, b"charlie".to_vec(), siblings.clone());

    let (second, new_offer) = selected(&mut c, 3, 300);

    assert_eq!(c.slot_holder(accounts(2), "shared".into()), Some(new_offer));
    assert_ne!(old_offer, new_offer);

    actor(1, 151);
    rejected(|| c.submit_primary_proof(first, b"charlie".to_vec(), siblings));

    assert_eq!(c.slot_holder(accounts(2), "shared".into()), Some(new_offer));
    assert_eq!(c.get_task(second).unwrap().phase, TaskPhase::OfferSelected);
}
