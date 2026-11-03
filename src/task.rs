use near_sdk::{AccountId, near};

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaskPhase {
    SeekingPrimary,
    SeekingReserve,
    OfferSelected,
    SelectionExpired,
    PrimaryProofAccepted,
    BackupActive,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone)]
pub struct Task {
    pub id: u64,
    pub buyer: AccountId,
    pub primary: AccountId,
    pub root: Vec<u8>,
    pub height: u8,
    pub index: u64,
    pub primary_deadline: u64,
    pub reserve_deadline: u64,
    pub phase: TaskPhase,
    pub selected_offer: Option<u64>,
    pub backup_activator: Option<AccountId>,
}
