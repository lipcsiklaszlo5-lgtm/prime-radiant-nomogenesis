use std::collections::{BTreeMap, BTreeSet};

pub const MAX_SPONSORS: usize = 6;
pub const MAX_OFFERS: usize = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Mandate {
    pub job_id: u64,
    pub cap: u128,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Allocation {
    pub job_id: u64,
    pub amount: u128,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Offer {
    pub id: u64,
    pub component: u8,
    pub provider: String,
    pub fee: u128,
    pub bond: u128,
    pub expires_at: u64,
    pub deadline: u64,
    pub open: bool,
    pub slot_available: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Bundle {
    pub offers: [Offer; 2],
    pub price: u128,
    pub allocations: Vec<Allocation>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Proven,
    Defaulted,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum Recipient {
    Buyer(u64),
    Provider(String),
}

pub type Credits = BTreeMap<Recipient, u128>;

pub fn allocate_cost(mandates: &[Mandate], price: u128) -> Result<Vec<Allocation>, &'static str> {
    if mandates.is_empty() || price == 0 {
        return Err("empty sponsors or zero price");
    }
    if mandates.len() > MAX_SPONSORS {
        return Err("too many sponsors");
    }

    let mut rows = mandates.to_vec();
    rows.sort_by_key(|row| row.job_id);

    let mut ids = BTreeSet::new();
    let mut cap_total = 0u128;
    for row in &rows {
        if row.cap == 0 || !ids.insert(row.job_id) {
            return Err("zero cap or duplicate job");
        }
        cap_total = cap_total.checked_add(row.cap).ok_or("cap overflow")?;
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
            .filter_map(|(i, amount)| (*amount < rows[i].cap).then_some(i))
            .collect();
        if active.is_empty() {
            return Err("insufficient caps");
        }

        let count = active.len() as u128;
        let share = remaining / count;
        let remainder = (remaining % count) as usize;
        let mut paid = 0u128;

        for (rank, i) in active.into_iter().enumerate() {
            let requested = share + u128::from(rank < remainder);
            let amount = requested.min(rows[i].cap - amounts[i]);
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
        .map(|(row, amount)| Allocation {
            job_id: row.job_id,
            amount,
        })
        .collect())
}

pub fn clear_bundle(
    mandates: &[Mandate],
    required: [u8; 2],
    offers: &[Offer],
    now: u64,
) -> Result<Bundle, &'static str> {
    if required[0] == required[1] {
        return Err("components must differ");
    }
    if offers.len() > MAX_OFFERS {
        return Err("too many offers");
    }

    let mut ids = BTreeSet::new();
    for offer in offers {
        if !ids.insert(offer.id) {
            return Err("duplicate offer");
        }
        if offer.provider.is_empty() || offer.fee == 0 || offer.deadline == 0 {
            return Err("malformed offer");
        }
    }

    let mut best: Option<(u128, u64, u64, Offer, Offer)> = None;
    for a in offers.iter().filter(|o| o.component == required[0]) {
        for b in offers.iter().filter(|o| o.component == required[1]) {
            if !a.open || !b.open || !a.slot_available || !b.slot_available {
                continue;
            }
            if now >= a.expires_at || now >= b.expires_at {
                continue;
            }
            if now >= a.deadline || now >= b.deadline || a.deadline != b.deadline {
                continue;
            }
            if a.provider == b.provider {
                continue;
            }

            let price = a.fee.checked_add(b.fee).ok_or("price overflow")?;
            if a.bond < price || b.bond < price {
                continue;
            }

            let candidate = (price, a.id, b.id, a.clone(), b.clone());
            if best
                .as_ref()
                .is_none_or(|old| (candidate.0, candidate.1, candidate.2) < (old.0, old.1, old.2))
            {
                best = Some(candidate);
            }
        }
    }

    let (price, _, _, a, b) = best.ok_or("no fully funded pair")?;
    let allocations = allocate_cost(mandates, price)?;
    Ok(Bundle {
        offers: [a, b],
        price,
        allocations,
    })
}

pub fn settle_bundle(bundle: &Bundle, outcomes: [Outcome; 2]) -> Result<Credits, &'static str> {
    let fee_total = bundle.offers.iter().try_fold(0u128, |sum, offer| {
        sum.checked_add(offer.fee).ok_or("fee overflow")
    })?;
    let allocation_total = bundle.allocations.iter().try_fold(0u128, |sum, row| {
        sum.checked_add(row.amount).ok_or("allocation overflow")
    })?;
    if bundle.price == 0
        || fee_total != bundle.price
        || allocation_total != bundle.price
        || bundle.offers.iter().any(|offer| offer.bond < bundle.price)
        || bundle.offers[0].provider == bundle.offers[1].provider
    {
        return Err("invalid bundle");
    }

    let mut credits = Credits::new();
    let default_count = outcomes
        .iter()
        .filter(|o| **o == Outcome::Defaulted)
        .count();

    if default_count == 0 {
        for offer in &bundle.offers {
            add(
                &mut credits,
                Recipient::Provider(offer.provider.clone()),
                bundle
                    .price
                    .checked_add(offer.fee)
                    .ok_or("credit overflow")?,
            )?;
        }
    } else {
        for row in &bundle.allocations {
            add(&mut credits, Recipient::Buyer(row.job_id), row.amount)?;
        }

        let mut forfeited = bundle
            .price
            .checked_mul(default_count as u128)
            .ok_or("bond overflow")?;

        for (offer, outcome) in bundle.offers.iter().zip(outcomes) {
            if outcome == Outcome::Proven {
                forfeited = forfeited.checked_sub(offer.fee).ok_or("bond invariant")?;
                add(
                    &mut credits,
                    Recipient::Provider(offer.provider.clone()),
                    bundle
                        .price
                        .checked_add(offer.fee)
                        .ok_or("credit overflow")?,
                )?;
            }
        }

        let count = bundle.allocations.len() as u128;
        let share = forfeited / count;
        let remainder = (forfeited % count) as usize;
        let mut rows = bundle.allocations.clone();
        rows.sort_by_key(|row| row.job_id);
        for (rank, row) in rows.iter().enumerate() {
            add(
                &mut credits,
                Recipient::Buyer(row.job_id),
                share + u128::from(rank < remainder),
            )?;
        }
    }

    let expected = bundle.price.checked_mul(3).ok_or("deposit overflow")?;
    let total = credits.values().try_fold(0u128, |sum, amount| {
        sum.checked_add(*amount).ok_or("credit overflow")
    })?;
    if total != expected {
        return Err("settlement does not conserve deposits");
    }
    Ok(credits)
}

fn add(credits: &mut Credits, recipient: Recipient, amount: u128) -> Result<(), &'static str> {
    let old = credits.get(&recipient).copied().unwrap_or(0);
    credits.insert(recipient, old.checked_add(amount).ok_or("credit overflow")?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn offer(id: u64, component: u8, provider: &str, fee: u128) -> Offer {
        Offer {
            id,
            component,
            provider: provider.into(),
            fee,
            bond: 12,
            expires_at: 50,
            deadline: 100,
            open: true,
            slot_available: true,
        }
    }

    fn demo() -> Bundle {
        clear_bundle(
            &[
                Mandate { job_id: 3, cap: 5 },
                Mandate { job_id: 1, cap: 5 },
                Mandate { job_id: 2, cap: 5 },
            ],
            [1, 2],
            &[offer(10, 1, "provider-a", 6), offer(20, 2, "provider-b", 6)],
            10,
        )
        .unwrap()
    }

    #[test]
    fn capped_equal_allocation_is_deterministic() {
        assert_eq!(
            allocate_cost(
                &[
                    Mandate { job_id: 3, cap: 5 },
                    Mandate { job_id: 1, cap: 5 },
                    Mandate { job_id: 2, cap: 5 },
                ],
                12,
            )
            .unwrap(),
            vec![
                Allocation {
                    job_id: 1,
                    amount: 4
                },
                Allocation {
                    job_id: 2,
                    amount: 4
                },
                Allocation {
                    job_id: 3,
                    amount: 4
                },
            ]
        );
    }

    #[test]
    fn capped_buyer_saturates_before_remainder() {
        assert_eq!(
            allocate_cost(
                &[
                    Mandate { job_id: 1, cap: 1 },
                    Mandate { job_id: 2, cap: 5 },
                    Mandate { job_id: 3, cap: 5 },
                ],
                10,
            )
            .unwrap(),
            vec![
                Allocation {
                    job_id: 1,
                    amount: 1
                },
                Allocation {
                    job_id: 2,
                    amount: 5
                },
                Allocation {
                    job_id: 3,
                    amount: 4
                },
            ]
        );
    }

    #[test]
    fn clearing_selects_cheapest_fully_bonded_pair() {
        let mut cheap_a = offer(1, 1, "cheap-a", 1);
        let mut cheap_b = offer(2, 2, "cheap-b", 1);
        cheap_a.bond = 1;
        cheap_b.bond = 1;

        let bundle = clear_bundle(
            &[Mandate { job_id: 1, cap: 10 }],
            [1, 2],
            &[
                cheap_a,
                cheap_b,
                offer(3, 1, "funded-a", 3),
                offer(4, 2, "funded-b", 4),
            ],
            10,
        )
        .unwrap();

        assert_eq!(bundle.price, 7);
        assert_eq!([bundle.offers[0].id, bundle.offers[1].id], [3, 4]);
    }

    #[test]
    fn same_provider_cannot_fill_both_components() {
        let mut second = offer(2, 2, "same", 2);
        second.id = 2;
        assert!(
            clear_bundle(
                &[Mandate { job_id: 1, cap: 10 }],
                [1, 2],
                &[offer(1, 1, "same", 2), second],
                10,
            )
            .is_err()
        );
    }

    #[test]
    fn successful_settlement_conserves_all_deposits() {
        let credits = settle_bundle(&demo(), [Outcome::Proven, Outcome::Proven]).unwrap();
        assert_eq!(credits.values().sum::<u128>(), 36);
        assert_eq!(credits[&Recipient::Provider("provider-a".into())], 18);
    }

    #[test]
    fn one_default_refunds_buyers_and_rewards_proven_work() {
        let credits = settle_bundle(&demo(), [Outcome::Proven, Outcome::Defaulted]).unwrap();
        assert_eq!(credits.values().sum::<u128>(), 36);
        assert_eq!(credits[&Recipient::Provider("provider-a".into())], 18);
        assert_eq!(credits[&Recipient::Buyer(1)], 6);
    }

    #[test]
    fn two_defaults_return_all_value_to_buyers() {
        let credits = settle_bundle(&demo(), [Outcome::Defaulted, Outcome::Defaulted]).unwrap();
        assert_eq!(credits.values().sum::<u128>(), 36);
        assert_eq!(credits[&Recipient::Buyer(1)], 12);
        assert_eq!(credits[&Recipient::Buyer(2)], 12);
        assert_eq!(credits[&Recipient::Buyer(3)], 12);
    }
}
