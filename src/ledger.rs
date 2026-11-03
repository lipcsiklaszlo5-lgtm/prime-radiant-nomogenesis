use std::collections::BTreeMap;

use near_sdk::AccountId;

use crate::{
    Nomogenesis,
    offer::OfferStatus,
    settlement::{Outcome, plan_selected, plan_unmatched},
    task::TaskPhase,
};

impl Nomogenesis {
    pub(crate) fn credit_accounts(&mut self, credits: &[(AccountId, u128)]) {
        let mut grouped = BTreeMap::<AccountId, u128>::new();

        for (account, amount) in credits {
            if *amount == 0 {
                continue;
            }

            let previous = grouped.get(account).copied().unwrap_or(0);
            grouped.insert(
                account.clone(),
                previous.checked_add(*amount).expect("credit overflow"),
            );
        }

        let mut delta = 0u128;
        let mut updates = Vec::new();

        for (account, amount) in grouped {
            delta = delta.checked_add(amount).expect("credit total overflow");

            let previous = self.claimables.get(&account).copied().unwrap_or(0);
            let updated = previous.checked_add(amount).expect("account overflow");

            updates.push((account, updated));
        }

        let total = self
            .claimable_total
            .checked_add(delta)
            .expect("claimable total overflow");

        for (account, balance) in updates {
            self.claimables.insert(account, balance);
        }

        self.claimable_total = total;
    }

    pub(crate) fn settle_funded_task(&mut self, task_id: u64) {
        let task = self.tasks.get(&task_id).expect("unknown task").clone();

        assert!(
            self.settled_tasks.get(&task_id).is_none(),
            "task already settled"
        );

        let deposit = self
            .task_deposits
            .get(&task_id)
            .expect("task has no economic funding")
            .clone();

        let outcome = match task.phase {
            TaskPhase::PrimaryProofAccepted => Some(Outcome::PrimaryProofAccepted),
            TaskPhase::ReserveProofAccepted => Some(Outcome::ReserveProofAccepted),
            TaskPhase::ReserveFailed => Some(Outcome::ReserveFailed),
            TaskPhase::UnactivatedExpired => Some(Outcome::UnactivatedExpired),
            TaskPhase::Cancelled | TaskPhase::UnmatchedExpired => None,
            _ => panic!("task is not terminal"),
        };

        let funding = deposit.budget().funding().expect("invalid budget");

        let mut collateral = 0u128;
        let mut offer_to_consume = None;
        let mut reserve_account = None;

        if outcome.is_some() {
            let offer_id = task.selected_offer.expect("missing selected offer");
            let offer = self.offers.get(&offer_id).expect("missing offer");

            assert_eq!(offer.task_id, task_id, "offer task mismatch");
            assert_eq!(offer.status, OfferStatus::Released, "offer not released");

            let locked = self
                .offer_deposits
                .get(&offer_id)
                .expect("missing locked collateral");

            collateral = locked.collateral;
            offer_to_consume = Some(offer_id);
            reserve_account = Some(offer.reserve.clone());
        } else {
            assert!(task.selected_offer.is_none(), "unexpected selected offer");
        }

        let credits = match outcome {
            Some(kind) => {
                plan_selected(deposit.budget(), collateral, kind).expect("invalid settlement plan")
            }
            None => plan_unmatched(deposit.budget()).expect("invalid unmatched settlement"),
        };

        let next_economic = self
            .economic_escrow
            .checked_sub(funding)
            .expect("economic escrow underflow");

        let next_collateral = self
            .collateral_escrow
            .checked_sub(collateral)
            .expect("collateral escrow underflow");

        let mut recipients = vec![
            (task.buyer.clone(), credits.buyer),
            (task.primary.clone(), credits.primary),
        ];

        if let Some(reserve) = reserve_account {
            recipients.push((reserve, credits.reserve));
        } else {
            assert_eq!(credits.reserve, 0);
        }

        if credits.keeper > 0 {
            recipients.push((
                task.backup_activator.clone().expect("missing keeper"),
                credits.keeper,
            ));
        }

        self.credit_accounts(&recipients);
        self.economic_escrow = next_economic;
        self.collateral_escrow = next_collateral;

        if let Some(offer_id) = offer_to_consume {
            self.offer_deposits.remove(&offer_id);
        }

        self.settled_tasks.insert(task_id, true);
    }

    pub(crate) fn refund_released_offer(&mut self, offer_id: u64) {
        let offer = self.offers.get(&offer_id).expect("unknown offer").clone();

        assert_eq!(offer.status, OfferStatus::Released, "offer not released");

        let task = self.tasks.get(&offer.task_id).expect("missing task");

        assert_ne!(
            task.selected_offer,
            Some(offer_id),
            "selected collateral cannot be refunded"
        );

        let deposit = self
            .offer_deposits
            .get(&offer_id)
            .expect("collateral already returned");

        let collateral = deposit.collateral;

        let remaining = self
            .collateral_escrow
            .checked_sub(collateral)
            .expect("collateral escrow underflow");

        self.credit_accounts(&[(offer.reserve.clone(), collateral)]);
        self.collateral_escrow = remaining;
        self.offer_deposits.remove(&offer_id);
    }
}
