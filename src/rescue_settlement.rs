//! M3-R4-02: deterministic terminal rescue economics.
//!
//! Pure computation only. No NEAR storage writes, ledger
//! updates, transfers, time checks or capacity mutations.
//! R4-03 must authenticate the stored bundle, mandates,
//! providers and typed slots before applying this plan.

use crate::rescue::{MAX_RESCUE_JOBS, RescueAllocation, RescueComponentOutcome};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueSettlementPlan {
    /// Credits keyed by selected provider index (0 or 1).
    pub provider_credits: [u128; 2],

    /// One entry per positive sponsor, sorted by job ID.
    /// Success yields zero-valued sponsor credits.
    pub sponsor_credits: Vec<RescueAllocation>,

    /// Always exactly 3 * bundle price on success.
    pub total_credit: u128,

    pub default_count: usize,
}

/// Calculate an immutable terminal allocation plan.
///
/// The calling on-chain transition must independently
/// verify offer identities, provider accounts, mandate
/// ownership, deadline, capacity and claimable backing.
///
/// `outcomes` must already be terminal: Proven/Defaulted.
/// Pending outcomes are deliberately rejected.
pub fn plan_rescue_settlement(
    price: u128,
    fees: [u128; 2],
    held_bonds: [u128; 2],
    allocations: &[RescueAllocation],
    outcomes: [RescueComponentOutcome; 2],
) -> Result<RescueSettlementPlan, &'static str> {
    if price == 0 {
        return Err("zero rescue price");
    }

    if fees.contains(&0) {
        return Err("zero component fee");
    }

    let fee_total = fees[0].checked_add(fees[1]).ok_or("fee sum overflow")?;

    if fee_total != price {
        return Err("component fees do not match price");
    }

    if held_bonds != [price, price] {
        return Err("selected bonds must equal price");
    }

    if allocations.is_empty() || allocations.len() > MAX_RESCUE_JOBS {
        return Err("invalid sponsor count");
    }

    if outcomes.contains(&RescueComponentOutcome::Pending) {
        return Err("nonterminal component outcome");
    }

    let expected_credit = price.checked_mul(3).ok_or("terminal liability overflow")?;

    let mut rows = allocations.to_vec();
    rows.sort_unstable_by_key(|row| row.job_id);

    if rows.iter().any(|row| row.amount == 0) {
        return Err("zero-allocation sponsor");
    }

    if rows.windows(2).any(|pair| pair[0].job_id == pair[1].job_id) {
        return Err("duplicate sponsor job");
    }

    let allocation_total = rows.iter().try_fold(0u128, |sum, row| {
        sum.checked_add(row.amount)
            .ok_or("sponsor allocation overflow")
    })?;

    if allocation_total != price {
        return Err("sponsor allocations do not match price");
    }

    let default_count = outcomes
        .iter()
        .filter(|outcome| **outcome == RescueComponentOutcome::Defaulted)
        .count();

    let mut provider_credits = [0u128; 2];
    let mut proven_fees = 0u128;

    for (index, outcome) in outcomes.iter().enumerate() {
        if *outcome == RescueComponentOutcome::Proven {
            provider_credits[index] = price
                .checked_add(fees[index])
                .ok_or("provider credit overflow")?;

            proven_fees = proven_fees
                .checked_add(fees[index])
                .ok_or("proven fee overflow")?;
        }
    }

    let mut sponsor_credits: Vec<RescueAllocation> = rows
        .iter()
        .map(|row| RescueAllocation {
            job_id: row.job_id,
            amount: 0,
        })
        .collect();

    if default_count > 0 {
        let forfeiture = price
            .checked_mul(default_count as u128)
            .ok_or("forfeiture overflow")?
            .checked_sub(proven_fees)
            .ok_or("forfeiture underflow")?;

        let count = sponsor_credits.len() as u128;
        let share = forfeiture / count;
        let remainder = (forfeiture % count) as usize;

        for (rank, (allocation, credit)) in rows.iter().zip(sponsor_credits.iter_mut()).enumerate()
        {
            credit.amount = allocation
                .amount
                .checked_add(share)
                .and_then(|value| value.checked_add(u128::from(rank < remainder)))
                .ok_or("sponsor credit overflow")?;
        }
    }

    let provider_total = provider_credits.iter().try_fold(0u128, |sum, amount| {
        sum.checked_add(*amount).ok_or("provider total overflow")
    })?;

    let sponsor_total = sponsor_credits.iter().try_fold(0u128, |sum, row| {
        sum.checked_add(row.amount).ok_or("sponsor total overflow")
    })?;

    let total_credit = provider_total
        .checked_add(sponsor_total)
        .ok_or("terminal credit overflow")?;

    if total_credit != expected_credit {
        return Err("terminal conservation failure");
    }

    Ok(RescueSettlementPlan {
        provider_credits,
        sponsor_credits,
        total_credit,
        default_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rescue::RescueComponentOutcome::{Defaulted, Pending, Proven};

    fn sponsors() -> Vec<RescueAllocation> {
        vec![
            RescueAllocation {
                job_id: 3,
                amount: 4,
            },
            RescueAllocation {
                job_id: 1,
                amount: 4,
            },
            RescueAllocation {
                job_id: 2,
                amount: 4,
            },
        ]
    }

    fn demo(outcomes: [RescueComponentOutcome; 2]) -> RescueSettlementPlan {
        plan_rescue_settlement(12, [6, 6], [12, 12], &sponsors(), outcomes).unwrap()
    }

    fn amounts(plan: &RescueSettlementPlan) -> Vec<(u64, u128)> {
        plan.sponsor_credits
            .iter()
            .map(|row| (row.job_id, row.amount))
            .collect()
    }

    #[test]
    fn both_proven_pay_only_selected_providers() {
        let plan = demo([Proven, Proven]);

        assert_eq!(plan.provider_credits, [18, 18]);
        assert_eq!(amounts(&plan), [(1, 0), (2, 0), (3, 0)]);
        assert_eq!(plan.default_count, 0);
        assert_eq!(plan.total_credit, 36);
    }

    #[test]
    fn first_proven_second_defaulted() {
        let plan = demo([Proven, Defaulted]);

        assert_eq!(plan.provider_credits, [18, 0]);
        assert_eq!(amounts(&plan), [(1, 6), (2, 6), (3, 6)]);
        assert_eq!(plan.default_count, 1);
        assert_eq!(plan.total_credit, 36);
    }

    #[test]
    fn first_defaulted_second_proven() {
        let plan = demo([Defaulted, Proven]);

        assert_eq!(plan.provider_credits, [0, 18]);
        assert_eq!(amounts(&plan), [(1, 6), (2, 6), (3, 6)]);
        assert_eq!(plan.default_count, 1);
        assert_eq!(plan.total_credit, 36);
    }

    #[test]
    fn both_defaulted_forfeit_both_bonds() {
        let plan = demo([Defaulted, Defaulted]);

        assert_eq!(plan.provider_credits, [0, 0]);
        assert_eq!(amounts(&plan), [(1, 12), (2, 12), (3, 12)]);
        assert_eq!(plan.default_count, 2);
        assert_eq!(plan.total_credit, 36);
    }

    #[test]
    fn remainder_goes_to_lowest_positive_job_ids() {
        let rows = vec![
            RescueAllocation {
                job_id: 9,
                amount: 2,
            },
            RescueAllocation {
                job_id: 2,
                amount: 2,
            },
            RescueAllocation {
                job_id: 5,
                amount: 1,
            },
        ];

        let second_proven =
            plan_rescue_settlement(5, [1, 4], [5, 5], &rows, [Defaulted, Proven]).unwrap();

        assert_eq!(second_proven.provider_credits, [0, 9]);
        assert_eq!(amounts(&second_proven), [(2, 3), (5, 1), (9, 2)]);
        assert_eq!(second_proven.total_credit, 15);

        let first_proven =
            plan_rescue_settlement(5, [1, 4], [5, 5], &rows, [Proven, Defaulted]).unwrap();

        assert_eq!(first_proven.provider_credits, [6, 0]);
        assert_eq!(amounts(&first_proven), [(2, 4), (5, 2), (9, 3)]);
        assert_eq!(first_proven.total_credit, 15);
    }

    #[test]
    fn pending_outcome_cannot_be_settled() {
        for outcomes in [
            [Pending, Pending],
            [Proven, Pending],
            [Pending, Proven],
            [Defaulted, Pending],
        ] {
            assert!(plan_rescue_settlement(12, [6, 6], [12, 12], &sponsors(), outcomes).is_err());
        }
    }

    #[test]
    fn invalid_bonds_fees_and_price_are_rejected() {
        let rows = sponsors();

        for (price, fees, bonds) in [
            (0, [0, 0], [0, 0]),
            (12, [0, 12], [12, 12]),
            (12, [6, 5], [12, 12]),
            (12, [6, 7], [12, 12]),
            (12, [6, 6], [11, 12]),
            (12, [6, 6], [13, 12]),
        ] {
            assert!(plan_rescue_settlement(price, fees, bonds, &rows, [Proven, Proven]).is_err());
        }
    }

    #[test]
    fn malformed_sponsor_sets_are_rejected() {
        let valid = sponsors();

        let mut zero = valid.clone();
        zero[0].amount = 0;

        let mut duplicate = valid.clone();
        duplicate[0].job_id = duplicate[1].job_id;

        let mut wrong_total = valid.clone();
        wrong_total[0].amount = 3;

        let mut overflow = valid.clone();
        overflow[0].amount = u128::MAX;

        let over_limit: Vec<RescueAllocation> = (0..7)
            .map(|id| RescueAllocation {
                job_id: id,
                amount: 1,
            })
            .collect();

        for rows in [vec![], zero, duplicate, wrong_total, overflow, over_limit] {
            assert!(
                plan_rescue_settlement(12, [6, 6], [12, 12], &rows, [Defaulted, Defaulted])
                    .is_err()
            );
        }
    }

    #[test]
    fn checked_u128_boundary_rejects_unrepresentable_3q() {
        let price = u128::MAX;
        let rows = vec![RescueAllocation {
            job_id: 1,
            amount: price,
        }];

        assert!(
            plan_rescue_settlement(
                price,
                [1, price - 1],
                [price, price],
                &rows,
                [Proven, Proven]
            )
            .is_err()
        );

        let safe_price = u128::MAX / 3;
        let safe_rows = vec![RescueAllocation {
            job_id: 1,
            amount: safe_price,
        }];

        let plan = plan_rescue_settlement(
            safe_price,
            [1, safe_price - 1],
            [safe_price, safe_price],
            &safe_rows,
            [Proven, Proven],
        )
        .unwrap();

        assert_eq!(plan.total_credit, safe_price * 3);
    }

    #[test]
    fn bounded_exhaustive_conservation_and_ordering() {
        for price in 2u128..=20 {
            for fee_a in 1..price {
                let fee_b = price - fee_a;
                let max_sponsors = MAX_RESCUE_JOBS.min(price as usize);

                for sponsor_count in 1..=max_sponsors {
                    let mut rows: Vec<RescueAllocation> = (0..sponsor_count)
                        .map(|index| RescueAllocation {
                            job_id: (index * 3 + 1) as u64,
                            amount: 1,
                        })
                        .collect();

                    let extra = price - sponsor_count as u128;
                    for n in 0..extra {
                        let index = n as usize % sponsor_count;
                        rows[index].amount += 1;
                    }

                    rows.reverse();

                    for outcomes in [
                        [Proven, Proven],
                        [Proven, Defaulted],
                        [Defaulted, Proven],
                        [Defaulted, Defaulted],
                    ] {
                        let plan = plan_rescue_settlement(
                            price,
                            [fee_a, fee_b],
                            [price, price],
                            &rows,
                            outcomes,
                        )
                        .unwrap();

                        let provider_total: u128 = plan.provider_credits.iter().sum();

                        let sponsor_total: u128 =
                            plan.sponsor_credits.iter().map(|row| row.amount).sum();

                        assert_eq!(provider_total + sponsor_total, price * 3);
                        assert_eq!(plan.total_credit, price * 3);

                        assert!(
                            plan.sponsor_credits
                                .windows(2)
                                .all(|pair| pair[0].job_id < pair[1].job_id)
                        );
                    }
                }
            }
        }
    }
}
