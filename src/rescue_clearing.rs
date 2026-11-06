use std::collections::BTreeSet;

use crate::{Nomogenesis, capacity, rescue};

pub(crate) struct RescuePairPlan {
    pub offer_ids: [u64; 2],
    pub total_price: u128,
    pub eligible_job_ids: Vec<u64>,
    pub eligible_cap_total: u128,
}

pub(crate) fn allocate_rescue_cost(
    caps: &[(u64, u128)],
    price: u128,
) -> Result<Vec<rescue::RescueAllocation>, &'static str> {
    if caps.is_empty() || price == 0 {
        return Err("empty sponsors or zero price");
    }
    if caps.len() > rescue::MAX_RESCUE_JOBS {
        return Err("too many sponsors");
    }

    let mut rows = caps.to_vec();
    rows.sort_unstable_by_key(|row| row.0);
    if rows.windows(2).any(|pair| pair[0].0 == pair[1].0) {
        return Err("duplicate job ID");
    }

    let mut cap_total = 0u128;
    for (_, cap) in &rows {
        if *cap == 0 {
            return Err("zero rescue cap");
        }
        cap_total = cap_total.checked_add(*cap).ok_or("cap overflow")?;
    }
    if cap_total < price {
        return Err("insufficient caps");
    }

    let mut amounts = vec![0u128; rows.len()];
    let mut remaining = price;
    while remaining > 0 {
        let active: Vec<usize> = amounts
            .iter()
            .enumerate()
            .filter_map(|(i, amount)| (*amount < rows[i].1).then_some(i))
            .collect();
        if active.is_empty() {
            return Err("insufficient caps");
        }

        let count = active.len() as u128;
        let share = remaining / count;
        let remainder = (remaining % count) as usize;
        let mut paid = 0u128;
        for (rank, i) in active.into_iter().enumerate() {
            let requested = share
                .checked_add(u128::from(rank < remainder))
                .ok_or("allocation overflow")?;
            let amount = requested.min(rows[i].1 - amounts[i]);
            amounts[i] = amounts[i]
                .checked_add(amount)
                .ok_or("allocation overflow")?;
            remaining = remaining
                .checked_sub(amount)
                .ok_or("allocation invariant")?;
            paid = paid.checked_add(amount).ok_or("allocation overflow")?;
        }
        if paid == 0 {
            return Err("allocation made no progress");
        }
    }

    Ok(rows
        .into_iter()
        .zip(amounts)
        .map(|((job_id, _), amount)| rescue::RescueAllocation { job_id, amount })
        .collect())
}

impl Nomogenesis {
    pub(crate) fn select_rescue_pair(&self, case_id: [u8; 32], now: u64) -> Option<RescuePairPlan> {
        self.select_rescue_pair_with_jobs(case_id, now, None)
    }

    #[cfg(feature = "r7-v2")]
    pub(crate) fn select_r7_v2_pair(
        &self,
        case_id: [u8; 32],
        now: u64,
        jobs: &[u64],
    ) -> Option<RescuePairPlan> {
        self.select_rescue_pair_with_jobs(case_id, now, Some(jobs))
    }

    fn select_rescue_pair_with_jobs(
        &self,
        case_id: [u8; 32],
        now: u64,
        selected: Option<&[u64]>,
    ) -> Option<RescuePairPlan> {
        let case = self
            .rescue_cases
            .get(&case_id)
            .expect("unknown rescue case");
        assert_eq!(
            case.phase,
            rescue::RescueCasePhase::Open,
            "case is not open"
        );
        assert!(case.awarded_bundle_id.is_none(), "case already awarded");
        assert!(
            now >= case.bid_close && now < case.award_close,
            "outside award window"
        );
        assert!(now < case.recovery_deadline, "recovery deadline reached");
        assert!(
            case.job_ids.len() <= rescue::MAX_RESCUE_JOBS,
            "case jobs exceed limit"
        );
        assert!(
            case.offer_ids.len() <= rescue::MAX_RESCUE_OFFERS,
            "case offers exceed limit"
        );

        let mut eligible_job_ids = Vec::new();
        let mut cap_total = 0u128;
        let mut job_ids = BTreeSet::new();
        for id in &case.job_ids {
            assert!(job_ids.insert(*id), "duplicate case job ID");
            if selected.is_some_and(|ids| !ids.contains(id)) {
                continue;
            }
            let job = self.rescue_jobs.get(id).expect("missing rescue job");
            let mandate = self
                .rescue_mandates
                .get(id)
                .expect("missing rescue mandate");
            assert_eq!(job.id, *id, "rescue job ID mismatch");
            assert_eq!(job.case_id, case_id, "rescue job case mismatch");
            assert_eq!(mandate.job_id, *id, "rescue mandate ID mismatch");
            if job.phase == rescue::RescueJobPhase::Accepted
                && mandate.phase == rescue::RescueMandatePhase::Open
                && mandate.held_principal > 0
                && mandate.locked_bundle_id.is_none()
                && mandate.locked_allocation.is_none()
            {
                cap_total = cap_total
                    .checked_add(mandate.held_principal)
                    .expect("sponsor cap overflow");
                eligible_job_ids.push(*id);
            }
        }
        eligible_job_ids.sort_unstable();

        let mut offer_ids = BTreeSet::new();
        let offers: Vec<_> = case
            .offer_ids
            .iter()
            .map(|id| {
                assert!(offer_ids.insert(*id), "duplicate case offer ID");
                let offer = self
                    .rescue_offers
                    .get(id)
                    .expect("missing rescue offer")
                    .clone();
                assert_eq!(offer.id, *id, "rescue offer ID mismatch");
                assert_eq!(offer.case_id, case_id, "rescue offer case mismatch");
                offer
            })
            .collect();

        let mut best: Option<(u128, u64, u64)> = None;
        for a in offers.iter().filter(|o| o.component_index == 0) {
            for b in offers.iter().filter(|o| o.component_index == 1) {
                if a.phase != rescue::RescueOfferPhase::Open
                    || b.phase != rescue::RescueOfferPhase::Open
                    || a.locked_bundle_id.is_some()
                    || b.locked_bundle_id.is_some()
                    || a.release_reason.is_some()
                    || b.release_reason.is_some()
                    || a.fee == 0
                    || b.fee == 0
                    || a.provider == b.provider
                {
                    continue;
                }
                let Some(price) = a.fee.checked_add(b.fee) else {
                    continue;
                };
                if price > cap_total || a.held_bond < price || b.held_bond < price {
                    continue;
                }
                let a_key = capacity::capacity_key(&a.provider, &a.slot_id);
                let b_key = capacity::capacity_key(&b.provider, &b.slot_id);
                if self.capacity_locks.get(&a_key).is_some()
                    || self.capacity_locks.get(&b_key).is_some()
                {
                    continue;
                }
                let candidate = (price, a.id, b.id);
                if best.is_none_or(|old| candidate < old) {
                    best = Some(candidate);
                }
            }
        }

        best.map(|(total_price, a, b)| RescuePairPlan {
            offer_ids: [a, b],
            total_price,
            eligible_job_ids,
            eligible_cap_total: cap_total,
        })
    }
}
