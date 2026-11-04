use super::*;
use crate::rescue::{
    COMMITMENT_BYTES, COMPONENT_COUNT, MAX_RESCUE_JOBS, RescueCase, RescueCasePhase, RescueJob,
    RescueJobPhase, RescueMandate, RescueMandatePhase,
};

#[test]
fn default_schema_is_empty_and_zero_liability() {
    let c = Nomogenesis::default();

    assert_eq!(c.next_rescue_job_id(), 0);
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
        phase: RescueCasePhase::BundleAwarded,
        awarded_bundle_id: Some(u64::MAX),
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
    assert!(case_bytes.len() <= 2_048);
    assert!(job_bytes.len() <= 1_024);
    assert!(mandate_bytes.len() <= 512);
}
