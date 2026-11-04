use near_sdk::{AccountId, near};

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CapacityOwner {
    M2Offer(u64),
    M3RescueOffer(u64),
}

pub fn capacity_key(provider: &AccountId, slot_id: &str) -> String {
    format!("{provider}|{slot_id}")
}
