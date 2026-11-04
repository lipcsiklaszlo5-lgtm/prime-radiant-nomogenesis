use super::*;
use crate::rescue::{
    RescueCaseDescriptorInput, RescueCasePhase, RescueOfferInput, RescueOfferPhase,
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

fn rejected<T>(call: impl FnOnce() -> T) {
    assert!(catch_unwind(AssertUnwindSafe(call)).is_err());
}

fn create_case(c: &mut Nomogenesis) -> Vec<u8> {
    context("creator.near", 100, 0);
    let quote = c.m3_storage_quote().case_storage_cost.0;
    context("creator.near", 100, quote);
    let id = c.create_rescue_case(RescueCaseDescriptorInput {
        descriptor_version: 1,
        original_provider: account("source.near"),
        component_commitments: vec![vec![1; 32], vec![2; 32]],
        dependency_deadline: 200,
        bid_close: 220,
        award_close: 240,
        recovery_deadline: 260,
    });
    c.rescue_cases.flush();
    id
}

fn input(case_id: Vec<u8>, component_index: u8, fee: u128, bond: u128) -> RescueOfferInput {
    RescueOfferInput {
        case_id,
        component_index,
        slot_id: "slot_1".to_owned(),
        fee: U128(fee),
        bond_capacity: U128(bond),
    }
}

fn post(c: &mut Nomogenesis, case_id: Vec<u8>, provider: &str, component: u8) -> u64 {
    context(provider, 205, 12 + crate::rescue::offer_storage_cost());
    c.post_rescue_offer(input(case_id, component, 6, 12))
}

#[test]
fn funded_offer_tracks_own_bond_without_reserving_slot() {
    let mut c = Nomogenesis::default();
    let case_id = create_case(&mut c);
    let quote = c.m3_storage_quote().offer_storage_cost.0;
    context("provider.near", 205, quote + 12);
    let before = env::storage_usage();
    let id = c.post_rescue_offer(input(case_id.clone(), 0, 6, 12));
    c.rescue_cases.flush();
    c.rescue_offers.flush();
    let measured = env::storage_usage() - before;

    assert_eq!(id, 0);
    assert!(measured > 0 && measured <= crate::rescue::OFFER_STORAGE_BYTES);
    assert_eq!(c.m3_storage_quote().offer_storage_bytes, 613);
    assert_eq!(
        c.storage_reserves,
        crate::rescue::case_storage_cost() + quote
    );
    assert_eq!(c.rescue_escrow_total(), U128(12));
    assert_eq!(c.next_rescue_offer_id(), 1);
    assert_eq!(c.get_rescue_case(case_id).unwrap().offer_ids, vec![id]);
    let offer = c.get_rescue_offer(id).unwrap();
    assert_eq!(offer.provider, account("provider.near"));
    assert_eq!(offer.fee, U128(6));
    assert_eq!(offer.bond_capacity, U128(12));
    assert_eq!(offer.held_bond, U128(12));
    assert_eq!(offer.phase, RescueOfferPhase::Open);
    assert_eq!(offer.locked_bundle_id, None);
    assert_eq!(
        c.capacity_locks.get(&"provider.near|slot_1".to_owned()),
        None
    );
}

#[test]
fn maximum_provider_and_slot_fit_prepaid_storage_quote() {
    let mut c = Nomogenesis::default();
    let id = create_case(&mut c);
    let provider = "a".repeat(64);
    let slot = "s".repeat(64);
    let quote = c.m3_storage_quote().offer_storage_cost.0;
    context(&provider, 205, quote + 12);
    let mut offer = input(id, 0, 6, 12);
    offer.slot_id = slot.clone();
    let before = env::storage_usage();
    assert_eq!(c.post_rescue_offer(offer), 0);
    c.rescue_cases.flush();
    c.rescue_offers.flush();
    let measured = env::storage_usage() - before;
    assert!(measured > 0 && measured <= crate::rescue::OFFER_STORAGE_BYTES);
    assert_eq!(c.get_rescue_offer(0).unwrap().slot_id, slot);
}

#[test]
fn exact_funding_and_valid_parameters_are_required() {
    let mut c = Nomogenesis::default();
    let id = create_case(&mut c);
    let quote = crate::rescue::offer_storage_cost();
    for deposit in [0, quote + 11, quote + 13] {
        context("provider.near", 205, deposit);
        rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, 12)));
    }
    for (component, fee, bond) in [(2, 6, 12), (0, 0, 12), (0, 13, 12)] {
        context("provider.near", 205, quote + 12);
        rejected(|| c.post_rescue_offer(input(id.clone(), component, fee, bond)));
    }
    for slot in ["", "too long / invalid", "ékezet"] {
        context("provider.near", 205, quote + 12);
        let mut attempt = input(id.clone(), 0, 6, 12);
        attempt.slot_id = slot.to_owned();
        rejected(|| c.post_rescue_offer(attempt));
    }
    context("provider.near", 205, quote + 12);
    let mut too_long = input(id.clone(), 0, 6, 12);
    too_long.slot_id = "x".repeat(65);
    rejected(|| c.post_rescue_offer(too_long));
    rejected(|| c.post_rescue_offer(input(vec![0; 31], 0, 6, 12)));
    rejected(|| c.post_rescue_offer(input(vec![0; 32], 0, 6, 12)));
    assert_eq!(c.next_rescue_offer_id(), 0);
    assert!(c.get_rescue_case(id).unwrap().offer_ids.is_empty());
    assert_eq!(c.rescue_escrow_total(), U128(0));
    assert_eq!(c.storage_reserves, crate::rescue::case_storage_cost());
}

#[test]
fn provider_and_deadline_rules_reject_without_mutation() {
    let mut c = Nomogenesis::default();
    let id = create_case(&mut c);
    let payment = 12 + crate::rescue::offer_storage_cost();
    for (provider, now) in [
        ("source.near", 205),
        ("contract.near", 205),
        ("provider.near", 220),
    ] {
        context(provider, now, payment);
        rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, 12)));
    }
    let mut case = c
        .rescue_cases
        .get(&<[u8; 32]>::try_from(id.clone()).unwrap())
        .unwrap()
        .clone();
    case.phase = RescueCasePhase::Closed;
    c.rescue_cases.insert(case.id, case);
    context("provider.near", 205, payment);
    rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, 12)));
    assert_eq!(c.next_rescue_offer_id(), 0);
    assert!(!c.has_rescue_offer(0));
    assert!(c.get_rescue_case(id).unwrap().offer_ids.is_empty());
    assert_eq!(c.rescue_escrow_total(), U128(0));
}

#[test]
fn duplicate_component_and_seventh_offer_are_rejected() {
    let mut c = Nomogenesis::default();
    let id = create_case(&mut c);
    assert_eq!(post(&mut c, id.clone(), "provider0.near", 0), 0);
    context(
        "provider0.near",
        205,
        12 + crate::rescue::offer_storage_cost(),
    );
    rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, 12)));
    // The same provider may quote the other component; clearing must later
    // reject a pair that selects this provider twice.
    assert_eq!(post(&mut c, id.clone(), "provider0.near", 1), 1);
    for n in 1..5 {
        assert_eq!(
            post(&mut c, id.clone(), &format!("provider{n}.near"), 0),
            n + 1
        );
    }
    context(
        "provider5.near",
        205,
        12 + crate::rescue::offer_storage_cost(),
    );
    rejected(|| c.post_rescue_offer(input(id.clone(), 1, 6, 12)));
    assert_eq!(
        c.get_rescue_case(id).unwrap().offer_ids,
        (0..6).collect::<Vec<_>>()
    );
    assert_eq!(c.next_rescue_offer_id(), 6);
    assert!(!c.has_rescue_offer(6));
    assert_eq!(c.rescue_escrow_total(), U128(72));
}

#[test]
fn overflow_is_atomic_and_offer_survives_reload() {
    let mut c = Nomogenesis::default();
    let id = create_case(&mut c);
    let payment = 12 + crate::rescue::offer_storage_cost();

    c.next_rescue_offer_id = u64::MAX;
    context("provider.near", 205, payment);
    rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, 12)));
    c.next_rescue_offer_id = 0;

    c.rescue_escrow = u128::MAX;
    rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, 12)));
    c.rescue_escrow = 0;

    let storage = c.storage_reserves;
    c.storage_reserves = u128::MAX;
    rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, 12)));
    c.storage_reserves = storage;

    rejected(|| c.post_rescue_offer(input(id.clone(), 0, 6, u128::MAX)));
    assert_eq!(c.next_rescue_offer_id(), 0);
    assert!(c.get_rescue_case(id.clone()).unwrap().offer_ids.is_empty());
    assert!(!c.has_rescue_offer(0));

    assert_eq!(post(&mut c, id.clone(), "provider.near", 0), 0);
    c.rescue_cases.flush();
    c.rescue_offers.flush();
    env::state_write(&c);
    drop(c);
    let reloaded: Nomogenesis = env::state_read().expect("state missing");
    assert_eq!(
        reloaded.get_rescue_offer(0).unwrap().provider,
        account("provider.near")
    );
    assert_eq!(reloaded.get_rescue_case(id).unwrap().offer_ids, vec![0]);
    assert_eq!(reloaded.rescue_escrow_total(), U128(12));
    assert_eq!(reloaded.next_rescue_offer_id(), 1);
}
