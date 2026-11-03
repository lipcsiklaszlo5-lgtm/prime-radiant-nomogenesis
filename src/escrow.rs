use crate::settlement::Budget;
use near_sdk::{env, near};

// Conservative provisional storage reserve per funded record.
// Exact accounting and refunds are a later M2 gate.
const RESERVED_BYTES: u128 = 2048;

#[near(serializers = [borsh])]
#[derive(Debug, Clone)]
pub struct TaskDeposit {
    pub primary_reward: u128,
    pub reserve_reward: u128,
    pub option_premium: u128,
    pub keeper_bounty: u128,
    pub storage_reserve: u128,
}

impl TaskDeposit {
    pub fn budget(&self) -> Budget {
        Budget {
            primary_reward: self.primary_reward,
            reserve_reward: self.reserve_reward,
            option_premium: self.option_premium,
            keeper_bounty: self.keeper_bounty,
        }
    }
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone)]
pub struct OfferDeposit {
    pub collateral: u128,
    pub storage_reserve: u128,
}

pub fn reserve_cost() -> u128 {
    env::storage_byte_cost()
        .as_yoctonear()
        .checked_mul(RESERVED_BYTES)
        .expect("storage reserve overflow")
}
