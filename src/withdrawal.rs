use near_sdk::{AccountId, Gas, NearToken, env, near};

use crate::Nomogenesis;

// Extra capacity for a pending payout record and callback state.
// This is a conservative interim guard, not final storage pricing.
const PAYOUT_STORAGE_BUFFER_BYTES: u128 = 2048;

#[near(serializers = [borsh])]
#[derive(Debug, Clone)]
pub struct PendingWithdrawal {
    pub owner: AccountId,
    pub amount: u128,
}

impl Nomogenesis {
    pub(crate) fn begin_withdrawal(&mut self, amount: u128) {
        let owner = env::predecessor_account_id();

        assert!(amount > 0, "zero withdrawal");

        let previous = self.claimables.get(&owner).copied().unwrap_or(0);
        let remaining = previous
            .checked_sub(amount)
            .expect("insufficient claimable balance");

        let new_claimable_total = self
            .claimable_total
            .checked_sub(amount)
            .expect("claimable total underflow");

        let new_pending_total = self
            .pending_total
            .checked_add(amount)
            .expect("pending total overflow");

        let next_id = self
            .next_withdrawal_id
            .checked_add(1)
            .expect("withdrawal ID overflow");

        // All economic liabilities, including already scheduled payouts.
        let obligations = [
            self.economic_escrow,
            self.collateral_escrow,
            new_claimable_total,
            new_pending_total,
            self.storage_reserves,
        ]
        .into_iter()
        .try_fold(0u128, |sum, value| sum.checked_add(value))
        .expect("total liabilities overflow");

        let guarded_bytes = (env::storage_usage() as u128)
            .checked_add(PAYOUT_STORAGE_BUFFER_BYTES)
            .expect("storage bytes overflow");

        let storage_stake = guarded_bytes
            .checked_mul(env::storage_byte_cost().as_yoctonear())
            .expect("storage cost overflow");

        let required_backing = obligations
            .checked_add(storage_stake)
            .expect("backing requirement overflow");

        assert!(
            env::account_balance().as_yoctonear() >= required_backing,
            "insufficient native NEAR backing"
        );

        let id = self.next_withdrawal_id;
        self.next_withdrawal_id = next_id;

        self.claimables.insert(owner.clone(), remaining);
        self.claimable_total = new_claimable_total;

        self.pending_withdrawals.insert(
            id,
            PendingWithdrawal {
                owner: owner.clone(),
                amount,
            },
        );

        self.pending_total = new_pending_total;

        let callback_args = near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({
            "withdrawal_id": id
        }))
        .expect("callback serialization failed");

        // Use stable NEAR host functions directly.
        // Avoid SDK Promise dispatch importing newer global-contract APIs.
        let payout = env::promise_batch_create(&owner);

        env::promise_batch_action_transfer(payout, NearToken::from_yoctonear(amount));

        let callback = env::promise_batch_then(payout, &env::current_account_id());

        env::promise_batch_action_function_call(
            callback,
            "on_withdraw_complete",
            &callback_args,
            NearToken::from_yoctonear(0),
            Gas::from_tgas(25),
        );

        env::promise_return(callback);
    }

    pub(crate) fn finish_withdrawal(&mut self, withdrawal_id: u64) {
        assert_eq!(
            env::predecessor_account_id(),
            env::current_account_id(),
            "private callback only"
        );

        assert_eq!(
            env::promise_results_count(),
            1,
            "expected one transfer result"
        );

        let Some(pending) = self.pending_withdrawals.get(&withdrawal_id).cloned() else {
            // Already finalized: no second restoration or payment.
            return;
        };

        let remaining_pending = self
            .pending_total
            .checked_sub(pending.amount)
            .expect("pending liability underflow");

        // A native NEAR transfer has an empty successful return value.
        let succeeded = env::promise_result_checked(0, 0).is_ok();

        if !succeeded {
            self.credit_accounts(&[(pending.owner.clone(), pending.amount)]);
        }

        self.pending_total = remaining_pending;
        self.pending_withdrawals.remove(&withdrawal_id);
    }
}
