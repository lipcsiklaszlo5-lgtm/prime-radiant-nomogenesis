use super::*;

use near_sdk::{
    NearToken,
    test_utils::{VMContextBuilder, accounts},
    testing_env,
};

fn actor(id: usize, now: u64, deposit: u128) {
    let mut builder = VMContextBuilder::new();

    builder
        .predecessor_account_id(accounts(id))
        .block_timestamp(now)
        .account_balance(NearToken::from_near(100))
        .attached_deposit(NearToken::from_yoctonear(deposit));

    testing_env!(builder.build());
}

fn obligations(c: &Nomogenesis) -> u128 {
    c.economic_escrow
        .checked_add(c.collateral_escrow)
        .unwrap()
        .checked_add(c.claimable_total)
        .unwrap()
        .checked_add(c.pending_total)
        .unwrap()
        .checked_add(c.storage_reserves)
        .unwrap()
}

#[test]
fn funded_release_credits_only_measured_net_freed_storage() {
    let mut c = Nomogenesis::default();
    let bond = reserve_cost();

    actor(0, 100, bond);
    let task = c.create_task(accounts(1), vec![7; 32], 2, 2, 200, 300);

    actor(0, 105, 35 + bond);
    c.fund_task(task, U128(20), U128(10), U128(3), U128(2));

    actor(1, 110, 0);
    c.accept_primary(task);

    let mut offers = Vec::new();

    for (time, slot) in [(120, "refund_one"), (122, "refund_two")] {
        actor(2, time, bond);
        let offer = c.post_offer(task, slot.into(), 180);

        actor(2, time + 1, 13 + bond);
        c.fund_offer(offer, U128(13));

        offers.push(offer);
    }

    assert_eq!(c.collateral_escrow, 26);

    let mut refunds = Vec::new();

    for (index, offer) in offers.iter().enumerate() {
        actor(2, 130 + index as u64, 0);

        c.offer_deposits.flush();
        c.claimables.flush();

        let before_usage = env::storage_usage();
        let before_obligations = obligations(&c);
        let before_claim = c.get_claimable(accounts(2)).0;
        let before_storage = c.storage_reserves;

        c.release_unaccepted_offer(*offer);

        let after_usage = env::storage_usage();
        let released_bytes = before_usage.saturating_sub(after_usage);

        let expected_refund = u128::from(released_bytes)
            .checked_mul(env::storage_byte_cost().as_yoctonear())
            .unwrap()
            .min(bond);

        assert_eq!(
            c.get_claimable(accounts(2)).0,
            before_claim + 13 + expected_refund
        );

        assert_eq!(c.storage_reserves + expected_refund, before_storage);

        assert_eq!(obligations(&c), before_obligations);

        assert!(c.offer_deposits.get(offer).is_none());

        assert_eq!(c.get_offer(*offer).unwrap().status, OfferStatus::Released);

        refunds.push(expected_refund);
    }

    // The first collateral credit may create a new account
    // record. The second only updates the existing one.
    assert!(refunds[1] >= refunds[0]);
    assert!(refunds[1] > 0);

    assert_eq!(c.collateral_escrow, 0);
    assert_eq!(c.get_claimable(accounts(2)).0, 26 + refunds[0] + refunds[1]);

    assert_eq!(c.storage_reserves + refunds[0] + refunds[1], 6 * bond);

    actor(2, 140, 0);

    let before_replay = obligations(&c);

    assert!(
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(
            || c.release_unaccepted_offer(offers[0])
        ))
        .is_err()
    );

    assert_eq!(obligations(&c), before_replay);
}

#[test]
fn unfunded_offer_release_does_not_refund_creation_bonds() {
    let mut c = Nomogenesis::default();
    let bond = reserve_cost();

    actor(0, 100, bond);

    let task = c.create_task(accounts(1), vec![7; 32], 2, 2, 200, 300);

    actor(1, 110, 0);
    c.accept_primary(task);

    actor(2, 120, bond);
    let offer = c.post_offer(task, "unfunded".into(), 180);

    let before = obligations(&c);

    actor(2, 130, 0);
    c.release_unaccepted_offer(offer);

    assert_eq!(obligations(&c), before);
    assert_eq!(c.storage_reserves, 2 * bond);
    assert_eq!(c.claimable_total, 0);

    assert_eq!(c.offer_storage_bond(offer), Some((accounts(2), U128(bond))));

    assert_eq!(c.task_storage_bond(task), Some((accounts(0), U128(bond))));
}
