use super::*;
use crate::rescue::{
    COMMITMENT_BYTES, COMPONENT_COUNT, MAX_BUNDLE_RECORD_BYTES, MAX_CASE_RECORD_BYTES,
    MAX_COMPONENT_PAYLOAD_BYTES, MAX_JOB_RECORD_BYTES, MAX_MANDATE_RECORD_BYTES,
    MAX_OFFER_RECORD_BYTES, MAX_RESCUE_JOBS, MAX_RESCUE_OFFERS, MAX_RESCUE_SLOT_BYTES,
    OFFER_STORAGE_BYTES, RescueAllocation, RescueBundle, RescueBundlePhase, RescueCase,
    RescueCasePhase, RescueComponentOutcome, RescueJob, RescueJobPhase, RescueMandate,
    RescueMandatePhase, RescueOffer, RescueOfferPhase,
};

#[test]
fn default_schema_is_empty_and_zero_liability() {
    let c = Nomogenesis::default();

    assert_eq!(c.next_rescue_job_id(), 0);
    assert_eq!(c.next_rescue_offer_id(), 0);
    assert_eq!(c.next_rescue_bundle_id(), 0);
    assert!(!c.has_rescue_offer(0));
    assert!(!c.has_rescue_bundle(0));
    assert!(!c.has_rescue_case(vec![0; COMMITMENT_BYTES]));
    assert!(!c.has_rescue_job(0));
    assert!(!c.has_rescue_mandate(0));
    assert_eq!(c.rescue_escrow_total(), U128(0));
}

#[test]
fn maximum_record_serialization_is_bounded_and_reported() {
    let account: AccountId = "a".repeat(64).parse().unwrap();
    let case_id = [1; COMMITMENT_BYTES];

    let case = RescueCase {
        id: case_id,
        descriptor_version: u16::MAX,
        descriptor_hash: [2; COMMITMENT_BYTES],
        original_provider: account.clone(),
        component_commitments: [[3; COMMITMENT_BYTES], [4; COMMITMENT_BYTES]],
        dependency_deadline: u64::MAX - 4,
        bid_close: u64::MAX - 3,
        award_close: u64::MAX - 2,
        recovery_deadline: u64::MAX - 1,
        job_ids: vec![u64::MAX; MAX_RESCUE_JOBS],
        offer_ids: vec![u64::MAX; MAX_RESCUE_OFFERS],
        phase: RescueCasePhase::BundleAwarded,
        awarded_bundle_id: Some(u64::MAX),
        resolved_payloads: [
            Some(vec![6; MAX_COMPONENT_PAYLOAD_BYTES]),
            Some(vec![7; MAX_COMPONENT_PAYLOAD_BYTES]),
        ],
    };

    let job = RescueJob {
        id: u64::MAX,
        case_id,
        buyer: account.clone(),
        worker: account,
        worker_reward: u128::MAX,
        held_worker_reward: u128::MAX,
        result_commitment: [5; COMMITMENT_BYTES],
        threshold: Some(u128::MAX),
        final_deadline: u64::MAX,
        phase: RescueJobPhase::Accepted,
    };

    let mandate = RescueMandate {
        job_id: u64::MAX,
        original_cap: u128::MAX,
        held_principal: u128::MAX,
        phase: RescueMandatePhase::Locked,
        locked_bundle_id: Some(u64::MAX),
        locked_allocation: Some(u128::MAX),
        release_reason: None,
    };

    let offer = RescueOffer {
        id: u64::MAX,
        case_id,
        component_index: 1,
        provider: "a".repeat(64).parse().unwrap(),
        slot_id: "s".repeat(MAX_RESCUE_SLOT_BYTES),
        fee: u128::MAX,
        bond_capacity: u128::MAX,
        held_bond: u128::MAX,
        phase: RescueOfferPhase::Locked,
        locked_bundle_id: Some(u64::MAX),
        release_reason: Some(crate::rescue::RescueOfferReleaseReason::Unselected),
    };

    let bundle = RescueBundle {
        id: u64::MAX,
        case_id,
        offer_ids: [u64::MAX; COMPONENT_COUNT],
        total_price: u128::MAX,
        allocations: (0..MAX_RESCUE_JOBS)
            .map(|job_id| RescueAllocation {
                job_id: job_id as u64,
                amount: u128::MAX,
            })
            .collect(),
        recovery_deadline: u64::MAX,
        phase: RescueBundlePhase::SettledDefault,
        component_outcomes: [
            RescueComponentOutcome::Proven,
            RescueComponentOutcome::Defaulted,
        ],
    };

    let offer_bytes = near_sdk::borsh::to_vec(&offer).unwrap();
    let bundle_bytes = near_sdk::borsh::to_vec(&bundle).unwrap();
    let case_bytes = near_sdk::borsh::to_vec(&case).unwrap();
    let job_bytes = near_sdk::borsh::to_vec(&job).unwrap();
    let mandate_bytes = near_sdk::borsh::to_vec(&mandate).unwrap();

    println!(
        "M3_SERIALIZED_BYTES case={} job={} mandate={}",
        case_bytes.len(),
        job_bytes.len(),
        mandate_bytes.len()
    );

    assert_eq!(case.component_commitments.len(), COMPONENT_COUNT);
    assert_eq!(case.job_ids.len(), MAX_RESCUE_JOBS);
    assert_eq!(case.offer_ids.len(), MAX_RESCUE_OFFERS);
    assert_eq!(offer_bytes.len() as u64, MAX_OFFER_RECORD_BYTES);
    assert_eq!(bundle_bytes.len() as u64, MAX_BUNDLE_RECORD_BYTES);
    assert_eq!(OFFER_STORAGE_BYTES, 613);
    assert_eq!(case_bytes.len() as u64, MAX_CASE_RECORD_BYTES);
    assert_eq!(job_bytes.len() as u64, MAX_JOB_RECORD_BYTES);
    assert_eq!(mandate_bytes.len() as u64, MAX_MANDATE_RECORD_BYTES);
}
