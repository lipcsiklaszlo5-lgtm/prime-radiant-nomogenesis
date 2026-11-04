//! M3-R4-04: authenticated worker-result settlement.
//! No recipient, reward or outcome can be supplied by caller.

use near_sdk::env;

use crate::{
    Nomogenesis,
    rescue::{RescueBundlePhase, RescueCasePhase, RescueComponentOutcome, RescueJobPhase},
    rescue_proof::component_metadata_sibling,
    rescue_worker_result::verify_worker_result,
};

impl Nomogenesis {
    pub(crate) fn complete_rescue_job_inner(&mut self, job_id: u64, result_payload: Vec<u8>) {
        let mut job = self
            .rescue_jobs
            .get(&job_id)
            .cloned()
            .expect("unknown rescue job");

        assert_eq!(job.id, job_id, "job ID mismatch");
        assert_eq!(
            env::predecessor_account_id(),
            job.worker,
            "not designated rescue worker"
        );
        assert_eq!(
            job.phase,
            RescueJobPhase::Accepted,
            "rescue job is not active"
        );
        assert!(
            env::block_timestamp() < job.final_deadline,
            "final job deadline reached"
        );
        assert!(
            job.worker_reward > 0 && job.held_worker_reward == job.worker_reward,
            "invalid held worker reward"
        );

        let case = self
            .rescue_cases
            .get(&job.case_id)
            .expect("missing rescue case");

        assert_eq!(case.id, job.case_id);
        assert!(
            case.job_ids.contains(&job_id),
            "job absent from rescue case"
        );
        assert_eq!(
            case.phase,
            RescueCasePhase::Closed,
            "recovery is not terminal"
        );
        assert!(
            job.final_deadline > case.recovery_deadline,
            "invalid job timeline"
        );

        let bundle_id = case
            .awarded_bundle_id
            .expect("case has no awarded recovery bundle");

        let bundle = self
            .rescue_bundles
            .get(&bundle_id)
            .expect("missing awarded rescue bundle");

        assert_eq!(bundle.id, bundle_id);
        assert_eq!(bundle.case_id, job.case_id);
        assert_eq!(bundle.recovery_deadline, case.recovery_deadline);
        assert_eq!(
            bundle.phase,
            RescueBundlePhase::SettledSuccess,
            "recovery was not fully successful"
        );
        assert_eq!(
            bundle.component_outcomes,
            [
                RescueComponentOutcome::Proven,
                RescueComponentOutcome::Proven
            ],
            "incomplete recovery components"
        );

        // The proof-acceptance path already authenticated
        // both payloads. Reconfirm immutable commitments
        // before worker reward release.
        for index in 0..2 {
            let payload = case.resolved_payloads[index]
                .as_ref()
                .expect("missing authenticated component");

            let sibling = component_metadata_sibling(index as u8).to_vec();

            assert!(
                crate::verify_merkle(
                    &case.component_commitments[index],
                    1,
                    0,
                    payload,
                    &[sibling],
                ),
                "stored component commitment mismatch"
            );
        }

        let quantities = case.resolved_payloads[0]
            .as_deref()
            .expect("missing quantities");

        let prices = case.resolved_payloads[1]
            .as_deref()
            .expect("missing prices");

        verify_worker_result(
            &job.case_id,
            job_id,
            job.threshold,
            &job.result_commitment,
            quantities,
            prices,
            &result_payload,
        )
        .expect("invalid authenticated worker result");

        // Validate escrow before any persistent mutation.
        let reward = job.held_worker_reward;
        let next_escrow = self
            .rescue_escrow
            .checked_sub(reward)
            .expect("worker reward escrow underflow");

        // The shared ledger validates recipient and
        // aggregate claimable overflow before its writes.
        self.credit_accounts(&[(job.worker.clone(), reward)]);

        job.held_worker_reward = 0;
        job.phase = RescueJobPhase::Completed;

        self.rescue_jobs.insert(job_id, job);
        self.rescue_escrow = next_escrow;
    }
}
