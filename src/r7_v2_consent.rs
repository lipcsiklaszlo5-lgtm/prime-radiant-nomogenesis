use near_sdk::{AccountId, json_types::U128, near};

pub const DOMAIN: &str = "NOMOGENESIS/R7-06E/SUBSET/V1";
pub const STORAGE_BYTES: u128 = 4096;

#[near(serializers = [json])]
pub struct ConsentInput {
    pub case_id: Vec<u8>,
    pub contract: AccountId,
    pub domain: String,
    pub job_id: u64,
    pub buyer: AccountId,
    pub nonce: u64,
    pub plan_hash: Vec<u8>,
    pub max_payment: U128,
    pub exact_payment: U128,
    pub expires_at: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct StoredConsent {
    pub case_id: [u8; 32],
    pub buyer: AccountId,
    pub nonce: u64,
    pub plan_hash: [u8; 32],
    pub max_payment: u128,
    pub exact_payment: u128,
    pub expires_at: u64,
}

#[near(serializers = [json])]
pub struct ConsentView {
    pub case_id: Vec<u8>,
    pub buyer: AccountId,
    pub nonce: u64,
    pub plan_hash: Vec<u8>,
    pub max_payment: U128,
    pub exact_payment: U128,
    pub expires_at: u64,
}

impl StoredConsent {
    pub fn view(&self) -> ConsentView {
        ConsentView {
            case_id: self.case_id.to_vec(),
            buyer: self.buyer.clone(),
            nonce: self.nonce,
            plan_hash: self.plan_hash.to_vec(),
            max_payment: U128(self.max_payment),
            exact_payment: U128(self.exact_payment),
            expires_at: self.expires_at,
        }
    }
}

pub fn nonce_key(buyer: &AccountId, nonce: u64) -> String {
    format!("{buyer}:{nonce}")
}
