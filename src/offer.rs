use near_sdk::{AccountId, near};

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OfferStatus {
    Available,
    Selected,
    Released,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Offer {
    pub id: u64,
    pub task_id: u64,
    pub reserve: AccountId,
    pub slot_id: String,
    pub expires_at: u64,
    pub status: OfferStatus,
}
