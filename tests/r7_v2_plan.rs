#![cfg(feature = "r7-v2")]

use near_sdk::{AccountId, NearToken, json_types::U128, test_utils::VMContextBuilder, testing_env};
use prime_radiant_nomogenesis::{
    Nomogenesis,
    rescue::{
        FundedRescueJobInput, RescueCaseDescriptorInput, RescueOfferInput, RescueResultProfile,
    },
};
use std::panic::{AssertUnwindSafe, catch_unwind};

fn account(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn context(actor: &str, now: u64, deposit: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(account("contract.near"))
        .signer_account_id(account(actor))
        .predecessor_account_id(account(actor))
        .block_timestamp(now)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100));
    testing_env!(b.build());
}

fn rejected<T>(call: impl FnOnce() -> T) {
    assert!(catch_unwind(AssertUnwindSafe(call)).is_err());
}

fn market(cheap_underbonded: bool) -> (Nomogenesis, Vec<u8>) {
    let mut c = Nomogenesis::default();

    context("creator.near", 100, 0);
    let case_bond = c.m3_storage_quote().case_storage_cost.0;
    let job_bond = c.m3_storage_quote().job_storage_cost.0;
    let offer_bond = c.m3_storage_quote().offer_storage_cost.0;

    context("creator.near", 100, case_bond);
    let id = c.create_rescue_case(RescueCaseDescriptorInput {
        descriptor_version: 1,
        original_provider: account("source.near"),
        component_commitments: vec![vec![1; 32], vec![2; 32]],
        dependency_deadline: 200,
        bid_close: 220,
        award_close: 240,
        recovery_deadline: 260,
    });

    for n in 0..3 {
        let buyer = format!("buyer{n}.near");
        let worker = format!("worker{n}.near");

        context(&buyer, 110, 8 + job_bond);
        let job_id = c.create_funded_rescue_job(FundedRescueJobInput {
            case_id: id.clone(),
            worker: account(&worker),
            worker_reward: U128(1),
            rescue_cap: U128(7),
            result_profile: RescueResultProfile::ExactCommitment,
            result_commitment: vec![9; 32],
            threshold: None,
            final_deadline: 300,
        });
        assert_eq!(job_id, n as u64);

        context(&worker, 115, 0);
        c.accept_rescue_job(job_id);
    }

    if cheap_underbonded {
        for component in 0..2 {
            let provider = format!("cheap{component}.near");
            context(&provider, 205, 1 + offer_bond);
            c.post_rescue_offer(RescueOfferInput {
                case_id: id.clone(),
                component_index: component,
                slot_id: format!("cheap_{component}"),
                fee: U128(1),
                bond_capacity: U128(1),
            });
        }
    }

    for component in 0..2 {
        let provider = format!("provider{component}.near");
        context(&provider, 206, 12 + offer_bond);
        c.post_rescue_offer(RescueOfferInput {
            case_id: id.clone(),
            component_index: component,
            slot_id: format!("valid_{component}"),
            fee: U128(6),
            bond_capacity: U128(12),
        });
    }

    (c, id)
}

#[test]
fn two_of_three_get_exact_six_six_without_award() {
    let (c, id) = market(false);

    context("keeper.near", 220, 0);
    let old = c.preview_rescue_pair(id.clone()).unwrap();
    assert_eq!(old.eligible_job_ids, vec![0, 1, 2]);

    let escrow = c.rescue_escrow_total();
    let count = c.next_rescue_bundle_id();

    let plan = c.preview_r7_v2_coalition(id.clone(), vec![0, 1]);

    assert_eq!(plan.selected_job_ids, vec![0, 1]);
    assert_eq!(plan.offer_ids, [0, 1]);
    assert_eq!(plan.total_price, U128(12));
    assert_eq!(plan.payments.len(), 2);
    assert_eq!(plan.payments[0].job_id, 0);
    assert_eq!(plan.payments[0].amount, U128(6));
    assert_eq!(plan.payments[1].job_id, 1);
    assert_eq!(plan.payments[1].amount, U128(6));
    assert_eq!(plan.plan_hash.len(), 32);

    assert_eq!(c.rescue_escrow_total(), escrow);
    assert_eq!(c.next_rescue_bundle_id(), count);
    assert!(c.get_rescue_case(id).unwrap().awarded_bundle_id.is_none());
}

#[test]
fn selected_coalition_changes_canonical_hash() {
    let (c, id) = market(false);

    context("keeper.near", 220, 0);

    let first = c.preview_r7_v2_coalition(id.clone(), vec![0, 1]);
    let second = c.preview_r7_v2_coalition(id.clone(), vec![1, 2]);
    let full = c.preview_r7_v2_coalition(id.clone(), vec![0, 1, 2]);
    let repeated = c.preview_r7_v2_coalition(id, vec![0, 1]);

    assert_ne!(first.plan_hash, second.plan_hash);
    assert_ne!(first.plan_hash, full.plan_hash);
    assert_eq!(first.plan_hash, repeated.plan_hash);

    assert_eq!(full.payments.len(), 3);
    for p in &full.payments {
        assert_eq!(p.amount, U128(4));
    }
}

#[test]
fn invalid_and_insufficient_coalitions_fail_closed() {
    let (c, id) = market(false);

    context("keeper.near", 220, 0);

    for jobs in [vec![], vec![0], vec![0, 0], vec![2, 1], vec![0, 99]] {
        rejected(|| {
            c.preview_r7_v2_coalition(id.clone(), jobs);
        });
    }

    assert_eq!(c.next_rescue_bundle_id(), 0);
    assert_eq!(
        c.get_rescue_case(id).unwrap().phase,
        prime_radiant_nomogenesis::rescue::RescueCasePhase::Open
    );
}

#[test]
fn underbonded_cheapest_pair_is_not_selected() {
    let (c, id) = market(true);

    context("keeper.near", 220, 0);
    let plan = c.preview_r7_v2_coalition(id, vec![0, 1]);

    assert_eq!(plan.offer_ids, [2, 3]);
    assert_eq!(plan.total_price, U128(12));
    assert_eq!(plan.payments[0].amount, U128(6));
    assert_eq!(plan.payments[1].amount, U128(6));
}

#[test]
fn deadlines_reject_stale_coalition_plans() {
    let (c, id) = market(false);

    context("keeper.near", 219, 0);
    rejected(|| {
        c.preview_r7_v2_coalition(id.clone(), vec![0, 1]);
    });

    context("keeper.near", 240, 0);
    rejected(|| {
        c.preview_r7_v2_coalition(id.clone(), vec![0, 1]);
    });
}

fn authorize_for_plan(
    contract: &mut Nomogenesis,
    case_id: &[u8],
    job_id: u64,
    nonce: u64,
    hash: &[u8],
    exact: u128,
    expiry: u64,
) {
    use prime_radiant_nomogenesis::r7_v2_consent::{ConsentInput, DOMAIN};

    let buyer = format!("buyer{job_id}.near");

    context(&buyer, 225, 0);
    let bond = contract.quote_r7_v2_consent_storage().0;

    context(&buyer, 225, bond);
    contract.register_r7_v2_consent(ConsentInput {
        case_id: case_id.to_vec(),
        contract: account("contract.near"),
        domain: DOMAIN.to_owned(),
        job_id,
        buyer: account(&buyer),
        nonce,
        plan_hash: hash.to_vec(),
        max_payment: U128(7),
        exact_payment: U128(exact),
        expires_at: expiry,
    });
}

#[test]
fn verified_two_buyer_award_preflight() {
    let (mut c, case_id) = market(false);

    context("keeper.near", 220, 0);
    let plan = c.preview_r7_v2_coalition(case_id.clone(), vec![0, 1]);

    authorize_for_plan(&mut c, &case_id, 0, 101, &plan.plan_hash, 6, 239);
    authorize_for_plan(&mut c, &case_id, 1, 102, &plan.plan_hash, 6, 239);

    context("keeper.near", 226, 0);

    let escrow_before = c.rescue_escrow_total();
    let claimable_before = c.claimable_total();
    let storage_before = c.m3_totals().storage_reserves;

    let verified = c.preflight_r7_v2_award(case_id.clone(), vec![0, 1], plan.plan_hash.clone());

    assert_eq!(verified.plan_hash, plan.plan_hash);
    assert_eq!(verified.selected_job_ids, vec![0, 1]);
    assert_eq!(verified.total_price, U128(12));
    assert_eq!(verified.payments[0].amount, U128(6));
    assert_eq!(verified.payments[1].amount, U128(6));

    assert_eq!(c.rescue_escrow_total(), escrow_before);
    assert_eq!(c.claimable_total(), claimable_before);
    assert_eq!(c.m3_totals().storage_reserves, storage_before);
    assert_eq!(c.next_rescue_bundle_id(), 0);
    assert!(
        c.get_rescue_case(case_id)
            .unwrap()
            .awarded_bundle_id
            .is_none()
    );
}

#[test]
fn missing_or_wrong_plan_consent_fails() {
    let (mut c, case_id) = market(false);

    context("keeper.near", 220, 0);
    let plan = c.preview_r7_v2_coalition(case_id.clone(), vec![0, 1]);

    authorize_for_plan(&mut c, &case_id, 0, 101, &plan.plan_hash, 6, 239);

    context("keeper.near", 226, 0);

    rejected(|| c.preflight_r7_v2_award(case_id.clone(), vec![0, 1], plan.plan_hash.clone()));

    authorize_for_plan(&mut c, &case_id, 1, 102, &plan.plan_hash, 6, 239);

    context("keeper.near", 226, 0);

    rejected(|| c.preflight_r7_v2_award(case_id.clone(), vec![0, 1], vec![8; 32]));

    rejected(|| c.preflight_r7_v2_award(case_id.clone(), vec![0, 2], plan.plan_hash.clone()));

    assert_eq!(c.next_rescue_bundle_id(), 0);
}

#[test]
fn wrong_exact_payment_and_expiry_fail() {
    let (mut c, case_id) = market(false);

    context("keeper.near", 220, 0);
    let plan = c.preview_r7_v2_coalition(case_id.clone(), vec![0, 1]);

    authorize_for_plan(&mut c, &case_id, 0, 101, &plan.plan_hash, 5, 239);
    authorize_for_plan(&mut c, &case_id, 1, 102, &plan.plan_hash, 6, 239);

    context("keeper.near", 226, 0);
    rejected(|| c.preflight_r7_v2_award(case_id.clone(), vec![0, 1], plan.plan_hash.clone()));

    context("buyer0.near", 227, 0);
    c.revoke_r7_v2_consent(0);

    authorize_for_plan(&mut c, &case_id, 0, 103, &plan.plan_hash, 6, 226);

    context("keeper.near", 227, 0);
    rejected(|| c.preflight_r7_v2_award(case_id.clone(), vec![0, 1], plan.plan_hash.clone()));

    assert_eq!(c.next_rescue_bundle_id(), 0);
}

#[test]
fn revoked_mandate_invalidates_signed_plan() {
    let (mut c, case_id) = market(false);

    context("keeper.near", 220, 0);
    let plan = c.preview_r7_v2_coalition(case_id.clone(), vec![0, 1]);

    authorize_for_plan(&mut c, &case_id, 0, 101, &plan.plan_hash, 6, 239);
    authorize_for_plan(&mut c, &case_id, 1, 102, &plan.plan_hash, 6, 239);

    context("buyer0.near", 227, 0);
    c.revoke_open_rescue_mandate(0);

    context("keeper.near", 228, 0);
    rejected(|| c.preflight_r7_v2_award(case_id.clone(), vec![0, 1], plan.plan_hash.clone()));

    assert_eq!(c.next_rescue_bundle_id(), 0);
    assert!(
        c.get_rescue_case(case_id)
            .unwrap()
            .awarded_bundle_id
            .is_none()
    );
}

fn approved_two(c: &mut Nomogenesis, case_id: &[u8]) -> Vec<u8> {
    context("keeper.near", 220, 0);

    let plan = c.preview_r7_v2_coalition(case_id.to_vec(), vec![0, 1]);

    authorize_for_plan(c, case_id, 0, 101, &plan.plan_hash, 6, 239);
    authorize_for_plan(c, case_id, 1, 102, &plan.plan_hash, 6, 239);

    plan.plan_hash
}

#[test]
fn authorized_subset_award_refunds_excluded_and_conserves() {
    use prime_radiant_nomogenesis::rescue::{
        MandateReleaseReason, RescueCasePhase, RescueJobPhase, RescueMandatePhase, RescueOfferPhase,
    };

    let (mut c, id) = market(false);
    let hash = approved_two(&mut c, &id);

    let before_total = c.rescue_escrow_total().0 + c.claimable_total().0;
    let storage = c.m3_totals().storage_reserves;

    context("keeper.near", 226, 0);

    let bundle_id = c.award_r7_v2_bundle(id.clone(), vec![0, 1], hash.clone());

    assert_eq!(bundle_id, 0);
    assert_eq!(c.next_rescue_bundle_id(), 1);

    let case = c.get_rescue_case(id.clone()).unwrap();
    assert_eq!(case.phase, RescueCasePhase::BundleAwarded);
    assert_eq!(case.awarded_bundle_id, Some(bundle_id));

    for selected in [0, 1] {
        let mandate = c.get_rescue_mandate(selected).unwrap();
        assert_eq!(mandate.phase, RescueMandatePhase::Locked);
        assert_eq!(mandate.held_principal, U128(6));
        assert_eq!(mandate.locked_allocation, Some(U128(6)));
        assert_eq!(mandate.locked_bundle_id, Some(bundle_id));
    }

    let excluded = c.get_rescue_mandate(2).unwrap();
    assert_eq!(excluded.phase, RescueMandatePhase::Released);
    assert_eq!(excluded.held_principal, U128(0));
    assert_eq!(
        excluded.release_reason,
        Some(MandateReleaseReason::ZeroAllocation),
    );

    let worker = c.get_rescue_job(2).unwrap();
    assert_eq!(worker.phase, RescueJobPhase::Accepted);
    assert_eq!(worker.held_worker_reward, U128(1));

    assert_eq!(c.get_claimable(account("buyer0.near")), U128(1));
    assert_eq!(c.get_claimable(account("buyer1.near")), U128(1));
    assert_eq!(c.get_claimable(account("buyer2.near")), U128(7));

    assert_eq!(c.rescue_escrow_total(), U128(39));
    assert_eq!(c.claimable_total(), U128(9));

    assert_eq!(
        c.rescue_escrow_total().0 + c.claimable_total().0,
        before_total,
    );

    assert_eq!(c.m3_totals().storage_reserves, storage);

    for offer_id in [0, 1] {
        let offer = c.get_rescue_offer(offer_id).unwrap();
        assert_eq!(offer.phase, RescueOfferPhase::Locked);
        assert_eq!(offer.held_bond, U128(12));
        assert_eq!(offer.locked_bundle_id, Some(bundle_id));
    }

    rejected(|| {
        c.award_r7_v2_bundle(id, vec![0, 1], hash);
    });

    assert_eq!(c.rescue_escrow_total(), U128(39));
    assert_eq!(c.claimable_total(), U128(9));

    // Excluded worker reward is not confiscated or
    // forgotten. It retains its existing expiry path.
    context("keeper.near", 300, 0);
    c.expire_rescue_job(2);

    assert_eq!(c.get_rescue_job(2).unwrap().phase, RescueJobPhase::Expired,);
    assert_eq!(c.get_claimable(account("buyer2.near")), U128(8));
    assert_eq!(c.rescue_escrow_total(), U128(38));

    assert_eq!(
        c.rescue_escrow_total().0 + c.claimable_total().0,
        before_total,
    );
}

#[test]
fn missing_consent_prevents_all_economic_writes() {
    let (mut c, id) = market(false);

    context("keeper.near", 220, 0);
    let plan = c.preview_r7_v2_coalition(id.clone(), vec![0, 1]);

    authorize_for_plan(&mut c, &id, 0, 101, &plan.plan_hash, 6, 239);

    let escrow = c.rescue_escrow_total();
    let claims = c.claimable_total();
    let storage = c.m3_totals().storage_reserves;

    context("keeper.near", 226, 0);

    rejected(|| {
        c.award_r7_v2_bundle(id.clone(), vec![0, 1], plan.plan_hash.clone());
    });

    assert_eq!(c.rescue_escrow_total(), escrow);
    assert_eq!(c.claimable_total(), claims);
    assert_eq!(c.m3_totals().storage_reserves, storage);
    assert_eq!(c.next_rescue_bundle_id(), 0);

    for id in 0..3 {
        assert_eq!(c.get_rescue_mandate(id).unwrap().held_principal, U128(7),);
    }
}

#[test]
fn already_revoked_excluded_mandate_is_not_refunded_twice() {
    use prime_radiant_nomogenesis::rescue::{MandateReleaseReason, RescueMandatePhase};

    let (mut c, id) = market(false);

    context("buyer2.near", 215, 0);
    c.revoke_open_rescue_mandate(2);

    assert_eq!(c.get_claimable(account("buyer2.near")), U128(7));

    let hash = approved_two(&mut c, &id);

    context("keeper.near", 226, 0);
    c.award_r7_v2_bundle(id, vec![0, 1], hash);

    assert_eq!(c.get_claimable(account("buyer2.near")), U128(7));
    assert_eq!(c.claimable_total(), U128(9));
    assert_eq!(c.rescue_escrow_total(), U128(39));

    let excluded = c.get_rescue_mandate(2).unwrap();
    assert_eq!(excluded.phase, RescueMandatePhase::Released);
    assert_eq!(excluded.release_reason, Some(MandateReleaseReason::Revoked),);
}

#[test]
fn underbonded_cheapest_offers_cannot_win_award() {
    use prime_radiant_nomogenesis::rescue::RescueOfferPhase;

    let (mut c, id) = market(true);
    let hash = approved_two(&mut c, &id);

    context("keeper.near", 226, 0);
    c.award_r7_v2_bundle(id, vec![0, 1], hash);

    for offer_id in [0, 1] {
        assert_eq!(
            c.get_rescue_offer(offer_id).unwrap().phase,
            RescueOfferPhase::Open,
        );
    }

    for offer_id in [2, 3] {
        assert_eq!(
            c.get_rescue_offer(offer_id).unwrap().phase,
            RescueOfferPhase::Locked,
        );
    }

    assert_eq!(c.get_claimable(account("buyer2.near")), U128(7));
}

#[test]
fn wrong_or_revoked_consent_blocks_actual_award() {
    let (mut c, id) = market(false);
    let hash = approved_two(&mut c, &id);

    context("keeper.near", 226, 0);

    rejected(|| {
        c.award_r7_v2_bundle(id.clone(), vec![0, 1], vec![9; 32]);
    });

    context("buyer1.near", 227, 0);
    c.revoke_r7_v2_consent(1);

    let escrow = c.rescue_escrow_total();
    let claims = c.claimable_total();

    context("keeper.near", 228, 0);
    rejected(|| {
        c.award_r7_v2_bundle(id.clone(), vec![0, 1], hash);
    });

    assert_eq!(c.rescue_escrow_total(), escrow);
    assert_eq!(c.claimable_total(), claims);
    assert_eq!(c.next_rescue_bundle_id(), 0);
    assert!(c.get_rescue_case(id).unwrap().awarded_bundle_id.is_none());
}
