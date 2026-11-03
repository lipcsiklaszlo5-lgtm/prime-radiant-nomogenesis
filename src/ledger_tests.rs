use super::*;
use near_sdk::{
    NearToken,
    test_utils::{VMContextBuilder, accounts},
    testing_env,
};
use std::panic::{AssertUnwindSafe, catch_unwind};

fn actor(id: usize, now: u64, deposit: u128) {
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(accounts(id))
        .block_timestamp(now)
        .attached_deposit(NearToken::from_yoctonear(deposit));
    testing_env!(b.build());
}

fn funded() -> (Nomogenesis, u64, u64, Vec<Vec<u8>>) {
    let mut c = Nomogenesis::default();
    let (root, siblings) = super::tests::fixture();
    let storage = reserve_cost();

    actor(0, 100, 0);
    let task = c.test_create_task(accounts(1), root, 2, 2, 200, 300);

    actor(0, 101, 35 + storage);
    c.fund_task(task, U128(20), U128(10), U128(3), U128(2));

    actor(1, 105, 0);
    c.accept_primary(task);

    actor(2, 110, 0);
    let offer = c.test_post_offer(task, "ledger_slot".into(), 180);

    actor(2, 115, 13 + storage);
    c.fund_offer(offer, U128(13));

    actor(0, 120, 0);
    c.select_offer(task, offer);

    (c, task, offer, siblings)
}

fn balances(c: &Nomogenesis) -> [u128; 4] {
    [0, 1, 2, 4].map(|i| c.get_claimable(accounts(i)).0)
}

#[test]
fn four_terminal_outcomes_conserve_funds() {
    let expected = [
        [12, 20, 16, 0],
        [20, 0, 26, 2],
        [46, 0, 0, 2],
        [32, 0, 16, 0],
    ];

    for (case, credits) in expected.into_iter().enumerate() {
        // Fresh chain storage for each independent settlement case.
        near_sdk::env::set_blockchain_interface(near_sdk::MockedBlockchain::new(
            VMContextBuilder::new().build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            vec![],
            Default::default(),
            Default::default(),
            None,
        ));

        let (mut c, task, offer, siblings) = funded();

        match case {
            0 => {
                actor(1, 150, 0);
                c.submit_primary_proof(task, b"charlie".to_vec(), siblings);
            }
            1 | 2 => {
                actor(4, 200, 0);
                c.trigger_backup(task);

                if case == 1 {
                    actor(2, 201, 0);
                    c.submit_reserve_proof(task, b"charlie".to_vec(), siblings);
                } else {
                    actor(4, 300, 0);
                    c.finalize_reserve_failure(task);
                }
            }
            3 => {
                actor(4, 300, 0);
                c.close_unactivated(task);
            }
            _ => unreachable!(),
        }

        assert_eq!(balances(&c), credits);
        assert_eq!(c.claimable_total(), U128(48));
        assert!(c.is_task_settled(task));
        assert_eq!(c.economic_escrow, 0);
        assert_eq!(c.collateral_escrow, 0);
        assert!(c.offer_deposits.get(&offer).is_none());
        assert_eq!(c.storage_reserves, 4 * reserve_cost());
    }
}

#[test]
fn keeper_may_be_buyer() {
    let (mut c, task, _, siblings) = funded();

    actor(0, 200, 0);
    c.trigger_backup(task);

    actor(2, 201, 0);
    c.submit_reserve_proof(task, b"charlie".to_vec(), siblings);

    assert_eq!(c.get_claimable(accounts(0)), U128(22));
    assert_eq!(c.get_claimable(accounts(2)), U128(26));
    assert_eq!(c.claimable_total(), U128(48));
}

#[test]
fn unmatched_cancellation_refunds_buyer() {
    let mut c = Nomogenesis::default();
    let (root, _) = super::tests::fixture();

    actor(0, 100, 0);
    let id = c.test_create_task(accounts(1), root, 2, 2, 200, 300);

    actor(0, 110, 35 + reserve_cost());
    c.fund_task(id, U128(20), U128(10), U128(3), U128(2));

    actor(0, 120, 0);
    c.cancel_unmatched(id);

    assert_eq!(c.get_claimable(accounts(0)), U128(35));
    assert_eq!(c.economic_escrow, 0);
    assert!(c.is_task_settled(id));

    assert!(catch_unwind(AssertUnwindSafe(|| c.cancel_unmatched(id))).is_err());
    assert_eq!(c.claimable_total(), U128(35));
}

#[test]
fn unused_collateral_returns_to_reserve() {
    let mut c = Nomogenesis::default();
    let (root, _) = super::tests::fixture();

    actor(0, 100, 0);
    let id = c.test_create_task(accounts(1), root, 2, 2, 200, 300);

    actor(0, 101, 35 + reserve_cost());
    c.fund_task(id, U128(20), U128(10), U128(3), U128(2));

    actor(1, 110, 0);
    c.accept_primary(id);

    actor(2, 120, 0);
    let offer = c.test_post_offer(id, "free_slot".into(), 180);

    actor(2, 130, 13 + reserve_cost());
    c.fund_offer(offer, U128(13));

    let storage_before_release = c.storage_reserves;

    actor(4, 181, 0);
    c.release_unaccepted_offer(offer);

    let reserve_credit = c.get_claimable(accounts(2)).0;
    let storage_rebate = reserve_credit
        .checked_sub(13)
        .expect("collateral not fully returned");

    assert!(storage_rebate <= reserve_cost());
    assert_eq!(
        c.storage_reserves.checked_add(storage_rebate),
        Some(storage_before_release)
    );
    assert_eq!(c.get_claimable(accounts(4)), U128(0));
    assert_eq!(c.collateral_escrow, 0);

    assert!(catch_unwind(AssertUnwindSafe(|| { c.release_unaccepted_offer(offer) })).is_err());

    actor(0, 182, 0);
    c.cancel_unmatched(id);

    assert_eq!(c.get_claimable(accounts(0)), U128(35));
    assert_eq!(c.claimable_total(), U128(48 + storage_rebate));
}

#[test]
fn selected_collateral_cannot_be_refunded_early() {
    let (mut c, task, offer, _) = funded();

    actor(4, 150, 0);

    assert!(catch_unwind(AssertUnwindSafe(|| { c.refund_released_offer(offer) })).is_err());

    assert!(!c.is_task_settled(task));
    assert_eq!(c.collateral_escrow, 13);
    assert_eq!(c.claimable_total(), U128(0));
}

#[test]
fn live_task_has_no_claimable_money() {
    let (c, task, _, _) = funded();

    assert!(!c.is_task_settled(task));
    assert_eq!(c.claimable_total(), U128(0));
    assert_eq!(c.economic_escrow, 35);
    assert_eq!(c.collateral_escrow, 13);
}
