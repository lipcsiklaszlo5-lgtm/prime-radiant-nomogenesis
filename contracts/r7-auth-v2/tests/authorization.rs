use near_sdk::{AccountId, NearToken, json_types::U128, test_utils::VMContextBuilder, testing_env};
use nomogenesis_auth_v2::{AuthV2, ConsentInput};
use std::panic::{AssertUnwindSafe, catch_unwind};

const CONTRACT: &str = "nomogenesis-v2.testnet";
const CASE: [u8; 32] = [7; 32];

fn account(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn context(actor: &str, now: u64, deposit: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(account(CONTRACT))
        .signer_account_id(account(actor))
        .predecessor_account_id(account(actor))
        .block_timestamp(now)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100));
    testing_env!(b.build());
}

fn contract() -> AuthV2 {
    context("operator.testnet", 5, 0);
    AuthV2::new(CASE.to_vec(), 10, 30)
}

fn consent(buyer: &str, job_id: u64, nonce: u64) -> ConsentInput {
    ConsentInput {
        case_id: CASE.to_vec(),
        contract: account(CONTRACT),
        domain: "NOMOGENESIS/R7-06E/SUBSET/V1".into(),
        job_id,
        buyer: account(buyer),
        nonce,
        plan_hash: vec![9; 32],
        max_payment: U128(7),
        exact_payment: U128(6),
        expires_at: 30,
    }
}

fn register(c: &mut AuthV2, buyer: &str, job_id: u64, nonce: u64) {
    let bond = c.quote_consent_storage().0;
    context(buyer, 20, bond);
    c.register_consent(consent(buyer, job_id, nonce));
}

fn rejected(f: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(f)).is_err());
}

#[test]
fn two_distinct_near_callers_register() {
    let mut c = contract();
    let bond = c.quote_consent_storage().0;

    register(&mut c, "buyer1.testnet", 1, 101);
    register(&mut c, "buyer2.testnet", 2, 102);

    assert_eq!(c.active_consent_count(), 2);
    assert_eq!(c.retained_storage_bonds().0, bond * 2);

    let a = c.get_consent(1).unwrap();
    assert_eq!(a.buyer, account("buyer1.testnet"));
    assert_eq!(a.exact_payment.0, 6);

    assert!(c.is_nonce_used(account("buyer1.testnet"), 101));
}

#[test]
fn forged_buyer_is_rejected_without_consuming_nonce() {
    let mut c = contract();
    let bond = c.quote_consent_storage().0;
    context("attacker.testnet", 20, bond);

    rejected(|| c.register_consent(consent("buyer1.testnet", 1, 101)));

    assert_eq!(c.active_consent_count(), 0);
    assert!(!c.is_nonce_used(account("buyer1.testnet"), 101));
}

#[test]
fn revoke_preserves_nonce_and_reserve() {
    let mut c = contract();
    register(&mut c, "buyer1.testnet", 1, 101);

    let retained = c.retained_storage_bonds().0;
    context("buyer1.testnet", 21, 0);
    c.revoke_consent(1);

    assert_eq!(c.active_consent_count(), 0);
    assert!(c.get_consent(1).is_none());
    assert_eq!(c.retained_storage_bonds().0, retained);

    let bond = c.quote_consent_storage().0;
    context("buyer1.testnet", 22, bond);
    rejected(|| c.register_consent(consent("buyer1.testnet", 1, 101)));

    register(&mut c, "buyer1.testnet", 1, 103);
    assert_eq!(c.active_consent_count(), 1);
}

#[test]
fn unauthorized_revocation_is_rejected() {
    let mut c = contract();
    register(&mut c, "buyer1.testnet", 1, 101);

    context("attacker.testnet", 21, 0);
    rejected(|| c.revoke_consent(1));

    assert!(c.get_consent(1).is_some());
}

#[test]
fn duplicate_job_and_duplicate_buyer_fail() {
    let mut c = contract();
    register(&mut c, "buyer1.testnet", 1, 101);

    let bond = c.quote_consent_storage().0;

    context("buyer2.testnet", 21, bond);
    rejected(|| c.register_consent(consent("buyer2.testnet", 1, 102)));

    context("buyer1.testnet", 21, bond);
    rejected(|| c.register_consent(consent("buyer1.testnet", 2, 103)));

    assert_eq!(c.active_consent_count(), 1);
}

#[test]
fn domain_and_payment_tampering_fail() {
    let mut c = contract();
    let bond = c.quote_consent_storage().0;
    context("buyer1.testnet", 20, bond);

    let mut bad = consent("buyer1.testnet", 1, 101);
    bad.contract = account("attacker.testnet");
    rejected(|| c.register_consent(bad));

    let mut bad = consent("buyer1.testnet", 1, 101);
    bad.exact_payment = U128(8);
    rejected(|| c.register_consent(bad));

    let mut bad = consent("buyer1.testnet", 1, 101);
    bad.plan_hash = vec![0; 32];
    rejected(|| c.register_consent(bad));

    assert_eq!(c.active_consent_count(), 0);
}

#[test]
fn deadline_and_storage_underpayment_fail() {
    let mut c = contract();
    let bond = c.quote_consent_storage().0;

    context("buyer1.testnet", 30, bond);
    rejected(|| c.register_consent(consent("buyer1.testnet", 1, 101)));

    context("buyer1.testnet", 20, bond - 1);
    rejected(|| c.register_consent(consent("buyer1.testnet", 1, 101)));

    assert_eq!(c.active_consent_count(), 0);
    assert_eq!(c.retained_storage_bonds().0, 0);
}

#[test]
fn six_consent_limit_is_enforced() {
    let mut c = contract();

    for id in 1..=6 {
        register(&mut c, &format!("buyer{id}.testnet"), id, 100 + id);
    }

    let bond = c.quote_consent_storage().0;
    context("buyer7.testnet", 20, bond);

    rejected(|| c.register_consent(consent("buyer7.testnet", 7, 107)));

    assert_eq!(c.active_consent_count(), 6);
}
