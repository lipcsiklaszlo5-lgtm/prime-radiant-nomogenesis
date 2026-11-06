#![cfg(feature = "r7-v2")]

use near_sdk::{AccountId, NearToken, json_types::U128, test_utils::VMContextBuilder, testing_env};
use prime_radiant_nomogenesis::{
    Nomogenesis,
    r7_v2_consent::{ConsentInput, DOMAIN},
    rescue::{FundedRescueJobInput, RescueCaseDescriptorInput, RescueResultProfile},
};
use std::panic::{AssertUnwindSafe, catch_unwind};

fn account(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn context(actor: &str, now: u64, deposit: u128) {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(account("contract.near"))
        .signer_account_id(account(actor))
        .predecessor_account_id(account(actor))
        .block_timestamp(now)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100));
    testing_env!(builder.build());
}

fn reject(call: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(call)).is_err());
}

fn market(accept: bool) -> (Nomogenesis, Vec<u8>) {
    let mut c = Nomogenesis::default();

    context("creator.near", 100, 0);
    let case_bond = c.m3_storage_quote().case_storage_cost.0;

    context("creator.near", 100, case_bond);
    let case_id = c.create_rescue_case(RescueCaseDescriptorInput {
        descriptor_version: 1,
        original_provider: account("source.near"),
        component_commitments: vec![vec![1; 32], vec![2; 32]],
        dependency_deadline: 200,
        bid_close: 220,
        award_close: 240,
        recovery_deadline: 260,
    });

    context("alice.near", 110, 0);
    let job_bond = c.m3_storage_quote().job_storage_cost.0;

    context("alice.near", 110, 6 + job_bond);
    let id = c.create_funded_rescue_job(FundedRescueJobInput {
        case_id: case_id.clone(),
        worker: account("worker.near"),
        worker_reward: U128(1),
        rescue_cap: U128(5),
        result_profile: RescueResultProfile::ExactCommitment,
        result_commitment: vec![9; 32],
        threshold: None,
        final_deadline: 300,
    });

    assert_eq!(id, 0);

    if accept {
        context("worker.near", 115, 0);
        c.accept_rescue_job(0);
    }

    (c, case_id)
}

fn input(case_id: &[u8], buyer: &str, nonce: u64) -> ConsentInput {
    ConsentInput {
        case_id: case_id.to_vec(),
        contract: account("contract.near"),
        domain: DOMAIN.to_string(),
        job_id: 0,
        buyer: account(buyer),
        nonce,
        plan_hash: vec![7; 32],
        max_payment: U128(5),
        exact_payment: U128(4),
        expires_at: 235,
    }
}

#[test]
fn actual_funded_buyer_registers_and_preserves_escrow() {
    let (mut c, case_id) = market(true);

    context("alice.near", 225, 0);
    let bond = c.quote_r7_v2_consent_storage().0;
    let storage_before = c.m3_totals().storage_reserves.0;
    let escrow_before = c.rescue_escrow_total();

    context("alice.near", 225, bond);
    c.register_r7_v2_consent(input(&case_id, "alice.near", 101));

    let stored = c.get_r7_v2_consent(0).unwrap();
    assert_eq!(stored.buyer, account("alice.near"));
    assert_eq!(stored.exact_payment, U128(4));
    assert_eq!(stored.max_payment, U128(5));
    assert_eq!(stored.case_id, case_id);
    assert!(c.is_r7_v2_nonce_used(account("alice.near"), 101));

    assert_eq!(c.rescue_escrow_total(), escrow_before);
    assert_eq!(c.m3_totals().storage_reserves.0, storage_before + bond);
}

#[test]
fn nonowner_and_nonexistent_job_cannot_register() {
    let (mut c, case_id) = market(true);
    context("alice.near", 225, 0);
    let bond = c.quote_r7_v2_consent_storage().0;
    let before = c.m3_totals();

    context("outsider.near", 225, bond);
    reject(|| {
        c.register_r7_v2_consent(input(&case_id, "alice.near", 101));
    });

    context("alice.near", 225, bond);
    let mut forged = input(&case_id, "alice.near", 101);
    forged.job_id = 77;
    reject(|| c.register_r7_v2_consent(forged));

    assert!(c.get_r7_v2_consent(0).is_none());
    assert!(!c.is_r7_v2_nonce_used(account("alice.near"), 101));
    assert_eq!(c.m3_totals().storage_reserves, before.storage_reserves);
}

#[test]
fn unaccepted_or_revoked_mandate_is_not_authorizable() {
    let (mut c, case_id) = market(false);
    context("alice.near", 225, 0);
    let bond = c.quote_r7_v2_consent_storage().0;

    context("alice.near", 225, bond);
    reject(|| {
        c.register_r7_v2_consent(input(&case_id, "alice.near", 101));
    });

    let (mut c, case_id) = market(true);

    context("alice.near", 225, 0);
    c.revoke_open_rescue_mandate(0);

    context("alice.near", 225, bond);
    reject(|| {
        c.register_r7_v2_consent(input(&case_id, "alice.near", 101));
    });

    assert!(c.get_r7_v2_consent(0).is_none());
}

#[test]
fn payment_expiry_domain_and_storage_are_enforced() {
    let (mut c, case_id) = market(true);
    context("alice.near", 225, 0);
    let bond = c.quote_r7_v2_consent_storage().0;

    let mut too_large = input(&case_id, "alice.near", 101);
    too_large.max_payment = U128(6);

    context("alice.near", 225, bond);
    reject(|| c.register_r7_v2_consent(too_large));

    let mut expired = input(&case_id, "alice.near", 101);
    expired.expires_at = 225;
    reject(|| c.register_r7_v2_consent(expired));

    let mut wrong_domain = input(&case_id, "alice.near", 101);
    wrong_domain.domain = "wrong".into();
    reject(|| c.register_r7_v2_consent(wrong_domain));

    context("alice.near", 225, bond - 1);
    reject(|| {
        c.register_r7_v2_consent(input(&case_id, "alice.near", 101));
    });

    assert!(c.get_r7_v2_consent(0).is_none());
    assert!(!c.is_r7_v2_nonce_used(account("alice.near"), 101));
}

#[test]
fn owner_revokes_but_consumed_nonce_cannot_replay() {
    let (mut c, case_id) = market(true);
    context("alice.near", 225, 0);
    let bond = c.quote_r7_v2_consent_storage().0;

    context("alice.near", 225, bond);
    c.register_r7_v2_consent(input(&case_id, "alice.near", 101));

    context("outsider.near", 226, 0);
    reject(|| c.revoke_r7_v2_consent(0));
    assert!(c.get_r7_v2_consent(0).is_some());

    context("alice.near", 226, 0);
    c.revoke_r7_v2_consent(0);

    assert!(c.get_r7_v2_consent(0).is_none());
    assert!(c.is_r7_v2_nonce_used(account("alice.near"), 101));

    context("alice.near", 227, bond);
    reject(|| {
        c.register_r7_v2_consent(input(&case_id, "alice.near", 101));
    });

    c.register_r7_v2_consent(input(&case_id, "alice.near", 102));

    assert!(c.get_r7_v2_consent(0).is_some());
    assert!(c.is_r7_v2_nonce_used(account("alice.near"), 102));
}
