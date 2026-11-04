use crate::rescue_clearing::allocate_rescue_cost;

fn rows(caps: &[(u64, u128)], price: u128) -> Vec<(u64, u128)> {
    allocate_rescue_cost(caps, price)
        .unwrap()
        .into_iter()
        .map(|allocation| (allocation.job_id, allocation.amount))
        .collect()
}

#[test]
fn three_bounded_sponsors_share_twelve_equally() {
    assert_eq!(
        rows(&[(2, 5), (0, 5), (1, 5)], 12),
        vec![(0, 4), (1, 4), (2, 4)]
    );
}

#[test]
fn saturated_sponsor_leaves_remainder_for_active_sponsors() {
    assert_eq!(
        rows(&[(0, 1), (1, 10), (2, 10)], 8),
        vec![(0, 1), (1, 4), (2, 3)]
    );
}

#[test]
fn indivisible_units_follow_job_ids_and_zero_rows_are_preserved() {
    assert_eq!(
        rows(&[(9, 10), (2, 10), (5, 10)], 5),
        vec![(2, 2), (5, 2), (9, 1)]
    );
    assert_eq!(
        rows(&[(9, 5), (2, 5), (5, 5)], 1),
        vec![(2, 1), (5, 0), (9, 0)]
    );
}

#[test]
fn invalid_caps_price_count_and_arithmetic_are_rejected() {
    for (caps, price) in [
        (vec![], 1),
        (vec![(0, 1)], 0),
        (vec![(0, 0)], 1),
        (vec![(0, 1), (0, 1)], 1),
        (vec![(0, 1)], 2),
        (vec![(0, u128::MAX), (1, 1)], 1),
        ((0..7).map(|i| (i, 1)).collect(), 1),
    ] {
        assert!(allocate_rescue_cost(&caps, price).is_err());
    }
}

#[test]
fn large_price_does_not_overflow_allocation_math() {
    let cap = u128::MAX / 3;
    let price = cap * 2;
    assert_eq!(
        rows(&[(0, cap), (1, cap), (2, cap)], price),
        vec![(0, price / 3 + 1), (1, price / 3 + 1), (2, price / 3)]
    );
}

#[test]
fn bounded_cap_vectors_conserve_price_and_ignore_input_order() {
    for a in 1..=5u128 {
        for b in 1..=5u128 {
            for c in 1..=5u128 {
                let caps = [(3, a), (1, b), (2, c)];
                for price in 1..=a + b + c {
                    let allocations = rows(&caps, price);
                    assert_eq!(allocations, rows(&[(2, c), (3, a), (1, b)], price));
                    assert_eq!(allocations.iter().map(|(_, x)| *x).sum::<u128>(), price);
                    assert!(allocations[0].1 <= b);
                    assert!(allocations[1].1 <= c);
                    assert!(allocations[2].1 <= a);
                    assert_eq!(
                        allocations.iter().map(|(id, _)| *id).collect::<Vec<_>>(),
                        vec![1, 2, 3]
                    );
                }
            }
        }
    }
}
