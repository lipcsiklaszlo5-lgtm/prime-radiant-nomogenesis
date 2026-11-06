#[path = "../src/rescue_market_model.rs"]
mod rescue_market_model;

#[path = "../src/r7_06e_subset_model.rs"]
mod r7_06e_subset_model;

#[path = "../src/r7_06e_auth_state.rs"]
mod auth;

use std::collections::BTreeSet;

use auth::{AuthorizationState, Consent, Phase, plan_hash};

use r7_06e_subset_model::{
    Approval, DOMAIN, FundedJob, Provider, Snapshot,
};

fn snapshot() -> Snapshot {
    Snapshot {
        case_id: [7; 32],
        chain: "near-testnet".into(),
        contract: "future-versioned-contract.testnet".into(),
        now: 20,
        bid_close: 10,
        award_close: 30,
        escrow_total: 100,
        claimable_total: 10,
        jobs: (1..=3).map(|id| FundedJob {
            id,
            buyer: format!("buyer-{id}"),
            held_cap: 7,
            accepted: true,
            mandate_open: true,
        }).collect(),
        selected_jobs: vec![],
        approvals: vec![],
        consumed_nonces: BTreeSet::new(),
        providers: [
            Provider {
                offer_id: 3,
                component: 0,
                account: "gamma".into(),
                slot: "gamma-slot".into(),
                fee: 5,
                held_bond: 13,
                open: true,
                slot_free: true,
            },
            Provider {
                offer_id: 2,
                component: 1,
                account: "beta".into(),
                slot: "beta-slot".into(),
                fee: 6,
                held_bond: 12,
                open: true,
                slot_free: true,
            },
        ],
    }
}

fn consent(
    s: &Snapshot,
    id: u64,
    payment: u128,
    nonce: u64,
    plan: [u8; 32],
) -> Consent {
    Consent {
        plan_hash: plan,
        approval: Approval {
            domain: DOMAIN.into(),
            case_id: s.case_id,
            chain: s.chain.clone(),
            contract: s.contract.clone(),
            job_id: id,
            buyer: format!("buyer-{id}"),
            nonce,
            expires_at: 30,
            max_payment: 7,
            exact_payment: payment,
        },
    }
}

fn ready() -> (AuthorizationState, [u8; 32]) {
    let s = snapshot();
    let hash = plan_hash(&s, &[1, 2]).unwrap();
    let mut state = AuthorizationState::new(s.clone()).unwrap();

    state.authorize(
        "buyer-1", consent(&s, 1, 6, 101, hash)
    ).unwrap();

    state.authorize(
        "buyer-2", consent(&s, 2, 5, 102, hash)
    ).unwrap();

    (state, hash)
}

#[test]
fn two_authenticated_model_consents_commit_atomically() {
    let (mut state, hash) = ready();

    let result = state.award(vec![1, 2], hash).unwrap();

    assert_eq!(result.price, 11);
    assert_eq!(result.excluded_jobs, vec![3]);
    assert_eq!(result.total_refund, 13);

    assert_eq!(state.phase, Phase::Awarded);
    assert_eq!(state.snapshot.escrow_total, 87);
    assert_eq!(state.snapshot.claimable_total, 23);

    assert_eq!(
        state.snapshot.escrow_total
            + state.snapshot.claimable_total,
        110
    );
}

#[test]
fn invalid_plan_hash_keeps_every_field_unchanged() {
    let (mut state, _) = ready();
    let old = state.clone();

    assert!(state.award(vec![1, 2], [0; 32]).is_err());
    assert_eq!(state, old);
}

#[test]
fn missing_consent_cannot_lock_any_funds() {
    let (mut state, hash) = ready();
    state.revoke("buyer-2", 2).unwrap();

    let old = state.clone();

    assert!(state.award(vec![1, 2], hash).is_err());
    assert_eq!(state, old);
}

#[test]
fn wrong_identity_cannot_issue_buyer_consent() {
    let s = snapshot();
    let hash = plan_hash(&s, &[1, 2]).unwrap();
    let mut state = AuthorizationState::new(s.clone()).unwrap();

    let before = state.clone();

    assert!(state.authorize(
        "buyer-3", consent(&s, 1, 6, 101, hash)
    ).is_err());

    assert_eq!(state, before);
}

#[test]
fn consumed_nonce_is_never_reused_after_revocation() {
    let (mut state, hash) = ready();

    state.revoke("buyer-1", 1).unwrap();
    let old = state.clone();

    assert!(state.authorize(
        "buyer-1",
        consent(&state.snapshot, 1, 6, 101, hash)
    ).is_err());

    assert_eq!(state, old);
}

#[test]
fn second_award_is_rejected_without_mutation() {
    let (mut state, hash) = ready();

    state.award(vec![1, 2], hash).unwrap();

    let old = state.clone();

    assert!(state.award(vec![1, 2], hash).is_err());
    assert_eq!(state, old);
}

#[test]
fn excluded_buyer_cannot_be_added_after_consent() {
    let (mut state, hash) = ready();
    let before = state.clone();

    assert!(state.award(vec![1, 2, 3], hash).is_err());
    assert_eq!(state, before);
}

#[test]
fn provider_fee_race_invalidates_old_plan() {
    let (mut state, hash) = ready();

    state.snapshot.providers[0].fee = 4;
    let before = state.clone();

    assert!(state.award(vec![1, 2], hash).is_err());
    assert_eq!(state, before);
}

#[test]
fn buyer_funding_change_invalidates_preflight() {
    let (mut state, hash) = ready();

    state.snapshot.jobs[0].held_cap = 5;
    let old = state.clone();

    assert!(state.award(vec![1, 2], hash).is_err());
    assert_eq!(state, old);
}

#[test]
fn wrong_buyer_cannot_revoke() {
    let (mut state, _) = ready();
    let old = state.clone();

    assert!(state.revoke("buyer-3", 1).is_err());
    assert_eq!(state, old);
}

#[test]
fn deadline_race_does_not_consume_consent() {
    let (mut state, hash) = ready();

    state.snapshot.now = 30;
    let old = state.clone();

    assert!(state.award(vec![1, 2], hash).is_err());
    assert_eq!(state, old);
}

#[test]
fn payment_tampering_is_atomic_failure() {
    let (mut state, hash) = ready();

    state.consents.get_mut(&1).unwrap()
        .approval.exact_payment = 7;

    let old = state.clone();

    assert!(state.award(vec![1, 2], hash).is_err());
    assert_eq!(state, old);
}

#[test]
fn ledger_overflow_is_atomic_failure() {
    let (mut state, hash) = ready();

    state.snapshot.claimable_total = u128::MAX;
    let old = state.clone();

    assert!(state.award(vec![1, 2], hash).is_err());
    assert_eq!(state, old);
}

#[test]
fn duplicate_buyer_identity_is_rejected_at_init() {
    let mut s = snapshot();
    s.jobs[1].buyer = "buyer-1".into();

    assert!(AuthorizationState::new(s).is_err());
}

#[test]
fn plan_digest_binds_selected_jobs_contract_and_price() {
    let s = snapshot();
    let original = plan_hash(&s, &[1, 2]).unwrap();

    let mut altered = s.clone();
    altered.contract = "another-contract".into();

    assert_ne!(
        original,
        plan_hash(&altered, &[1, 2]).unwrap()
    );

    let mut altered = s.clone();
    altered.providers[0].fee += 1;

    assert_ne!(
        original,
        plan_hash(&altered, &[1, 2]).unwrap()
    );

    assert_ne!(
        original,
        plan_hash(&s, &[1, 2, 3]).unwrap()
    );
}
