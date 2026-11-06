use near_sdk::{env, json_types::U128, near};
use sha2::{Digest, Sha256};

use crate::{
    Nomogenesis,
    rescue::{self, RescueJobPhase, RescueMandatePhase},
    rescue_clearing::allocate_rescue_cost,
};

pub const PLAN_DOMAIN: &[u8] = b"NOMOGENESIS/R7-06E/PLAN/V3";

#[near(serializers = [json])]
pub struct CoalitionPaymentView {
    pub job_id: u64,
    pub amount: U128,
}

#[near(serializers = [json])]
pub struct CoalitionPlanView {
    pub plan_hash: Vec<u8>,
    pub selected_job_ids: Vec<u64>,
    pub offer_ids: [u64; 2],
    pub total_price: U128,
    pub payments: Vec<CoalitionPaymentView>,
}

fn hash_text(hash: &mut Sha256, text: &str) {
    let length = u32::try_from(text.len()).expect("plan text length overflow");
    hash.update(length.to_le_bytes());
    hash.update(text.as_bytes());
}

impl Nomogenesis {
    pub(crate) fn r7_v2_plan_for_jobs(
        &self,
        case_id: [u8; 32],
        selected: Vec<u64>,
    ) -> CoalitionPlanView {
        assert!(
            !selected.is_empty() && selected.len() <= rescue::MAX_RESCUE_JOBS,
            "invalid selected coalition size"
        );
        assert!(
            selected.windows(2).all(|ids| ids[0] < ids[1]),
            "selected job IDs must be sorted and unique"
        );

        let now = env::block_timestamp();
        let pair = self
            .select_r7_v2_pair(case_id, now, &selected)
            .expect("no funded provider pair for coalition");

        assert_eq!(
            pair.eligible_job_ids, selected,
            "selected jobs are not all funded and accepted"
        );

        let case = self
            .rescue_cases
            .get(&case_id)
            .expect("missing rescue case");

        let mut caps = Vec::new();
        for job_id in &selected {
            let job = self.rescue_jobs.get(job_id).expect("missing selected job");

            let mandate = self
                .rescue_mandates
                .get(job_id)
                .expect("missing selected mandate");

            assert_eq!(job.case_id, case_id);
            assert_eq!(job.phase, RescueJobPhase::Accepted);
            assert_eq!(mandate.phase, RescueMandatePhase::Open);
            assert!(mandate.held_principal > 0);

            caps.push((*job_id, mandate.held_principal));
        }

        let allocations =
            allocate_rescue_cost(&caps, pair.total_price).expect("selected allocation failed");

        assert!(
            allocations.iter().all(|a| a.amount > 0),
            "selected buyer has zero payment"
        );

        let mut hash = Sha256::new();
        hash.update(PLAN_DOMAIN);
        hash.update([0u8]);

        hash_text(&mut hash, env::current_account_id().as_str());

        hash.update(case_id);
        hash.update(case.bid_close.to_le_bytes());
        hash.update(case.award_close.to_le_bytes());
        hash.update(case.recovery_deadline.to_le_bytes());

        hash.update([selected.len() as u8]);

        for job_id in &selected {
            let job = self.rescue_jobs.get(job_id).expect("selected job missing");

            let mandate = self
                .rescue_mandates
                .get(job_id)
                .expect("selected mandate missing");

            hash.update(job_id.to_le_bytes());
            hash_text(&mut hash, job.buyer.as_str());
            hash_text(&mut hash, job.worker.as_str());
            hash.update(mandate.held_principal.to_le_bytes());
        }

        for (component, offer_id) in pair.offer_ids.iter().enumerate() {
            let offer = self
                .rescue_offers
                .get(offer_id)
                .expect("selected provider missing");

            assert_eq!(usize::from(offer.component_index), component,);

            hash.update(offer_id.to_le_bytes());
            hash.update([component as u8]);
            hash_text(&mut hash, offer.provider.as_str());
            hash_text(&mut hash, &offer.slot_id);
            hash.update(offer.fee.to_le_bytes());
            hash.update(offer.held_bond.to_le_bytes());
        }

        hash.update(pair.total_price.to_le_bytes());

        for allocation in &allocations {
            hash.update(allocation.job_id.to_le_bytes());
            hash.update(allocation.amount.to_le_bytes());
        }

        let digest = hash.finalize();

        CoalitionPlanView {
            plan_hash: digest.to_vec(),
            selected_job_ids: selected,
            offer_ids: pair.offer_ids,
            total_price: U128(pair.total_price),
            payments: allocations
                .into_iter()
                .map(|a| CoalitionPaymentView {
                    job_id: a.job_id,
                    amount: U128(a.amount),
                })
                .collect(),
        }
    }
}

impl Nomogenesis {
    pub(crate) fn r7_v2_verified_plan(
        &self,
        case_id: [u8; 32],
        selected: Vec<u64>,
        expected_hash: Vec<u8>,
    ) -> CoalitionPlanView {
        let expected: [u8; 32] = expected_hash
            .try_into()
            .expect("expected plan hash must be 32 bytes");

        let plan = self.r7_v2_plan_for_jobs(case_id, selected);

        assert_eq!(
            plan.plan_hash.as_slice(),
            expected.as_slice(),
            "canonical plan hash mismatch"
        );

        let now = env::block_timestamp();
        let case = self
            .rescue_cases
            .get(&case_id)
            .expect("missing rescue case");

        for payment in &plan.payments {
            let consent = self
                .r7_v2_consents
                .get(&payment.job_id)
                .expect("selected buyer has no active consent");

            let job = self
                .rescue_jobs
                .get(&payment.job_id)
                .expect("selected funded job missing");

            let mandate = self
                .rescue_mandates
                .get(&payment.job_id)
                .expect("selected funded mandate missing");

            assert_eq!(consent.case_id, case_id, "consent case mismatch");
            assert_eq!(
                consent.buyer, job.buyer,
                "consent is not owned by funded buyer"
            );
            assert_eq!(consent.plan_hash, expected, "consent plan mismatch");
            assert!(
                consent.expires_at > now && consent.expires_at <= case.award_close,
                "buyer consent expired"
            );

            assert!(
                consent.max_payment > 0 && consent.max_payment <= mandate.held_principal,
                "consent exceeds funded mandate"
            );
            assert_eq!(
                consent.exact_payment, payment.amount.0,
                "allocation differs from exact consent"
            );
            assert!(
                consent.exact_payment <= consent.max_payment,
                "allocation exceeds consent maximum"
            );

            let nonce = crate::r7_v2_consent::nonce_key(&job.buyer, consent.nonce);
            assert_eq!(
                self.r7_v2_nonces.get(&nonce).copied(),
                Some(true),
                "consent nonce not recorded"
            );
        }

        plan
    }
}
