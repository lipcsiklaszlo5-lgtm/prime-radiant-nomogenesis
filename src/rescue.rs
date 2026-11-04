use near_sdk::{AccountId, near};

pub const COMPONENT_COUNT: usize = 2;
pub const MAX_RESCUE_JOBS: usize = 6;
pub const COMMITMENT_BYTES: usize = 32;

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueCasePhase {
    Open,
    OriginalDelivered,
    BundleAwarded,
    Closed,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueJobPhase {
    Funded,
    Accepted,
    Completed,
    Expired,
    Cancelled,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueMandatePhase {
    Open,
    Locked,
    Released,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MandateReleaseReason {
    Revoked,
    JobCancelled,
    JobExpired,
    ZeroAllocation,
    Settled,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueCase {
    pub id: [u8; COMMITMENT_BYTES],
    pub descriptor_version: u16,
    pub descriptor_hash: [u8; COMMITMENT_BYTES],
    pub original_provider: AccountId,
    pub component_commitments: [[u8; COMMITMENT_BYTES]; COMPONENT_COUNT],
    pub dependency_deadline: u64,
    pub bid_close: u64,
    pub award_close: u64,
    pub recovery_deadline: u64,
    pub job_ids: Vec<u64>,
    pub phase: RescueCasePhase,
    pub awarded_bundle_id: Option<u64>,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueJob {
    pub id: u64,
    pub case_id: [u8; COMMITMENT_BYTES],
    pub buyer: AccountId,
    pub worker: AccountId,
    pub worker_reward: u128,
    pub held_worker_reward: u128,
    pub result_commitment: [u8; COMMITMENT_BYTES],
    pub threshold: Option<u128>,
    pub final_deadline: u64,
    pub phase: RescueJobPhase,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueMandate {
    pub job_id: u64,
    pub original_cap: u128,
    pub held_principal: u128,
    pub phase: RescueMandatePhase,
    pub locked_bundle_id: Option<u64>,
    pub locked_allocation: Option<u128>,
    pub release_reason: Option<MandateReleaseReason>,
}
