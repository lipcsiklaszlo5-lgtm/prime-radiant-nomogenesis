//! R7-06E/01 — pure economic authorization preflight.
//!
//! This module is deliberately NOT imported by src/lib.rs.
//! Approval records are trusted model inputs, NOT verified
//! NEAR signatures. No persistent state is changed.

use std::collections::{BTreeMap, BTreeSet};

use crate::rescue_market_model::{Allocation, Mandate, allocate_cost};

pub const DOMAIN: &str = "NOMOGENESIS/R7-06E/SUBSET/V1";
pub const MAX_JOBS: usize = 6;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FundedJob {
    pub id: u64,
    pub buyer: String,
    pub held_cap: u128,
    pub accepted: bool,
    pub mandate_open: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Approval {
    pub domain: String,
    pub case_id: [u8; 32],
    pub chain: String,
    pub contract: String,
    pub job_id: u64,
    pub buyer: String,
    pub nonce: u64,
    pub expires_at: u64,
    pub max_payment: u128,
    pub exact_payment: u128,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Provider {
    pub offer_id: u64,
    pub component: u8,
    pub account: String,
    pub slot: String,
    pub fee: u128,
    pub held_bond: u128,
    pub open: bool,
    pub slot_free: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Snapshot {
    pub case_id: [u8; 32],
    pub chain: String,
    pub contract: String,
    pub now: u64,
    pub bid_close: u64,
    pub award_close: u64,
    pub escrow_total: u128,
    pub claimable_total: u128,
    pub jobs: Vec<FundedJob>,
    pub selected_jobs: Vec<u64>,
    pub approvals: Vec<Approval>,
    pub consumed_nonces: BTreeSet<(String, u64)>,
    pub providers: [Provider; 2],
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Refund {
    pub job_id: u64,
    pub buyer: String,
    pub amount: u128,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProviderRefund {
    pub offer_id: u64,
    pub account: String,
    pub amount: u128,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Preflight {
    pub price: u128,
    pub allocations: Vec<Allocation>,
    pub buyer_refunds: Vec<Refund>,
    pub provider_refunds: Vec<ProviderRefund>,
    pub excluded_jobs: Vec<u64>,
    pub total_refund: u128,
    pub locked_recovery_principal: u128,
    pub modelled_liabilities_before: u128,
    pub escrow_after_refunds: u128,
    pub claimables_after_refunds: u128,
    pub contract_extension_required: bool,
    pub real_signature_verification_performed: bool,
    pub executable_on_deployed_m3: bool,
}

fn checked_sum(
    values: impl IntoIterator<Item = u128>,
) -> Result<u128, &'static str> {
    values.into_iter().try_fold(0u128, |sum, x| {
        sum.checked_add(x).ok_or("amount overflow")
    })
}

pub fn preflight(s: &Snapshot) -> Result<Preflight, &'static str> {
    if s.chain.is_empty() || s.contract.is_empty()
        || s.case_id == [0; 32]
    {
        return Err("invalid contract domain");
    }

    if s.bid_close >= s.award_close
        || s.now < s.bid_close
        || s.now >= s.award_close
    {
        return Err("outside award window");
    }

    if s.jobs.is_empty() || s.jobs.len() > MAX_JOBS
        || s.selected_jobs.is_empty()
        || s.selected_jobs.len() > MAX_JOBS
    {
        return Err("invalid sponsor count");
    }

    if s.selected_jobs.windows(2).any(|w| w[0] >= w[1]) {
        return Err("selected jobs must be sorted and unique");
    }

    let mut jobs = BTreeMap::new();

    for job in &s.jobs {
        if job.buyer.is_empty()
            || !job.accepted
            || !job.mandate_open
            || job.held_cap == 0
        {
            return Err("invalid eligible funded job");
        }

        if jobs.insert(job.id, job).is_some() {
            return Err("duplicate funded job");
        }
    }

    let a = &s.providers[0];
    let b = &s.providers[1];

    if a.component != 0 || b.component != 1
        || a.offer_id == b.offer_id
        || a.account.is_empty() || b.account.is_empty()
        || a.account == b.account
        || a.slot.is_empty() || b.slot.is_empty()
        || !a.open || !b.open
        || !a.slot_free || !b.slot_free
        || a.fee == 0 || b.fee == 0
    {
        return Err("invalid provider pair");
    }

    let price = a.fee.checked_add(b.fee)
        .ok_or("provider fee overflow")?;

    if a.held_bond < price || b.held_bond < price {
        return Err("insufficient provider bond");
    }

    let selected: BTreeSet<u64> =
        s.selected_jobs.iter().copied().collect();

    if selected.iter().any(|id| !jobs.contains_key(id)) {
        return Err("selected job is not funded");
    }

    if s.approvals.len() != selected.len() {
        return Err("missing or extra approval");
    }

    let mut approvals = BTreeMap::new();
    let mut seen_nonces = s.consumed_nonces.clone();

    for approval in &s.approvals {
        if approval.domain != DOMAIN
            || approval.case_id != s.case_id
            || approval.chain != s.chain
            || approval.contract != s.contract
            || approval.expires_at <= s.now
            || approval.expires_at > s.award_close
        {
            return Err("invalid approval scope or expiry");
        }

        if !selected.contains(&approval.job_id) {
            return Err("approval for unselected job");
        }

        let job = jobs.get(&approval.job_id)
            .ok_or("approval references missing job")?;

        if job.buyer != approval.buyer
            || approval.max_payment == 0
            || approval.max_payment > job.held_cap
            || approval.exact_payment > approval.max_payment
        {
            return Err("approval exceeds buyer authority");
        }

        if !seen_nonces.insert((
            approval.buyer.clone(),
            approval.nonce,
        )) {
            return Err("consumed or duplicate nonce");
        }

        if approvals.insert(approval.job_id, approval).is_some() {
            return Err("duplicate approval");
        }
    }

    let mandates: Vec<Mandate> = s.selected_jobs
        .iter()
        .map(|id| {
            let approval = approvals[id];
            Mandate {
                job_id: *id,
                cap: approval.max_payment,
            }
        })
        .collect();

    // Reuse the EXISTING pure Rust M3 allocation algorithm.
    let allocations = allocate_cost(&mandates, price)?;

    for allocation in &allocations {
        if allocation.amount == 0 {
            return Err("zero authorized payment");
        }

        if allocation.amount
            != approvals[&allocation.job_id].exact_payment
        {
            return Err("payment differs from buyer approval");
        }
    }

    let allocation_map: BTreeMap<u64, u128> = allocations
        .iter()
        .map(|a| (a.job_id, a.amount))
        .collect();

    let mut buyer_refunds = Vec::new();
    let mut excluded_jobs = Vec::new();

    for (id, job) in &jobs {
        let payment = allocation_map.get(id).copied()
            .unwrap_or(0);

        let refund = job.held_cap.checked_sub(payment)
            .ok_or("payment exceeds held cap")?;

        if !selected.contains(id) {
            excluded_jobs.push(*id);
        }

        if refund > 0 {
            buyer_refunds.push(Refund {
                job_id: *id,
                buyer: job.buyer.clone(),
                amount: refund,
            });
        }
    }

    let provider_refunds = [a, b]
        .iter()
        .filter_map(|p| {
            let excess = p.held_bond - price;

            (excess > 0).then(|| ProviderRefund {
                offer_id: p.offer_id,
                account: p.account.clone(),
                amount: excess,
            })
        })
        .collect::<Vec<_>>();

    let total_refund = checked_sum(
        buyer_refunds.iter().map(|r| r.amount)
            .chain(provider_refunds.iter().map(|r| r.amount)),
    )?;

    let initial_liabilities = checked_sum(
        jobs.values().map(|j| j.held_cap)
            .chain([a.held_bond, b.held_bond]),
    )?;

    let locked = price.checked_mul(3)
        .ok_or("locked principal overflow")?;

    if initial_liabilities != locked.checked_add(total_refund)
        .ok_or("liability conservation overflow")?
    {
        return Err("liability conservation failed");
    }

    if s.escrow_total < initial_liabilities {
        return Err("insufficient modelled escrow backing");
    }

    let escrow_after_refunds = s.escrow_total
        .checked_sub(total_refund)
        .ok_or("escrow underflow")?;

    let claimables_after_refunds = s.claimable_total
        .checked_add(total_refund)
        .ok_or("claimable overflow")?;

    Ok(Preflight {
        price,
        allocations,
        buyer_refunds,
        provider_refunds,
        excluded_jobs,
        total_refund,
        locked_recovery_principal: locked,
        modelled_liabilities_before: initial_liabilities,
        escrow_after_refunds,
        claimables_after_refunds,
        contract_extension_required: true,
        real_signature_verification_performed: false,
        executable_on_deployed_m3: false,
    })
}
