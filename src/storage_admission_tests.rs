use super::*;

use near_sdk::{
    NearToken,
    test_utils::{VMContextBuilder, accounts},
    testing_env,
};

use std::panic::{AssertUnwindSafe, catch_unwind};

fn context(id: usize, now: u64, deposit: u128) {
    let mut builder = VMContextBuilder::new();

    builder
        .predecessor_account_id(accounts(id))
        .block_timestamp(now)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100));

    testing_env!(builder.build());
}

// Only legacy unit tests use this adapter.
// Production entrypoints still check the actual attached deposit.
fn prepay_mock_creation() {
    let mut builder = VMContextBuilder::new();

    builder
        .current_account_id(env::current_account_id())
        .signer_account_id(env::signer_account_id())
        .predecessor_account_id(env::predecessor_account_id())
        .block_timestamp(env::block_timestamp())
        .account_balance(env::account_balance())
        .attached_deposit(NearToken::from_yoctonear(reserve_cost()));

    testing_env!(builder.build());
}

impl Nomogenesis {
    pub(crate) fn test_create_task(
        &mut self,
        primary: AccountId,
        root: Vec<u8>,
        height: u8,
        index: u64,
        primary_deadline: u64,
        reserve_deadline: u64,
    ) -> u64 {
        prepay_mock_creation();

        self.create_task(
            primary,
            root,
            height,
            index,
            primary_deadline,
            reserve_deadline,
        )
    }

    pub(crate) fn test_post_offer(
        &mut self,
        task_id: u64,
        slot_id: String,
        expires_at: u64,
    ) -> u64 {
        prepay_mock_creation();
        self.post_offer(task_id, slot_id, expires_at)
    }
}

fn rejected(f: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(f)).is_err());
}

#[test]
fn task_creation_rejects_missing_and_incorrect_storage_funding() {
    let mut c = Nomogenesis::default();

    context(0, 100, 0);
    let required = reserve_cost();

    rejected(|| {
        c.create_task(accounts(1), vec![7; 32], 2, 2, 200, 300);
    });

    context(0, 100, required - 1);
    rejected(|| {
        c.create_task(accounts(1), vec![7; 32], 2, 2, 200, 300);
    });

    context(0, 100, required + 1);
    rejected(|| {
        c.create_task(accounts(1), vec![7; 32], 2, 2, 200, 300);
    });

    assert_eq!(c.next_task_id, 0);
    assert_eq!(c.storage_reserves, 0);

    context(0, 100, required);
    let id = c.create_task(accounts(1), vec![7; 32], 2, 2, 200, 300);

    assert_eq!(id, 0);
    assert_eq!(c.task_storage_bond(id), Some((accounts(0), U128(required))));
    assert_eq!(c.storage_reserves, required);
}

#[test]
fn offer_creation_rejects_unfunded_writes_and_tracks_payer() {
    let mut c = Nomogenesis::default();

    context(0, 100, 0);
    let required = reserve_cost();

    context(0, 100, required);
    let task = c.create_task(accounts(1), vec![7; 32], 2, 2, 200, 300);

    context(1, 110, 0);
    c.accept_primary(task);

    context(2, 120, 0);
    rejected(|| {
        c.post_offer(task, "slot".into(), 180);
    });

    context(2, 120, required - 1);
    rejected(|| {
        c.post_offer(task, "slot".into(), 180);
    });

    assert_eq!(c.next_offer_id, 0);
    assert_eq!(c.storage_reserves, required);

    context(2, 120, required);
    let offer = c.post_offer(task, "slot".into(), 180);

    assert_eq!(
        c.offer_storage_bond(offer),
        Some((accounts(2), U128(required)))
    );
    assert_eq!(c.storage_reserves, 2 * required);
}

#[test]
fn storage_bond_ownership_survives_state_reload() {
    let mut c = Nomogenesis::default();

    context(0, 100, 0);
    let required = reserve_cost();

    context(0, 100, required);
    let task = c.create_task(accounts(1), vec![7; 32], 2, 2, 200, 300);

    context(1, 110, 0);
    c.accept_primary(task);

    context(2, 120, required);
    let offer = c.post_offer(task, "persistent".into(), 180);

    env::state_write(&c);
    drop(c);

    let reloaded: Nomogenesis = env::state_read().expect("state missing");

    assert_eq!(
        reloaded.task_storage_bond(task),
        Some((accounts(0), U128(required)))
    );

    assert_eq!(
        reloaded.offer_storage_bond(offer),
        Some((accounts(2), U128(required)))
    );

    assert_eq!(reloaded.storage_reserves, 2 * required);
}
