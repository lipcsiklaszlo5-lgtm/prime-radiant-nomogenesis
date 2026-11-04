//! M3-R4-03: authenticated, terminal rescue accounting.
//!
//! Preflight all stored economic claims, immutable ownership,
//! proof outcomes, deadlines, typed slots and aggregate credits
//! before the first persistent write.

use near_sdk::{AccountId, env};

use crate::{
    Nomogenesis,
    capacity::{self, CapacityOwner},
    rescue::{
        MandateReleaseReason, RescueBundlePhase, RescueCasePhase, RescueComponentOutcome,
        RescueJobPhase, RescueMandatePhase, RescueOfferPhase,
    },
    rescue_settlement::plan_rescue_settlement,
};

impl Nomogenesis {
    pub(crate) fn settle_rescue_bundle_inner(&mut self, bundle_id: u64) {
        let mut bundle = self
            .rescue_bundles
            .get(&bundle_id)
            .cloned()
            .expect("unknown rescue bundle");

        assert_eq!(bundle.id, bundle_id, "bundle ID mismatch");
        assert_eq!(
            bundle.phase,
            RescueBundlePhase::Awarded,
            "bundle already terminal"
        );

        let now = env::block_timestamp();
        let mut outcomes = bundle.component_outcomes.clone();

        let both_proven = outcomes
            .iter()
            .all(|outcome| *outcome == RescueComponentOutcome::Proven);

        assert!(
            both_proven || now >= bundle.recovery_deadline,
            "recovery deadline not reached"
        );

        for outcome in &mut outcomes {
            match outcome {
                RescueComponentOutcome::Proven => {}
                RescueComponentOutcome::Pending => {
                    *outcome = RescueComponentOutcome::Defaulted;
                }
                RescueComponentOutcome::Defaulted => {
                    panic!("premature default state");
                }
            }
        }

        let mut case = self
            .rescue_cases
            .get(&bundle.case_id)
            .cloned()
            .expect("missing rescue case");

        assert_eq!(case.id, bundle.case_id, "case ID mismatch");
        assert_eq!(case.phase, RescueCasePhase::BundleAwarded);
        assert_eq!(case.awarded_bundle_id, Some(bundle_id));
        assert_eq!(case.recovery_deadline, bundle.recovery_deadline);

        let mut offers = Vec::with_capacity(2);
        let mut slot_keys = Vec::with_capacity(2);

        for (index, offer_id) in bundle.offer_ids.iter().enumerate() {
            let offer = self
                .rescue_offers
                .get(offer_id)
                .cloned()
                .expect("missing selected offer");

            assert_eq!(offer.id, *offer_id);
            assert_eq!(offer.case_id, bundle.case_id);
            assert_eq!(usize::from(offer.component_index), index);
            assert_eq!(offer.locked_bundle_id, Some(bundle_id));
            assert!(offer.release_reason.is_none());
            assert!(offer.bond_capacity >= bundle.total_price);

            let prior = &bundle.component_outcomes[index];

            match prior {
                RescueComponentOutcome::Proven => {
                    assert_eq!(offer.phase, RescueOfferPhase::Proven);
                    assert!(
                        case.resolved_payloads[index].is_some(),
                        "proven component has no evidence"
                    );
                }
                RescueComponentOutcome::Pending => {
                    assert_eq!(offer.phase, RescueOfferPhase::Locked);
                    assert!(
                        case.resolved_payloads[index].is_none(),
                        "pending component has unexpected evidence"
                    );
                }
                RescueComponentOutcome::Defaulted => {
                    panic!("already defaulted before settlement");
                }
            }

            let key = capacity::capacity_key(&offer.provider, &offer.slot_id);

            assert_eq!(
                self.capacity_locks.get(&key),
                Some(&CapacityOwner::M3RescueOffer(*offer_id)),
                "typed capacity owner mismatch"
            );

            offers.push(offer);
            slot_keys.push(key);
        }

        assert_ne!(
            bundle.offer_ids[0], bundle.offer_ids[1],
            "duplicate selected offer"
        );
        assert_ne!(
            offers[0].provider, offers[1].provider,
            "duplicate selected provider"
        );
        assert_ne!(slot_keys[0], slot_keys[1], "duplicate selected slot");

        let plan = plan_rescue_settlement(
            bundle.total_price,
            [offers[0].fee, offers[1].fee],
            [offers[0].held_bond, offers[1].held_bond],
            &bundle.allocations,
            outcomes.clone(),
        )
        .expect("invalid terminal economic plan");

        // The existing ledger may also contain M2 liabilities.
        // Check rescue backing separately before any credit.
        let next_escrow = self
            .rescue_escrow
            .checked_sub(plan.total_credit)
            .expect("insufficient rescue escrow");

        let mut mandates = Vec::with_capacity(bundle.allocations.len());

        for allocation in &bundle.allocations {
            assert!(
                case.job_ids.contains(&allocation.job_id),
                "sponsor absent from case"
            );

            let job = self
                .rescue_jobs
                .get(&allocation.job_id)
                .expect("missing sponsor job");

            assert_eq!(job.id, allocation.job_id);
            assert_eq!(job.case_id, bundle.case_id);
            assert!(
                matches!(
                    job.phase,
                    RescueJobPhase::Accepted | RescueJobPhase::Completed | RescueJobPhase::Expired
                ),
                "invalid sponsor job state"
            );

            let mandate = self
                .rescue_mandates
                .get(&allocation.job_id)
                .cloned()
                .expect("missing sponsor mandate");

            assert_eq!(mandate.job_id, allocation.job_id);
            assert_eq!(mandate.phase, RescueMandatePhase::Locked);
            assert_eq!(mandate.locked_bundle_id, Some(bundle_id));
            assert_eq!(mandate.locked_allocation, Some(allocation.amount));
            assert_eq!(mandate.held_principal, allocation.amount);
            assert!(mandate.original_cap >= allocation.amount);
            assert!(mandate.release_reason.is_none());

            mandates.push(mandate);
        }

        // Resolve recipients from immutable on-chain records.
        // Callers cannot supply accounts or amounts.
        let mut credits: Vec<(AccountId, u128)> = Vec::new();

        for (index, amount) in plan.provider_credits.iter().enumerate() {
            if *amount > 0 {
                credits.push((offers[index].provider.clone(), *amount));
            }
        }

        for credit in &plan.sponsor_credits {
            if credit.amount > 0 {
                let job = self
                    .rescue_jobs
                    .get(&credit.job_id)
                    .expect("missing credit recipient");
                credits.push((job.buyer.clone(), credit.amount));
            }
        }

        // credit_accounts internally validates grouped account
        // balances and aggregate overflow before its own writes.
        // It must remain the FIRST persistent mutation.
        self.credit_accounts(&credits);

        for mut mandate in mandates {
            mandate.held_principal = 0;
            mandate.phase = RescueMandatePhase::Released;
            mandate.locked_bundle_id = None;
            mandate.locked_allocation = None;
            mandate.release_reason = Some(MandateReleaseReason::Settled);
            self.rescue_mandates.insert(mandate.job_id, mandate);
        }

        for (index, mut offer) in offers.into_iter().enumerate() {
            offer.held_bond = 0;
            offer.phase = match outcomes[index] {
                RescueComponentOutcome::Proven => RescueOfferPhase::Proven,
                RescueComponentOutcome::Defaulted => RescueOfferPhase::Defaulted,
                RescueComponentOutcome::Pending => {
                    unreachable!("terminal plan contains pending outcome")
                }
            };
            // Keep locked_bundle_id for historical provenance.
            self.rescue_offers.insert(offer.id, offer);
        }

        for key in slot_keys {
            self.capacity_locks.remove(&key);
        }

        bundle.component_outcomes = outcomes;
        bundle.phase = if plan.default_count == 0 {
            RescueBundlePhase::SettledSuccess
        } else {
            RescueBundlePhase::SettledDefault
        };

        case.phase = RescueCasePhase::Closed;

        self.rescue_cases.insert(bundle.case_id, case);
        self.rescue_bundles.insert(bundle_id, bundle);
        self.rescue_escrow = next_escrow;
    }
}
