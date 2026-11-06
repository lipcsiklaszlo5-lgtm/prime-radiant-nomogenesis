// No deployed contract changes.
// Include the existing M3 pure reference allocator.

#[path = "../src/rescue_market_model.rs"]
mod rescue_market_model;

#[path = "../src/r7_06e_subset_model.rs"]
mod subset;

use std::collections::BTreeSet;

use subset::{
    Approval, DOMAIN, FundedJob, Provider, Snapshot, preflight,
};

fn reference() -> Snapshot {
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
        selected_jobs: vec![1, 2],
        approvals: vec![
            approval(1, 6, 1),
            approval(2, 5, 2),
        ],
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

fn approval(id: u64, amount: u128, nonce: u64) -> Approval {
    Approval {
        domain: DOMAIN.into(),
        case_id: [7; 32],
        chain: "near-testnet".into(),
        contract: "future-versioned-contract.testnet".into(),
        job_id: id,
        buyer: format!("buyer-{id}"),
        nonce,
        expires_at: 30,
        max_payment: 7,
        exact_payment: amount,
    }
}

#[test]
fn selected_subset_conserves_every_modelled_unit() {
    let result = preflight(&reference()).unwrap();

    assert_eq!(result.price, 11);
    assert_eq!(
        result.allocations.iter().map(|x| x.amount)
            .collect::<Vec<_>>(),
        vec![6, 5]
    );

    assert_eq!(result.excluded_jobs, vec![3]);
    assert_eq!(result.total_refund, 13);
    assert_eq!(result.locked_recovery_principal, 33);
    assert_eq!(result.modelled_liabilities_before, 46);
    assert_eq!(result.escrow_after_refunds, 87);
    assert_eq!(result.claimables_after_refunds, 23);

    assert!(result.contract_extension_required);
    assert!(!result.real_signature_verification_performed);
    assert!(!result.executable_on_deployed_m3);
}

#[test]
fn selected_sponsors_receive_correct_refunds() {
    let r = preflight(&reference()).unwrap();

    let refunds = r.buyer_refunds.iter()
        .map(|x| (x.job_id, x.amount))
        .collect::<Vec<_>>();

    assert_eq!(refunds, vec![(1, 1), (2, 2), (3, 7)]);

    let provider_excess = r.provider_refunds.iter()
        .map(|x| (x.offer_id, x.amount))
        .collect::<Vec<_>>();

    assert_eq!(provider_excess, vec![(3, 2), (2, 1)]);
}

#[test]
fn existing_three_sponsor_reference_remains_supported() {
    let mut s = reference();

    s.selected_jobs = vec![1, 2, 3];
    s.approvals = vec![
        approval(1, 4, 1),
        approval(2, 4, 2),
        approval(3, 3, 3),
    ];

    let r = preflight(&s).unwrap();

    assert!(r.excluded_jobs.is_empty());
    assert_eq!(
        r.allocations.iter().map(|x| x.amount)
            .collect::<Vec<_>>(),
        vec![4, 4, 3]
    );
}

#[test]
fn arbitrary_job_order_does_not_change_result() {
    let mut s = reference();
    let expected = preflight(&s).unwrap();

    s.jobs.reverse();
    s.approvals.reverse();

    assert_eq!(preflight(&s).unwrap(), expected);
}

#[test]
fn approval_must_match_exact_payment() {
    let mut s = reference();
    s.approvals[0].exact_payment = 5;

    assert!(preflight(&s).is_err());
}

#[test]
fn spending_limit_must_be_enforced() {
    let mut s = reference();
    s.approvals[0].max_payment = 5;

    assert!(preflight(&s).is_err());

    s.approvals[0].max_payment = 8;
    assert!(preflight(&s).is_err());
}

#[test]
fn approval_scope_must_match_case_chain_contract() {
    for dimension in 0..4 {
        let mut s = reference();

        match dimension {
            0 => s.approvals[0].case_id = [8; 32],
            1 => s.approvals[0].chain = "near-mainnet".into(),
            2 => s.approvals[0].contract = "attacker".into(),
            _ => s.approvals[0].domain = "UNRELATED".into(),
        }

        assert!(preflight(&s).is_err());
    }
}

#[test]
fn no_other_buyer_may_issue_approval() {
    let mut s = reference();
    s.approvals[0].buyer = "buyer-3".into();

    assert!(preflight(&s).is_err());
}

#[test]
fn expiry_and_award_window_are_checked() {
    let mut s = reference();
    s.approvals[0].expires_at = 20;
    assert!(preflight(&s).is_err());

    s = reference();
    s.now = 30;
    assert!(preflight(&s).is_err());

    s = reference();
    s.now = 9;
    assert!(preflight(&s).is_err());
}

#[test]
fn consumed_and_repeated_nonces_are_rejected() {
    let mut s = reference();

    s.consumed_nonces.insert(("buyer-1".into(), 1));
    assert!(preflight(&s).is_err());

    s = reference();
    s.approvals[1].buyer = "buyer-1".into();
    s.approvals[1].nonce = 1;

    assert!(preflight(&s).is_err());
}

#[test]
fn duplicate_and_missing_sponsors_fail_closed() {
    let mut s = reference();
    s.jobs[2].id = 1;
    assert!(preflight(&s).is_err());

    s = reference();
    s.selected_jobs = vec![1, 1];
    assert!(preflight(&s).is_err());

    s = reference();
    s.selected_jobs = vec![1, 4];
    assert!(preflight(&s).is_err());
}

#[test]
fn missing_or_extraneous_approval_rejected() {
    let mut s = reference();
    s.approvals.pop();
    assert!(preflight(&s).is_err());

    s = reference();
    s.approvals.push(approval(3, 0, 3));
    assert!(preflight(&s).is_err());
}

#[test]
fn locked_or_unaccepted_job_is_not_authorized() {
    let mut s = reference();
    s.jobs[0].accepted = false;
    assert!(preflight(&s).is_err());

    s = reference();
    s.jobs[0].mandate_open = false;
    assert!(preflight(&s).is_err());
}

#[test]
fn underbonded_or_unavailable_providers_fail() {
    let mut s = reference();
    s.providers[0].held_bond = 10;
    assert!(preflight(&s).is_err());

    s = reference();
    s.providers[1].slot_free = false;
    assert!(preflight(&s).is_err());

    s = reference();
    s.providers[0].open = false;
    assert!(preflight(&s).is_err());
}

#[test]
fn provider_reuse_and_wrong_components_fail() {
    let mut s = reference();
    s.providers[1].account = "gamma".into();
    assert!(preflight(&s).is_err());

    s = reference();
    s.providers[1].component = 0;
    assert!(preflight(&s).is_err());
}

#[test]
fn insufficient_capital_and_overflow_fail() {
    let mut s = reference();
    s.escrow_total = 45;
    assert!(preflight(&s).is_err());

    s = reference();
    s.claimable_total = u128::MAX;
    assert!(preflight(&s).is_err());

    s = reference();
    s.providers[0].fee = u128::MAX;
    assert!(preflight(&s).is_err());

    s = reference();
    s.jobs[0].held_cap = u128::MAX;
    assert!(preflight(&s).is_err());
}

#[test]
fn replayed_approval_cannot_be_used_twice() {
    let mut s = reference();
    let first = preflight(&s).unwrap();

    assert!(!first.executable_on_deployed_m3);

    s.consumed_nonces.insert(("buyer-1".into(), 1));
    s.consumed_nonces.insert(("buyer-2".into(), 2));

    assert!(preflight(&s).is_err());
}

#[test]
fn empty_and_seventh_sponsor_rejected() {
    let mut s = reference();
    s.selected_jobs.clear();
    s.approvals.clear();
    assert!(preflight(&s).is_err());

    s = reference();
    for id in 4..=7 {
        s.jobs.push(FundedJob {
            id,
            buyer: format!("buyer-{id}"),
            held_cap: 7,
            accepted: true,
            mandate_open: true,
        });
    }

    assert!(preflight(&s).is_err());
}
