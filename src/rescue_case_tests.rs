use super::*;
use crate::rescue::{
    CASE_STORAGE_BYTES, JOB_STORAGE_BYTES, RescueCaseDescriptorInput, RescueCasePhase,
};

use near_sdk::{
    NearToken,
    test_utils::{VMContextBuilder, accounts},
    testing_env,
};

use std::panic::{AssertUnwindSafe, catch_unwind};

fn context(actor: usize, now: u64, deposit: u128) {
    let mut builder = VMContextBuilder::new();
    let current: AccountId = "contract.near".parse().unwrap();

    builder
        .current_account_id(current)
        .signer_account_id(accounts(actor))
        .predecessor_account_id(accounts(actor))
        .block_timestamp(now)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100));

    testing_env!(builder.build());
}

fn rejected(call: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(call)).is_err());
}

fn commitments() -> Vec<Vec<u8>> {
    vec![vec![1; 32], vec![2; 32]]
}
fn descriptor(
    descriptor_version: u16,
    original_provider: AccountId,
    component_commitments: Vec<Vec<u8>>,
    dependency_deadline: u64,
    bid_close: u64,
    award_close: u64,
    recovery_deadline: u64,
) -> RescueCaseDescriptorInput {
    RescueCaseDescriptorInput {
        descriptor_version,
        original_provider,
        component_commitments,
        dependency_deadline,
        bid_close,
        award_close,
        recovery_deadline,
    }
}

#[test]
fn storage_quote_is_derived_from_bounded_records() {
    context(0, 100, 0);
    let c = Nomogenesis::default();
    let quote = c.m3_storage_quote();

    assert_eq!(quote.quote_version, 2);
    assert_eq!(quote.case_storage_bytes, 1233);
    assert_eq!(quote.offer_storage_bytes, 613);
    assert_eq!(
        quote.offer_storage_cost.0,
        env::storage_byte_cost().as_yoctonear() * 613
    );
    assert_eq!(quote.job_storage_bytes, 576);
    assert_eq!(quote.case_storage_bytes, CASE_STORAGE_BYTES);
    assert_eq!(quote.job_storage_bytes, JOB_STORAGE_BYTES);

    assert_eq!(
        quote.case_storage_cost.0,
        env::storage_byte_cost()
            .as_yoctonear()
            .checked_mul(u128::from(CASE_STORAGE_BYTES))
            .unwrap()
    );
}

#[test]
fn case_creation_requires_exact_storage_and_is_canonical() {
    let mut c = Nomogenesis::default();

    context(0, 100, 0);
    let quote = c.m3_storage_quote().case_storage_cost.0;

    for deposit in [0, quote - 1, quote + 1] {
        context(0, 100, deposit);
        rejected(|| {
            c.create_rescue_case(descriptor(
                1,
                accounts(1),
                commitments(),
                200,
                220,
                240,
                260,
            ));
        });
    }

    assert_eq!(c.storage_reserves, 0);

    context(0, 100, quote);
    let before = env::storage_usage();
    let case_id = c.create_rescue_case(descriptor(
        1,
        accounts(1),
        commitments(),
        200,
        220,
        240,
        260,
    ));

    c.rescue_cases.flush();
    let measured = env::storage_usage() - before;

    println!(
        "M3_CASE_STORAGE measured={} quoted={}",
        measured, CASE_STORAGE_BYTES
    );

    assert!(measured > 0);
    assert!(measured <= CASE_STORAGE_BYTES);
    assert_eq!(c.storage_reserves, quote);
    assert!(c.has_rescue_case(case_id.clone()));

    let view = c.get_rescue_case(case_id.clone()).unwrap();
    assert_eq!(view.id, case_id);
    assert_eq!(view.original_provider, accounts(1));
    assert_eq!(view.phase, RescueCasePhase::Open);
    assert!(view.job_ids.is_empty());
    assert!(view.offer_ids.is_empty());
    assert_eq!(view.resolved_payloads, vec![None, None]);

    let case_before_replay = c.get_rescue_case(case_id.clone()).unwrap();

    context(0, 100, quote);
    rejected(|| {
        c.create_rescue_case(descriptor(
            1,
            accounts(1),
            commitments(),
            200,
            220,
            240,
            260,
        ));
    });

    let case_after_replay = c.get_rescue_case(case_id).unwrap();
    assert_eq!(case_after_replay, case_before_replay);
    assert_eq!(c.storage_reserves, quote);
}

#[test]
fn invalid_descriptor_creates_no_case_or_storage_liability() {
    let mut c = Nomogenesis::default();

    context(0, 100, 0);
    let quote = c.m3_storage_quote().case_storage_cost.0;

    context(0, 100, quote);
    rejected(|| {
        c.create_rescue_case(descriptor(
            0,
            accounts(1),
            commitments(),
            200,
            220,
            240,
            260,
        ));
    });

    rejected(|| {
        c.create_rescue_case(descriptor(
            1,
            accounts(1),
            vec![vec![1; 32]],
            200,
            220,
            240,
            260,
        ));
    });

    rejected(|| {
        c.create_rescue_case(descriptor(
            1,
            accounts(1),
            vec![vec![1; 32], vec![1; 32]],
            200,
            220,
            240,
            260,
        ));
    });

    rejected(|| {
        c.create_rescue_case(descriptor(
            1,
            accounts(1),
            commitments(),
            200,
            200,
            240,
            260,
        ));
    });

    assert_eq!(c.storage_reserves, 0);
    assert_eq!(c.next_rescue_job_id(), 0);
}

#[test]
fn case_and_quote_survive_state_reload() {
    let mut c = Nomogenesis::default();

    context(0, 100, 0);
    let quote = c.m3_storage_quote().case_storage_cost.0;

    context(0, 100, quote);
    let case_id = c.create_rescue_case(descriptor(
        1,
        accounts(1),
        commitments(),
        200,
        220,
        240,
        260,
    ));

    c.rescue_cases.flush();
    env::state_write(&c);
    drop(c);

    let reloaded: Nomogenesis = env::state_read().expect("state missing");

    assert!(reloaded.has_rescue_case(case_id.clone()));
    assert_eq!(
        reloaded.get_rescue_case(case_id).unwrap().phase,
        RescueCasePhase::Open
    );
    assert_eq!(reloaded.storage_reserves, quote);
    assert_eq!(reloaded.m3_storage_quote().case_storage_cost, U128(quote));
}
