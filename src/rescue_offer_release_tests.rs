use super::*;
use crate::rescue::{
    RescueBundle, RescueBundlePhase, RescueCaseDescriptorInput, RescueCasePhase,
    RescueComponentOutcome, RescueOfferInput, RescueOfferPhase, RescueOfferReleaseReason,
};
use near_sdk::{NearToken, test_utils::VMContextBuilder, testing_env};
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

fn rejected(call: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(call)).is_err());
}

fn market() -> (Nomogenesis, Vec<u8>) {
    let mut c = Nomogenesis::default();
    context("creator.near", 100, rescue::case_storage_cost());
    let id = c.create_rescue_case(RescueCaseDescriptorInput {
        descriptor_version: 1,
        original_provider: account("source.near"),
        component_commitments: vec![vec![1; 32], vec![2; 32]],
        dependency_deadline: 200,
        bid_close: 220,
        award_close: 240,
        recovery_deadline: 260,
    });
    (c, id)
}

fn post(c: &mut Nomogenesis, id: &[u8], provider: &str, component: u8) -> u64 {
    context(provider, 205, 12 + rescue::offer_storage_cost());
    c.post_rescue_offer(RescueOfferInput {
        case_id: id.to_vec(),
        component_index: component,
        slot_id: "slot_1".into(),
        fee: U128(6),
        bond_capacity: U128(12),
    })
}

#[test]
fn provider_cancel_is_authenticated_and_single_use() {
    let (mut c, id) = market();
    let first = post(&mut c, &id, "provider.near", 0);
    let second = post(&mut c, &id, "other.near", 1);
    let storage = c.storage_reserves;
    context("outsider.near", 219, 0);
    rejected(|| c.cancel_rescue_offer(first));
    assert_eq!(c.rescue_escrow_total(), U128(24));
    context("provider.near", 219, 0);
    c.cancel_rescue_offer(first);
    let offer = c.get_rescue_offer(first).unwrap();
    assert_eq!(offer.phase, RescueOfferPhase::Released);
    assert_eq!(
        offer.release_reason,
        Some(RescueOfferReleaseReason::Cancelled)
    );
    assert_eq!(offer.held_bond, U128(0));
    assert_eq!(
        c.get_rescue_offer(second).unwrap().phase,
        RescueOfferPhase::Open
    );
    assert_eq!(c.rescue_escrow_total(), U128(12));
    assert_eq!(c.get_claimable(account("provider.near")), U128(12));
    assert_eq!(c.claimable_total(), U128(12));
    assert_eq!(c.storage_reserves, storage);
    assert!(
        c.capacity_locks
            .get(&"provider.near|slot_1".to_owned())
            .is_none()
    );
    rejected(|| c.cancel_rescue_offer(first));
    assert_eq!(c.get_claimable(account("provider.near")), U128(12));
}

#[test]
fn bid_and_award_boundaries_do_not_overlap() {
    let (mut c, id) = market();
    let offer = post(&mut c, &id, "provider.near", 0);
    context("provider.near", 220, 0);
    rejected(|| c.cancel_rescue_offer(offer));
    context("keeper.near", 239, 0);
    rejected(|| c.release_open_rescue_offer(offer));
    assert_eq!(c.rescue_escrow_total(), U128(12));
    context("keeper.near", 240, 0);
    c.release_open_rescue_offer(offer);
    assert_eq!(
        c.get_rescue_offer(offer).unwrap().release_reason,
        Some(RescueOfferReleaseReason::AwardExpired)
    );
    assert_eq!(c.get_claimable(account("provider.near")), U128(12));
    rejected(|| c.release_open_rescue_offer(offer));
    assert_eq!(c.rescue_escrow_total(), U128(0));
}

#[test]
fn credit_overflow_and_locked_offer_cannot_release() {
    let (mut c, id) = market();
    let offer_id = post(&mut c, &id, "provider.near", 0);
    context("provider.near", 210, 0);
    c.claimables.insert(account("provider.near"), u128::MAX);
    rejected(|| c.cancel_rescue_offer(offer_id));
    assert_eq!(c.rescue_escrow_total(), U128(12));
    assert_eq!(
        c.get_rescue_offer(offer_id).unwrap().phase,
        RescueOfferPhase::Open
    );
    c.claimables.insert(account("provider.near"), 0);
    c.claimable_total = u128::MAX;
    rejected(|| c.cancel_rescue_offer(offer_id));
    assert_eq!(c.get_claimable(account("provider.near")), U128(0));
    c.claimable_total = 0;
    c.rescue_escrow = 11;
    rejected(|| c.cancel_rescue_offer(offer_id));
    assert_eq!(c.get_claimable(account("provider.near")), U128(0));
    c.rescue_escrow = 12;
    let mut offer = c.rescue_offers.get(&offer_id).unwrap().clone();
    offer.phase = RescueOfferPhase::Locked;
    offer.locked_bundle_id = Some(0);
    c.rescue_offers.insert(offer_id, offer);
    rejected(|| c.cancel_rescue_offer(offer_id));
    context("keeper.near", 240, 0);
    rejected(|| c.release_open_rescue_offer(offer_id));
    assert_eq!(c.rescue_escrow_total(), U128(12));
}

#[test]
fn unselected_offer_releases_after_award_but_selected_remains_locked() {
    let (mut c, id) = market();
    let selected = post(&mut c, &id, "selected.near", 0);
    let other_selected = post(&mut c, &id, "other.near", 1);
    let unselected = post(&mut c, &id, "unselected.near", 1);
    let case_id: [u8; 32] = id.try_into().unwrap();
    let mut case = c.rescue_cases.get(&case_id).unwrap().clone();
    case.phase = RescueCasePhase::BundleAwarded;
    case.awarded_bundle_id = Some(0);
    c.rescue_cases.insert(case_id, case);
    c.rescue_bundles.insert(
        0,
        RescueBundle {
            id: 0,
            case_id,
            offer_ids: [selected, other_selected],
            total_price: 12,
            allocations: vec![],
            recovery_deadline: 260,
            phase: RescueBundlePhase::Awarded,
            component_outcomes: [
                RescueComponentOutcome::Pending,
                RescueComponentOutcome::Pending,
            ],
        },
    );
    context("keeper.near", 225, 0);
    rejected(|| c.release_open_rescue_offer(selected));
    c.release_open_rescue_offer(unselected);
    assert_eq!(
        c.get_rescue_offer(unselected).unwrap().release_reason,
        Some(RescueOfferReleaseReason::Unselected)
    );
    assert_eq!(c.get_claimable(account("unselected.near")), U128(12));
    assert_eq!(c.get_claimable(account("selected.near")), U128(0));
    assert_eq!(c.rescue_escrow_total(), U128(24));
}

#[test]
fn released_offer_survives_state_reload() {
    let (mut c, id) = market();
    let offer_id = post(&mut c, &id, "provider.near", 0);
    context("provider.near", 219, 0);
    c.cancel_rescue_offer(offer_id);
    c.rescue_cases.flush();
    c.rescue_offers.flush();
    c.claimables.flush();
    env::state_write(&c);
    let reloaded: Nomogenesis = env::state_read().unwrap();
    assert_eq!(
        reloaded.get_rescue_offer(offer_id).unwrap().phase,
        RescueOfferPhase::Released
    );
    assert_eq!(reloaded.get_claimable(account("provider.near")), U128(12));
    assert_eq!(reloaded.rescue_escrow_total(), U128(0));
}
