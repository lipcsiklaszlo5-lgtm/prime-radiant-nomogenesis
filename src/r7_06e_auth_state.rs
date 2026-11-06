//! R7-06E/02 — isolated authorization state machine.
//!
//! This is NOT a NEAR entrypoint. `caller` is supplied
//! by a test harness, not authenticated by near-sdk.
//! No persistent contract storage or WASM ABI changes.

use std::collections::{BTreeMap, BTreeSet};
use sha2::{Digest, Sha256};

use crate::r7_06e_subset_model::{
    Approval, FundedJob, Preflight, Snapshot, DOMAIN,
    preflight,
};

pub const PLAN_DOMAIN: &str =
    "NOMOGENESIS/R7-06E/PLAN/V2";

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Phase {
    Open,
    Awarded,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Consent {
    pub approval: Approval,
    pub plan_hash: [u8; 32],
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AuthorizationState {
    pub snapshot: Snapshot,
    pub phase: Phase,
    pub consents: BTreeMap<u64, Consent>,
    pub used_nonces: BTreeSet<(String, u64)>,
    pub award_result: Option<Preflight>,
}

fn put_text(h: &mut Sha256, value: &str)
    -> Result<(), &'static str>
{
    if value.is_empty() || value.len() > 128 {
        return Err("invalid plan domain text");
    }

    let size = u32::try_from(value.len())
        .map_err(|_| "text length overflow")?;

    h.update(size.to_le_bytes());
    h.update(value.as_bytes());

    Ok(())
}

pub fn plan_hash(
    snapshot: &Snapshot,
    selected: &[u64],
) -> Result<[u8; 32], &'static str> {
    if selected.is_empty() || selected.len() > 6
        || selected.windows(2).any(|w| w[0] >= w[1])
    {
        return Err("invalid selected coalition");
    }

    let price = snapshot.providers[0].fee
        .checked_add(snapshot.providers[1].fee)
        .ok_or("offer price overflow")?;

    let mut h = Sha256::new();

    h.update(PLAN_DOMAIN.as_bytes());
    h.update([0u8]);
    h.update(snapshot.case_id);

    put_text(&mut h, &snapshot.chain)?;
    put_text(&mut h, &snapshot.contract)?;

    h.update(snapshot.bid_close.to_le_bytes());
    h.update(snapshot.award_close.to_le_bytes());

    h.update([selected.len() as u8]);

    for id in selected {
        h.update(id.to_le_bytes());
    }

    for provider in &snapshot.providers {
        h.update(provider.offer_id.to_le_bytes());
        h.update([provider.component]);
        put_text(&mut h, &provider.account)?;
        put_text(&mut h, &provider.slot)?;
        h.update(provider.fee.to_le_bytes());
    }

    h.update(price.to_le_bytes());

    let result = h.finalize();
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&result);

    Ok(hash)
}

impl AuthorizationState {
    pub fn new(snapshot: Snapshot)
        -> Result<Self, &'static str>
    {
        if !snapshot.approvals.is_empty()
            || !snapshot.selected_jobs.is_empty()
        {
            return Err("expected uncommitted authorization state");
        }

        if snapshot.jobs.is_empty()
            || snapshot.jobs.len() > 6
        {
            return Err("invalid funded job set");
        }

        let mut jobs = BTreeSet::new();
        let mut buyers = BTreeSet::new();

        for job in &snapshot.jobs {
            if !jobs.insert(job.id)
                || !buyers.insert(job.buyer.clone())
                || job.buyer.is_empty()
            {
                return Err("duplicate job or buyer");
            }
        }

        Ok(Self {
            used_nonces: snapshot.consumed_nonces.clone(),
            snapshot,
            phase: Phase::Open,
            consents: BTreeMap::new(),
            award_result: None,
        })
    }

    fn open_window(&self) -> Result<(), &'static str> {
        if self.phase != Phase::Open
            || self.snapshot.now < self.snapshot.bid_close
            || self.snapshot.now >= self.snapshot.award_close
        {
            return Err("authorization window closed");
        }

        Ok(())
    }

    fn job(&self, id: u64)
        -> Result<&FundedJob, &'static str>
    {
        self.snapshot.jobs.iter()
            .find(|j| j.id == id)
            .ok_or("unknown funded job")
    }

    pub fn authorize(
        &mut self,
        caller: &str,
        consent: Consent,
    ) -> Result<(), &'static str> {
        self.open_window()?;

        let a = &consent.approval;
        let job = self.job(a.job_id)?;

        if caller != job.buyer || a.buyer != job.buyer {
            return Err("wrong buyer identity");
        }

        if !job.accepted || !job.mandate_open {
            return Err("job not authorizable");
        }

        if a.domain != DOMAIN
            || a.case_id != self.snapshot.case_id
            || a.chain != self.snapshot.chain
            || a.contract != self.snapshot.contract
            || a.expires_at <= self.snapshot.now
            || a.expires_at > self.snapshot.award_close
        {
            return Err("wrong authorization scope");
        }

        if a.max_payment == 0
            || a.max_payment > job.held_cap
            || a.exact_payment == 0
            || a.exact_payment > a.max_payment
        {
            return Err("invalid payment authority");
        }

        let nonce = (caller.to_string(), a.nonce);

        if self.used_nonces.contains(&nonce) {
            return Err("nonce already used");
        }

        if self.consents.contains_key(&a.job_id) {
            return Err("buyer consent already registered");
        }

        // Commit only after all checks have passed.
        self.used_nonces.insert(nonce);
        self.consents.insert(a.job_id, consent);

        Ok(())
    }

    pub fn revoke(
        &mut self,
        caller: &str,
        job_id: u64,
    ) -> Result<(), &'static str> {
        self.open_window()?;

        let job = self.job(job_id)?;

        if caller != job.buyer {
            return Err("unauthorized revocation");
        }

        if !self.consents.contains_key(&job_id) {
            return Err("no active buyer consent");
        }

        self.consents.remove(&job_id);

        // Keep consumed nonces even after withdrawal.
        Ok(())
    }

    pub fn award(
        &mut self,
        selected: Vec<u64>,
        expected_plan: [u8; 32],
    ) -> Result<&Preflight, &'static str> {
        self.open_window()?;

        let actual_plan = plan_hash(
            &self.snapshot,
            &selected,
        )?;

        if actual_plan != expected_plan {
            return Err("plan hash mismatch");
        }

        let mut staged = self.snapshot.clone();
        staged.selected_jobs = selected.clone();
        staged.approvals.clear();

        for id in &selected {
            let consent = self.consents.get(id)
                .ok_or("missing buyer consent")?;

            if consent.plan_hash != actual_plan {
                return Err("buyer consent for different plan");
            }

            staged.approvals.push(
                consent.approval.clone()
            );
        }

        // This snapshot contains only previously finalized
        // nonces. Current active consents are checked above.
        let outcome = preflight(&staged)?;

        staged.escrow_total = outcome.escrow_after_refunds;
        staged.claimable_total =
            outcome.claimables_after_refunds;

        staged.consumed_nonces = self.used_nonces.clone();

        // All validations are complete.
        // In the real contract this transition must be
        // implemented within a single NEAR transaction.
        self.snapshot = staged;
        self.award_result = Some(outcome);
        self.phase = Phase::Awarded;

        Ok(self.award_result.as_ref().unwrap())
    }
}
