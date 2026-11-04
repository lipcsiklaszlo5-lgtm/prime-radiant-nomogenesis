use near_sdk::{AccountId, env};

use crate::{
    Nomogenesis,
    capacity::{self, CapacityOwner},
    rescue::{
        MandateReleaseReason, RescueBundle, RescueBundlePhase, RescueCasePhase,
        RescueComponentOutcome, RescueJobPhase, RescueMandatePhase, RescueOfferPhase,
    },
    rescue_clearing::allocate_rescue_cost,
};

impl Nomogenesis {
    pub(crate) fn award_rescue_bundle_inner(&mut self, case_id: [u8; 32]) -> u64 {
        let pair = self
            .select_rescue_pair(case_id, env::block_timestamp())
            .expect("no fully funded rescue pair");
        let mut case = self
            .rescue_cases
            .get(&case_id)
            .cloned()
            .expect("missing rescue case");

        let bundle_id = self.next_rescue_bundle_id;
        let next_id = bundle_id.checked_add(1).expect("bundle ID overflow");
        assert!(
            self.rescue_bundles.get(&bundle_id).is_none(),
            "bundle ID reused"
        );
        assert_eq!(case.phase, RescueCasePhase::Open);
        assert!(case.awarded_bundle_id.is_none());

        let mut caps = Vec::new();
        for job_id in &pair.eligible_job_ids {
            let job = self.rescue_jobs.get(job_id).expect("missing rescue job");
            let mandate = self
                .rescue_mandates
                .get(job_id)
                .expect("missing rescue mandate");
            assert_eq!(job.phase, RescueJobPhase::Accepted);
            assert_eq!(job.case_id, case_id);
            assert_eq!(mandate.phase, RescueMandatePhase::Open);
            assert_eq!(mandate.job_id, *job_id);
            assert!(mandate.locked_bundle_id.is_none());
            assert!(mandate.locked_allocation.is_none());
            assert!(mandate.release_reason.is_none());
            caps.push((*job_id, mandate.held_principal));
        }

        let allocations =
            allocate_rescue_cost(&caps, pair.total_price).expect("invalid rescue allocation");

        let mut mandates = Vec::new();
        let mut credits: Vec<(AccountId, u128)> = Vec::new();
        let mut allocated_total = 0u128;

        for allocation in &allocations {
            let job = self
                .rescue_jobs
                .get(&allocation.job_id)
                .expect("missing allocated job");
            let mut mandate = self
                .rescue_mandates
                .get(&allocation.job_id)
                .cloned()
                .expect("missing allocated mandate");

            let refund = mandate
                .held_principal
                .checked_sub(allocation.amount)
                .expect("allocation exceeds cap");
            allocated_total = allocated_total
                .checked_add(allocation.amount)
                .expect("allocation total overflow");

            if refund > 0 {
                credits.push((job.buyer.clone(), refund));
            }

            mandate.held_principal = allocation.amount;
            if allocation.amount == 0 {
                mandate.phase = RescueMandatePhase::Released;
                mandate.release_reason = Some(MandateReleaseReason::ZeroAllocation);
                mandate.locked_bundle_id = None;
                mandate.locked_allocation = None;
            } else {
                mandate.phase = RescueMandatePhase::Locked;
                mandate.locked_bundle_id = Some(bundle_id);
                mandate.locked_allocation = Some(allocation.amount);
                mandate.release_reason = None;
            }
            mandates.push((allocation.job_id, mandate));
        }
        assert_eq!(allocated_total, pair.total_price, "allocation imbalance");

        let mut offers = Vec::new();
        let mut slots = Vec::new();

        for (component, offer_id) in pair.offer_ids.into_iter().enumerate() {
            let mut offer = self
                .rescue_offers
                .get(&offer_id)
                .cloned()
                .expect("missing selected offer");
            assert_eq!(offer.case_id, case_id);
            assert_eq!(usize::from(offer.component_index), component);
            assert_eq!(offer.phase, RescueOfferPhase::Open);
            assert!(offer.locked_bundle_id.is_none());
            assert!(offer.release_reason.is_none());

            let excess = offer
                .held_bond
                .checked_sub(pair.total_price)
                .expect("insufficient selected bond");
            let slot = capacity::capacity_key(&offer.provider, &offer.slot_id);
            assert!(self.capacity_locks.get(&slot).is_none(), "slot occupied");

            if excess > 0 {
                credits.push((offer.provider.clone(), excess));
            }
            offer.held_bond = pair.total_price;
            offer.phase = RescueOfferPhase::Locked;
            offer.locked_bundle_id = Some(bundle_id);
            offers.push((offer_id, offer));
            slots.push((slot, CapacityOwner::M3RescueOffer(offer_id)));
        }
        assert_ne!(slots[0].0, slots[1].0, "duplicate provider slot");

        let refund_total = credits
            .iter()
            .try_fold(0u128, |sum, (_, value)| sum.checked_add(*value))
            .expect("refund sum overflow");

        let next_escrow = self
            .rescue_escrow
            .checked_sub(refund_total)
            .expect("rescue escrow underflow");

        let bundle = RescueBundle {
            id: bundle_id,
            case_id,
            offer_ids: pair.offer_ids,
            total_price: pair.total_price,
            allocations: allocations
                .into_iter()
                .filter(|allocation| allocation.amount > 0)
                .collect(),
            recovery_deadline: case.recovery_deadline,
            phase: RescueBundlePhase::Awarded,
            component_outcomes: [
                RescueComponentOutcome::Pending,
                RescueComponentOutcome::Pending,
            ],
        };

        // All economic and record preflight checks precede mutation.
        // credit_accounts validates grouped account and total overflow
        // before writing any claimable.
        self.credit_accounts(&credits);

        for (job_id, mandate) in mandates {
            self.rescue_mandates.insert(job_id, mandate);
        }
        for (offer_id, offer) in offers {
            self.rescue_offers.insert(offer_id, offer);
        }
        for (slot, owner) in slots {
            self.capacity_locks.insert(slot, owner);
        }

        case.phase = RescueCasePhase::BundleAwarded;
        case.awarded_bundle_id = Some(bundle_id);
        self.rescue_cases.insert(case_id, case);
        self.rescue_bundles.insert(bundle_id, bundle);
        self.next_rescue_bundle_id = next_id;
        self.rescue_escrow = next_escrow;
        bundle_id
    }
}
