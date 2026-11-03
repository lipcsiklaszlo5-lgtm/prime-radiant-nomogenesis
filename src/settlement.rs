//! Deterministic economic allocation.
//! No deposits, storage mutations or NEAR transfers occur here.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Budget {
    pub primary_reward: u128,
    pub reserve_reward: u128,
    pub option_premium: u128,
    pub keeper_bounty: u128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    PrimaryProofAccepted,
    ReserveProofAccepted,
    ReserveFailed,
    UnactivatedExpired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettlementError {
    InvalidBudget,
    InsufficientCollateral,
    Overflow,
    ConservationViolation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Credits {
    pub buyer: u128,
    pub primary: u128,
    pub reserve: u128,
    pub keeper: u128,
}

fn checked_sum(values: &[u128]) -> Result<u128, SettlementError> {
    values.iter().try_fold(0u128, |sum, amount| {
        sum.checked_add(*amount).ok_or(SettlementError::Overflow)
    })
}

impl Budget {
    pub fn funding(self) -> Result<u128, SettlementError> {
        let amounts = [
            self.primary_reward,
            self.reserve_reward,
            self.option_premium,
            self.keeper_bounty,
        ];

        if amounts.contains(&0) {
            return Err(SettlementError::InvalidBudget);
        }

        checked_sum(&amounts)
    }

    pub fn minimum_collateral(self) -> Result<u128, SettlementError> {
        checked_sum(&[self.reserve_reward, self.option_premium])
    }
}

impl Credits {
    pub fn total(self) -> Result<u128, SettlementError> {
        checked_sum(&[self.buyer, self.primary, self.reserve, self.keeper])
    }
}

pub fn plan_selected(
    budget: Budget,
    collateral: u128,
    outcome: Outcome,
) -> Result<Credits, SettlementError> {
    let funding = budget.funding()?;

    let minimum = budget.minimum_collateral()?;
    if collateral < minimum {
        return Err(SettlementError::InsufficientCollateral);
    }

    let deposited = checked_sum(&[funding, collateral])?;

    let p = budget.primary_reward;
    let r = budget.reserve_reward;
    let q = budget.option_premium;
    let k = budget.keeper_bounty;
    let c = collateral;

    let credits = match outcome {
        Outcome::PrimaryProofAccepted => Credits {
            buyer: checked_sum(&[r, k])?,
            primary: p,
            reserve: checked_sum(&[q, c])?,
            keeper: 0,
        },

        Outcome::ReserveProofAccepted => Credits {
            buyer: p,
            primary: 0,
            reserve: checked_sum(&[r, q, c])?,
            keeper: k,
        },

        Outcome::ReserveFailed => Credits {
            buyer: checked_sum(&[p, r, q, c])?,
            primary: 0,
            reserve: 0,
            keeper: k,
        },

        Outcome::UnactivatedExpired => Credits {
            buyer: checked_sum(&[p, r, k])?,
            primary: 0,
            reserve: checked_sum(&[q, c])?,
            keeper: 0,
        },
    };

    if credits.total()? != deposited {
        return Err(SettlementError::ConservationViolation);
    }

    Ok(credits)
}

// No option was purchased: no selected collateral belongs
// to this task. Unaccepted offers are refunded separately.
pub fn plan_unmatched(budget: Budget) -> Result<Credits, SettlementError> {
    Ok(Credits {
        buyer: budget.funding()?,
        primary: 0,
        reserve: 0,
        keeper: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn budget() -> Budget {
        Budget {
            primary_reward: 20,
            reserve_reward: 10,
            option_premium: 3,
            keeper_bounty: 2,
        }
    }

    #[test]
    fn reference_settlement_matrix() {
        let cases = [
            (
                Outcome::PrimaryProofAccepted,
                Credits {
                    buyer: 12,
                    primary: 20,
                    reserve: 16,
                    keeper: 0,
                },
            ),
            (
                Outcome::ReserveProofAccepted,
                Credits {
                    buyer: 20,
                    primary: 0,
                    reserve: 26,
                    keeper: 2,
                },
            ),
            (
                Outcome::ReserveFailed,
                Credits {
                    buyer: 46,
                    primary: 0,
                    reserve: 0,
                    keeper: 2,
                },
            ),
            (
                Outcome::UnactivatedExpired,
                Credits {
                    buyer: 32,
                    primary: 0,
                    reserve: 16,
                    keeper: 0,
                },
            ),
        ];

        for (outcome, expected) in cases {
            let actual = plan_selected(budget(), 13, outcome).unwrap();
            assert_eq!(actual, expected);
            assert_eq!(actual.total().unwrap(), 48);
        }
    }

    #[test]
    fn unmatched_refunds_only_buyer_budget() {
        let credits = plan_unmatched(budget()).unwrap();
        assert_eq!(credits.buyer, 35);
        assert_eq!(credits.primary, 0);
        assert_eq!(credits.reserve, 0);
        assert_eq!(credits.keeper, 0);
    }

    #[test]
    fn undercollateralized_offer_is_rejected() {
        let mut b = budget();
        b.option_premium = 100;

        assert_eq!(
            plan_selected(b, 1, Outcome::PrimaryProofAccepted),
            Err(SettlementError::InsufficientCollateral)
        );
    }

    #[test]
    fn exact_collateral_minimum_is_allowed() {
        let credits = plan_selected(budget(), 13, Outcome::ReserveFailed).unwrap();

        assert_eq!(credits.buyer, 46);
        assert_eq!(credits.keeper, 2);
        assert_eq!(credits.reserve, 0);
    }

    #[test]
    fn zero_budget_buckets_are_rejected() {
        let b = budget();
        let invalid = [
            Budget {
                primary_reward: 0,
                ..b
            },
            Budget {
                reserve_reward: 0,
                ..b
            },
            Budget {
                option_premium: 0,
                ..b
            },
            Budget {
                keeper_bounty: 0,
                ..b
            },
        ];

        for candidate in invalid {
            assert_eq!(candidate.funding(), Err(SettlementError::InvalidBudget));
        }
    }

    #[test]
    fn arithmetic_overflow_is_rejected() {
        let mut b = budget();
        b.primary_reward = u128::MAX;

        assert_eq!(b.funding(), Err(SettlementError::Overflow));

        assert_eq!(
            plan_selected(budget(), u128::MAX, Outcome::ReserveProofAccepted),
            Err(SettlementError::Overflow)
        );
    }

    #[test]
    fn exact_u128_upper_boundary_conserves_funds() {
        let b = Budget {
            primary_reward: 1,
            reserve_reward: 1,
            option_premium: 1,
            keeper_bounty: 1,
        };

        let collateral = u128::MAX - 4;

        for outcome in [
            Outcome::PrimaryProofAccepted,
            Outcome::ReserveProofAccepted,
            Outcome::ReserveFailed,
            Outcome::UnactivatedExpired,
        ] {
            let credits = plan_selected(b, collateral, outcome).unwrap();

            assert_eq!(credits.total().unwrap(), u128::MAX);
        }
    }

    #[test]
    fn exhaustive_small_budget_conservation() {
        let outcomes = [
            Outcome::PrimaryProofAccepted,
            Outcome::ReserveProofAccepted,
            Outcome::ReserveFailed,
            Outcome::UnactivatedExpired,
        ];

        for p in 1u128..=3 {
            for r in 1u128..=3 {
                for q in 1u128..=3 {
                    for k in 1u128..=3 {
                        let b = Budget {
                            primary_reward: p,
                            reserve_reward: r,
                            option_premium: q,
                            keeper_bounty: k,
                        };

                        for c in (r + q)..=(r + q + 2) {
                            let expected = p + r + q + k + c;

                            for outcome in outcomes {
                                let credits = plan_selected(b, c, outcome).unwrap();

                                assert_eq!(credits.total().unwrap(), expected);
                            }
                        }
                    }
                }
            }
        }
    }
}
