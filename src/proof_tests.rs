use super::tests::fixture;
use super::*;
use near_sdk::test_utils::{VMContextBuilder, accounts};
use near_sdk::testing_env;

fn actor(id: usize, now: u64) {
    let mut ctx = VMContextBuilder::new();
    ctx.predecessor_account_id(accounts(id))
        .block_timestamp(now);
    testing_env!(ctx.build());
}

fn task(c: &mut Nomogenesis, root: Vec<u8>, index: u64) -> u64 {
    actor(0, 100);
    c.create_task(accounts(1), root, 2, index, 200, 400)
}

#[test]
fn correct_proof_matches_stored_task_commitment() {
    let mut c = Nomogenesis::default();
    let (root, siblings) = fixture();
    let id = task(&mut c, root, 2);

    assert!(c.verify_task_chunk(id, b"charlie".to_vec(), siblings));
}

#[test]
fn changed_payload_or_sibling_fails_against_stored_root() {
    let mut c = Nomogenesis::default();
    let (root, siblings) = fixture();
    let id = task(&mut c, root, 2);

    assert!(!c.verify_task_chunk(id, b"forged".to_vec(), siblings.clone()));

    let mut tampered = siblings;
    tampered[0][0] ^= 1;
    assert!(!c.verify_task_chunk(id, b"charlie".to_vec(), tampered));
}

#[test]
fn proof_cannot_be_transplanted_to_other_task_commitments() {
    let mut c = Nomogenesis::default();
    let (root, siblings) = fixture();

    let original = task(&mut c, root.clone(), 2);
    let wrong_index = task(&mut c, root, 3);
    let wrong_root = task(&mut c, vec![9; 32], 2);

    assert!(c.verify_task_chunk(original, b"charlie".to_vec(), siblings.clone()));
    assert!(!c.verify_task_chunk(wrong_index, b"charlie".to_vec(), siblings.clone()));
    assert!(!c.verify_task_chunk(wrong_root, b"charlie".to_vec(), siblings));
}

#[test]
fn unknown_task_and_malformed_proof_fail() {
    let mut c = Nomogenesis::default();
    let (root, siblings) = fixture();
    let id = task(&mut c, root, 2);

    assert!(!c.verify_task_chunk(999, b"charlie".to_vec(), siblings.clone()));
    assert!(!c.verify_task_chunk(id, b"charlie".to_vec(), vec![]));
    assert!(!c.verify_task_chunk(id, vec![], siblings));
}

#[test]
fn verification_is_read_only_not_a_settlement() {
    let mut c = Nomogenesis::default();
    let (root, siblings) = fixture();
    let id = task(&mut c, root, 2);

    let before = c.get_task(id).unwrap();

    actor(4, 500);
    assert!(c.verify_task_chunk(id, b"charlie".to_vec(), siblings));

    let after = c.get_task(id).unwrap();
    assert_eq!(before.phase, after.phase);
    assert_eq!(before.selected_offer, after.selected_offer);
    assert_eq!(before.root, after.root);
}
