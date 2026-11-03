use super::*;
use near_sdk::NearToken;
use near_sdk::test_utils::{VMContextBuilder, accounts};
use near_sdk::testing_env;
use std::panic::{AssertUnwindSafe, catch_unwind};

fn context(actor: usize, timestamp: u64, attached: u128) {
    let mut builder = VMContextBuilder::new();
    builder
        .predecessor_account_id(accounts(actor))
        .block_timestamp(timestamp)
        .attached_deposit(NearToken::from_yoctonear(attached));

    testing_env!(builder.build());
}

fn task(c: &mut Nomogenesis) -> u64 {
    context(0, 100, 0);
    c.create_task(accounts(1), vec![7; 32], 2, 2, 200, 400)
}

fn fund(c: &mut Nomogenesis, id: u64) {
    context(0, 110, 35 + reserve_cost());
    c.fund_task(id, U128(20), U128(10), U128(3), U128(2));
}

fn rejected(f: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(f)).is_err());
}

#[test]
fn authenticated_buyer_funding_is_accounted_once() {
    let mut c = Nomogenesis::default();
    let id = task(&mut c);
    fund(&mut c, id);

    assert!(c.is_task_funded(id));
    assert_eq!(c.escrow_totals(), (U128(35), U128(0), U128(reserve_cost())));

    context(0, 111, 35 + reserve_cost());
    rejected(|| {
        c.fund_task(id, U128(20), U128(10), U128(3), U128(2));
    });

    assert_eq!(c.economic_escrow, 35);
}

#[test]
fn wrong_buyer_or_deposit_cannot_create_credit() {
    let mut c = Nomogenesis::default();
    let id = task(&mut c);

    context(3, 110, 35 + reserve_cost());
    rejected(|| {
        c.fund_task(id, U128(20), U128(10), U128(3), U128(2));
    });

    context(0, 111, 34 + reserve_cost());
    rejected(|| {
        c.fund_task(id, U128(20), U128(10), U128(3), U128(2));
    });

    context(0, 112, 36 + reserve_cost());
    rejected(|| {
        c.fund_task(id, U128(20), U128(10), U128(3), U128(2));
    });

    assert!(!c.is_task_funded(id));
    assert_eq!(c.escrow_totals(), (U128(0), U128(0), U128(0)));
}

#[test]
fn funded_task_requires_collateralized_offer() {
    let mut c = Nomogenesis::default();
    let id = task(&mut c);
    fund(&mut c, id);

    context(1, 115, 0);
    c.accept_primary(id);

    context(2, 120, 0);
    let offer = c.post_offer(id, "funded_slot".into(), 180);

    context(0, 125, 0);
    rejected(|| c.select_offer(id, offer));

    assert_eq!(c.get_task(id).unwrap().phase, TaskPhase::SeekingReserve);

    context(2, 130, 12 + reserve_cost());
    rejected(|| c.fund_offer(offer, U128(12)));

    context(3, 131, 13 + reserve_cost());
    rejected(|| c.fund_offer(offer, U128(13)));

    assert!(!c.is_offer_collateralized(offer));

    context(2, 132, 13 + reserve_cost());
    c.fund_offer(offer, U128(13));

    assert_eq!(
        c.escrow_totals(),
        (U128(35), U128(13), U128(2 * reserve_cost()))
    );

    context(0, 135, 0);
    c.select_offer(id, offer);

    assert_eq!(c.get_task(id).unwrap().phase, TaskPhase::OfferSelected);
}

#[test]
fn collateral_replay_is_rejected() {
    let mut c = Nomogenesis::default();
    let id = task(&mut c);
    fund(&mut c, id);

    context(1, 115, 0);
    c.accept_primary(id);

    context(2, 120, 0);
    let offer = c.post_offer(id, "slot".into(), 180);

    context(2, 130, 13 + reserve_cost());
    c.fund_offer(offer, U128(13));

    rejected(|| c.fund_offer(offer, U128(13)));

    assert_eq!(c.collateral_escrow, 13);
}

#[test]
fn invalid_or_overflowing_budget_is_rejected() {
    let mut c = Nomogenesis::default();
    let id = task(&mut c);

    context(0, 110, 0);
    rejected(|| {
        c.fund_task(id, U128(0), U128(10), U128(3), U128(2));
    });

    rejected(|| {
        c.fund_task(id, U128(u128::MAX), U128(10), U128(3), U128(2));
    });

    assert!(!c.is_task_funded(id));
    assert_eq!(c.economic_escrow, 0);
}

#[test]
fn funding_survives_state_reload() {
    let mut c = Nomogenesis::default();
    let id = task(&mut c);
    fund(&mut c, id);

    env::state_write(&c);
    drop(c);

    let reloaded: Nomogenesis = env::state_read().expect("missing state");

    assert!(reloaded.is_task_funded(id));
    assert_eq!(reloaded.economic_escrow, 35);
    assert_eq!(reloaded.task_deposits.get(&id).unwrap().primary_reward, 20);
}
