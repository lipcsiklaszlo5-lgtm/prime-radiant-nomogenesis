use near_sdk::{AccountId, env, json_types::U128, near};
use sha2::{Digest, Sha256};

pub const COMPONENT_COUNT: usize = 2;
pub const MAX_RESCUE_JOBS: usize = 6;
pub const COMMITMENT_BYTES: usize = 32;
pub const MAX_COMPONENT_PAYLOAD_BYTES: usize = 256;

pub const RAW_ENTRY_OVERHEAD_BYTES: u64 = 40;
pub const MAX_CASE_RECORD_BYTES: u64 = 814;
pub const MAX_JOB_RECORD_BYTES: u64 = 266;
pub const MAX_MANDATE_RECORD_BYTES: u64 = 68;

const CASE_PREFIX_BYTES: u64 = 7;
const JOB_PREFIX_BYTES: u64 = 6;
const MANDATE_PREFIX_BYTES: u64 = 10;
const CLAIM_PREFIX_BYTES: u64 = 6;
const U64_KEY_BYTES: u64 = 8;
const ACCOUNT_LENGTH_PREFIX_BYTES: u64 = 4;
const MAX_ACCOUNT_BYTES: u64 = 64;
const U128_VALUE_BYTES: u64 = 16;

pub const CASE_STORAGE_BYTES: u64 =
    RAW_ENTRY_OVERHEAD_BYTES + CASE_PREFIX_BYTES + COMMITMENT_BYTES as u64 + MAX_CASE_RECORD_BYTES;

pub const JOB_STORAGE_BYTES: u64 = (RAW_ENTRY_OVERHEAD_BYTES
    + JOB_PREFIX_BYTES
    + U64_KEY_BYTES
    + MAX_JOB_RECORD_BYTES)
    + (RAW_ENTRY_OVERHEAD_BYTES + MANDATE_PREFIX_BYTES + U64_KEY_BYTES + MAX_MANDATE_RECORD_BYTES)
    + (RAW_ENTRY_OVERHEAD_BYTES
        + CLAIM_PREFIX_BYTES
        + ACCOUNT_LENGTH_PREFIX_BYTES
        + MAX_ACCOUNT_BYTES
        + U128_VALUE_BYTES);

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueCasePhase {
    Open,
    OriginalDelivered,
    BundleAwarded,
    Closed,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueJobPhase {
    Funded,
    Accepted,
    Completed,
    Expired,
    Cancelled,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueMandatePhase {
    Open,
    Locked,
    Released,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MandateReleaseReason {
    Revoked,
    JobCancelled,
    JobExpired,
    AwardExpired,
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
    pub resolved_payloads: [Option<Vec<u8>>; COMPONENT_COUNT],
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

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueCaseDescriptorInput {
    pub descriptor_version: u16,
    pub original_provider: AccountId,
    pub component_commitments: Vec<Vec<u8>>,
    pub dependency_deadline: u64,
    pub bid_close: u64,
    pub award_close: u64,
    pub recovery_deadline: u64,
}

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueCaseView {
    pub id: Vec<u8>,
    pub descriptor_version: u16,
    pub descriptor_hash: Vec<u8>,
    pub original_provider: AccountId,
    pub component_commitments: Vec<Vec<u8>>,
    pub dependency_deadline: u64,
    pub bid_close: u64,
    pub award_close: u64,
    pub recovery_deadline: u64,
    pub job_ids: Vec<u64>,
    pub phase: RescueCasePhase,
    pub awarded_bundle_id: Option<u64>,
    pub resolved_payloads: Vec<Option<Vec<u8>>>,
}

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct M3StorageQuoteView {
    pub quote_version: u16,
    pub case_storage_bytes: u64,
    pub case_storage_cost: U128,
    pub job_storage_bytes: u64,
    pub job_storage_cost: U128,
}

impl From<&RescueCase> for RescueCaseView {
    fn from(value: &RescueCase) -> Self {
        Self {
            id: value.id.to_vec(),
            descriptor_version: value.descriptor_version,
            descriptor_hash: value.descriptor_hash.to_vec(),
            original_provider: value.original_provider.clone(),
            component_commitments: value
                .component_commitments
                .iter()
                .map(|commitment| commitment.to_vec())
                .collect(),
            dependency_deadline: value.dependency_deadline,
            bid_close: value.bid_close,
            award_close: value.award_close,
            recovery_deadline: value.recovery_deadline,
            job_ids: value.job_ids.clone(),
            phase: value.phase.clone(),
            awarded_bundle_id: value.awarded_bundle_id,
            resolved_payloads: value.resolved_payloads.to_vec(),
        }
    }
}

pub fn parse_case_id(value: Vec<u8>) -> Result<[u8; COMMITMENT_BYTES], &'static str> {
    value.try_into().map_err(|_| "invalid rescue case ID")
}

pub fn parse_component_commitments(
    values: Vec<Vec<u8>>,
) -> Result<[[u8; COMMITMENT_BYTES]; COMPONENT_COUNT], &'static str> {
    if values.len() != COMPONENT_COUNT {
        return Err("exactly two component commitments required");
    }

    let mut values = values.into_iter();
    let first = values
        .next()
        .expect("length checked")
        .try_into()
        .map_err(|_| "invalid component commitment")?;
    let second = values
        .next()
        .expect("length checked")
        .try_into()
        .map_err(|_| "invalid component commitment")?;

    Ok([first, second])
}

pub fn case_storage_cost() -> u128 {
    env::storage_byte_cost()
        .as_yoctonear()
        .checked_mul(u128::from(CASE_STORAGE_BYTES))
        .expect("case storage quote overflow")
}

pub fn job_storage_cost() -> u128 {
    env::storage_byte_cost()
        .as_yoctonear()
        .checked_mul(u128::from(JOB_STORAGE_BYTES))
        .expect("job storage quote overflow")
}

pub fn storage_quote() -> M3StorageQuoteView {
    M3StorageQuoteView {
        quote_version: 1,
        case_storage_bytes: CASE_STORAGE_BYTES,
        case_storage_cost: U128(case_storage_cost()),
        job_storage_bytes: JOB_STORAGE_BYTES,
        job_storage_cost: U128(job_storage_cost()),
    }
}

fn hash_bytes(hasher: &mut Sha256, value: &[u8]) {
    let length = u32::try_from(value.len()).expect("canonical field too long");
    hasher.update(length.to_be_bytes());
    hasher.update(value);
}

pub fn derive_descriptor_hash(
    descriptor_version: u16,
    original_provider: &AccountId,
    component_commitments: &[[u8; COMMITMENT_BYTES]; COMPONENT_COUNT],
    deadlines: [u64; 4],
) -> [u8; COMMITMENT_BYTES] {
    let mut hasher = Sha256::new();
    hasher.update(b"nomogenesis:rescue-descriptor");
    hasher.update(descriptor_version.to_be_bytes());
    hash_bytes(&mut hasher, original_provider.as_str().as_bytes());

    for commitment in component_commitments {
        hasher.update(commitment);
    }
    for deadline in deadlines {
        hasher.update(deadline.to_be_bytes());
    }

    hasher.finalize().into()
}

pub fn derive_case_id(
    contract_account: &AccountId,
    descriptor_hash: &[u8; COMMITMENT_BYTES],
) -> [u8; COMMITMENT_BYTES] {
    let mut hasher = Sha256::new();
    hasher.update(b"nomogenesis:rescue-case");
    hash_bytes(&mut hasher, contract_account.as_str().as_bytes());
    hasher.update(descriptor_hash);
    hasher.finalize().into()
}

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueResultProfile {
    ExactCommitment,
    MinimumThreshold,
}

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FundedRescueJobInput {
    pub case_id: Vec<u8>,
    pub worker: AccountId,
    pub worker_reward: U128,
    pub rescue_cap: U128,
    pub result_profile: RescueResultProfile,
    pub result_commitment: Vec<u8>,
    pub threshold: Option<U128>,
    pub final_deadline: u64,
}

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueJobView {
    pub id: u64,
    pub case_id: Vec<u8>,
    pub buyer: AccountId,
    pub worker: AccountId,
    pub worker_reward: U128,
    pub held_worker_reward: U128,
    pub result_profile: RescueResultProfile,
    pub result_commitment: Vec<u8>,
    pub threshold: Option<U128>,
    pub final_deadline: u64,
    pub phase: RescueJobPhase,
}

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueMandateView {
    pub job_id: u64,
    pub original_cap: U128,
    pub held_principal: U128,
    pub phase: RescueMandatePhase,
    pub locked_bundle_id: Option<u64>,
    pub locked_allocation: Option<U128>,
    pub release_reason: Option<MandateReleaseReason>,
}

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct M3TotalsView {
    pub rescue_escrow: U128,
    pub storage_reserves: U128,
    pub next_rescue_job_id: u64,
}

impl From<&RescueJob> for RescueJobView {
    fn from(value: &RescueJob) -> Self {
        Self {
            id: value.id,
            case_id: value.case_id.to_vec(),
            buyer: value.buyer.clone(),
            worker: value.worker.clone(),
            worker_reward: U128(value.worker_reward),
            held_worker_reward: U128(value.held_worker_reward),
            result_profile: if value.threshold.is_some() {
                RescueResultProfile::MinimumThreshold
            } else {
                RescueResultProfile::ExactCommitment
            },
            result_commitment: value.result_commitment.to_vec(),
            threshold: value.threshold.map(U128),
            final_deadline: value.final_deadline,
            phase: value.phase.clone(),
        }
    }
}

impl From<&RescueMandate> for RescueMandateView {
    fn from(value: &RescueMandate) -> Self {
        Self {
            job_id: value.job_id,
            original_cap: U128(value.original_cap),
            held_principal: U128(value.held_principal),
            phase: value.phase.clone(),
            locked_bundle_id: value.locked_bundle_id,
            locked_allocation: value.locked_allocation.map(U128),
            release_reason: value.release_reason.clone(),
        }
    }
}

pub fn parse_result_commitment(value: Vec<u8>) -> Result<[u8; COMMITMENT_BYTES], &'static str> {
    value.try_into().map_err(|_| "invalid result commitment")
}

pub fn validated_threshold(
    profile: &RescueResultProfile,
    threshold: Option<U128>,
) -> Result<Option<u128>, &'static str> {
    match (profile, threshold) {
        (RescueResultProfile::ExactCommitment, None) => Ok(None),
        (RescueResultProfile::MinimumThreshold, Some(U128(value))) if value > 0 => Ok(Some(value)),
        _ => Err("result profile and threshold mismatch"),
    }
}
