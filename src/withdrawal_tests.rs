use super::*;

use near_sdk::{
    NearToken, PromiseResult,
    test_utils::{VMContextBuilder, accounts},
    testing_env,
};

use std::panic::{AssertUnwindSafe, catch_unwind};

fn actor(id: usize, now: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id("contract.near".parse().unwrap())
        .predecessor_account_id(accounts(id))
        .block_timestamp(now)
        .account_balance(NearToken::from_near(100));
    testing_env!(b.build());
}

fn callback_env(result: PromiseResult) {
    let mut b = VMContextBuilder::new();
    let contract: AccountId = "contract.near".parse().unwrap();

    b.current_account_id(contract.clone())
        .predecessor_account_id(contract)
        .account_balance(NearToken::from_near(100));

    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result],
    );
}

fn earned_credit() -> Nomogenesis {
    let mut c = Nomogenesis::default();
    let (root, siblings) = super::tests::fixture();

    actor(0, 100);
    let task = c.test_create_task(accounts(1), root, 2, 2, 200, 300);

    let reserve = reserve_cost();

    let mut b = VMContextBuilder::new();
    b.current_account_id("contract.near".parse().unwrap())
        .predecessor_account_id(accounts(0))
        .block_timestamp(101)
        .account_balance(NearToken::from_near(100))
        .attached_deposit(NearToken::from_yoctonear(35 + reserve));
    testing_env!(b.build());

    c.fund_task(task, U128(20), U128(10), U128(3), U128(2));

    actor(1, 105);
    c.accept_primary(task);

    actor(2, 110);
    let offer = c.test_post_offer(task, "withdraw_slot".into(), 180);

    let mut b = VMContextBuilder::new();
    b.current_account_id("contract.near".parse().unwrap())
        .predecessor_account_id(accounts(2))
        .block_timestamp(115)
        .account_balance(NearToken::from_near(100))
        .attached_deposit(NearToken::from_yoctonear(13 + reserve));
    testing_env!(b.build());

    c.fund_offer(offer, U128(13));

    actor(0, 120);
    c.select_offer(task, offer);

    actor(1, 150);
    c.submit_primary_proof(task, b"charlie".to_vec(), siblings);

    assert_eq!(c.get_claimable(accounts(0)), U128(12));
    assert_eq!(c.get_claimable(accounts(1)), U128(20));
    assert_eq!(c.get_claimable(accounts(2)), U128(16));

    c
}

#[test]
fn withdrawal_creates_pending_liability_once() {
    let mut c = earned_credit();

    actor(0, 160);
    c.withdraw(U128(5));

    assert_eq!(c.get_claimable(accounts(0)), U128(7));
    assert_eq!(c.payout_totals(), (U128(43), U128(5)));
    assert_eq!(c.get_pending_withdrawal(0), Some((accounts(0), U128(5))));
    assert_eq!(c.get_claimable(accounts(1)), U128(20));
}

#[test]
fn successful_callback_consumes_pending_without_restoration() {
    let mut c = earned_credit();

    actor(0, 160);
    c.withdraw(U128(5));

    callback_env(PromiseResult::Successful(vec![]));
    c.on_withdraw_complete(0);

    assert_eq!(c.payout_totals(), (U128(43), U128(0)));
    assert_eq!(c.get_claimable(accounts(0)), U128(7));
    assert!(c.get_pending_withdrawal(0).is_none());

    // A repeated callback has no economic effect.
    c.on_withdraw_complete(0);
    assert_eq!(c.payout_totals(), (U128(43), U128(0)));
}

#[test]
fn failed_callback_restores_exactly_once() {
    let mut c = earned_credit();

    actor(0, 160);
    c.withdraw(U128(5));

    callback_env(PromiseResult::Failed);
    c.on_withdraw_complete(0);

    assert_eq!(c.get_claimable(accounts(0)), U128(12));
    assert_eq!(c.payout_totals(), (U128(48), U128(0)));
    assert!(c.get_pending_withdrawal(0).is_none());

    c.on_withdraw_complete(0);
    assert_eq!(c.get_claimable(accounts(0)), U128(12));
    assert_eq!(c.claimable_total(), U128(48));
}

#[test]
fn cannot_withdraw_other_accounts_entitlement() {
    let mut c = earned_credit();

    actor(4, 160);

    assert!(
        catch_unwind(AssertUnwindSafe(|| {
            c.withdraw(U128(1));
        }))
        .is_err()
    );

    assert_eq!(c.payout_totals(), (U128(48), U128(0)));
}

#[test]
fn zero_or_excessive_withdrawal_is_rejected() {
    let mut c = earned_credit();

    actor(0, 160);

    for amount in [0, 13, u128::MAX] {
        assert!(
            catch_unwind(AssertUnwindSafe(|| {
                c.withdraw(U128(amount));
            }))
            .is_err()
        );
    }

    assert_eq!(c.payout_totals(), (U128(48), U128(0)));
}

#[test]
fn multiple_pending_payouts_are_isolated() {
    let mut c = earned_credit();

    actor(0, 160);
    c.withdraw(U128(5));
    c.withdraw(U128(6));

    assert_eq!(c.get_claimable(accounts(0)), U128(1));
    assert_eq!(c.payout_totals(), (U128(37), U128(11)));

    callback_env(PromiseResult::Failed);
    c.on_withdraw_complete(1);

    assert_eq!(c.get_claimable(accounts(0)), U128(7));
    assert_eq!(c.payout_totals(), (U128(43), U128(5)));

    callback_env(PromiseResult::Successful(vec![]));
    c.on_withdraw_complete(0);

    assert_eq!(c.get_claimable(accounts(0)), U128(7));
    assert_eq!(c.payout_totals(), (U128(43), U128(0)));
}

#[test]
fn unauthorized_callback_cannot_change_pending() {
    let mut c = earned_credit();

    actor(0, 160);
    c.withdraw(U128(5));

    actor(4, 161);

    assert!(
        catch_unwind(AssertUnwindSafe(|| {
            c.on_withdraw_complete(0);
        }))
        .is_err()
    );

    assert_eq!(c.payout_totals(), (U128(43), U128(5)));
    assert!(c.get_pending_withdrawal(0).is_some());
}

#[test]
fn insufficient_native_backing_rejects_withdrawal() {
    let mut c = earned_credit();

    let mut b = VMContextBuilder::new();
    b.current_account_id("contract.near".parse().unwrap())
        .predecessor_account_id(accounts(0))
        .block_timestamp(160)
        .account_balance(NearToken::from_yoctonear(1));

    testing_env!(b.build());

    assert!(
        catch_unwind(AssertUnwindSafe(|| {
            c.withdraw(U128(5));
        }))
        .is_err()
    );

    assert_eq!(c.payout_totals(), (U128(48), U128(0)));
    assert!(c.get_pending_withdrawal(0).is_none());
}

#[test]
fn active_rescue_liability_is_protected_from_withdrawal() {
    let mut c = earned_credit();
    let protected = NearToken::from_near(101).as_yoctonear();
    c.rescue_escrow = protected;

    actor(0, 160);

    assert!(
        catch_unwind(AssertUnwindSafe(|| {
            c.withdraw(U128(5));
        }))
        .is_err()
    );

    assert_eq!(c.rescue_escrow_total(), U128(protected));
    assert_eq!(c.get_claimable(accounts(0)), U128(12));
    assert_eq!(c.payout_totals(), (U128(48), U128(0)));
    assert!(c.get_pending_withdrawal(0).is_none());
}
