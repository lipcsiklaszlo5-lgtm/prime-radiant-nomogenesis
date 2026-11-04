//! M3-R4-04: deterministic worker result verification.
//! No state mutation or payment occurs in this module.

use sha2::{Digest, Sha256};

use crate::rescue_proof::validate_component_payload;

pub const EXACT_SUM: u8 = 0x21;
pub const MINIMUM_SUM: u8 = 0x22;

const EXACT_DOMAIN: &[u8] = b"NOMOGENESIS/M3/EXACT-SUM/V1\0";
const MINIMUM_DOMAIN: &[u8] = b"NOMOGENESIS/M3/MIN-SUM/V1\0";

pub(crate) fn compute_total(quantities: &[u8], prices: &[u8]) -> Result<u128, &'static str> {
    validate_component_payload(0, quantities)?;
    validate_component_payload(1, prices)?;

    if quantities[2] != prices[2] {
        return Err("component record count mismatch");
    }

    let quantity_rows = quantities[3..].as_chunks::<10>().0;
    let price_rows = prices[3..].as_chunks::<10>().0;

    let mut total = 0u128;

    for (quantity, price) in quantity_rows.iter().zip(price_rows) {
        if quantity[..2] != price[..2] {
            return Err("component item IDs mismatch");
        }

        let q = u64::from_be_bytes(quantity[2..10].try_into().unwrap());
        let p = u64::from_be_bytes(price[2..10].try_into().unwrap());

        let product = u128::from(q)
            .checked_mul(u128::from(p))
            .ok_or("item product overflow")?;

        total = total.checked_add(product).ok_or("result sum overflow")?;
    }

    Ok(total)
}

pub(crate) fn exact_commitment(case_id: &[u8; 32], result_payload: &[u8]) -> [u8; 32] {
    let mut hash = Sha256::new();
    hash.update(EXACT_DOMAIN);
    hash.update(case_id);
    hash.update(result_payload);
    hash.finalize().into()
}

pub(crate) fn minimum_commitment(case_id: &[u8; 32], threshold: u128) -> [u8; 32] {
    let mut hash = Sha256::new();
    hash.update(MINIMUM_DOMAIN);
    hash.update(case_id);
    hash.update(threshold.to_be_bytes());
    hash.finalize().into()
}

/// Canonical result bytes:
/// version: u8 = 1
/// profile: u8 = 0x21 or 0x22
/// job_id: u64 BE
/// result: u128 BE
///
/// The result must be recomputed from authenticated components.
/// The stored commitment must match the selected profile policy.
pub(crate) fn verify_worker_result(
    case_id: &[u8; 32],
    job_id: u64,
    threshold: Option<u128>,
    stored_commitment: &[u8; 32],
    quantities: &[u8],
    prices: &[u8],
    result_payload: &[u8],
) -> Result<u128, &'static str> {
    if result_payload.len() != 26 {
        return Err("invalid worker result length");
    }

    if result_payload[0] != 1 {
        return Err("unsupported worker result version");
    }

    let profile = if threshold.is_some() {
        MINIMUM_SUM
    } else {
        EXACT_SUM
    };

    if result_payload[1] != profile {
        return Err("worker result profile mismatch");
    }

    let submitted_job = u64::from_be_bytes(result_payload[2..10].try_into().unwrap());

    if submitted_job != job_id {
        return Err("worker result job mismatch");
    }

    let submitted_value = u128::from_be_bytes(result_payload[10..26].try_into().unwrap());

    let calculated = compute_total(quantities, prices)?;

    if submitted_value != calculated {
        return Err("worker result computation mismatch");
    }

    let expected = if let Some(minimum) = threshold {
        if minimum == 0 || calculated < minimum {
            return Err("worker result below threshold");
        }

        minimum_commitment(case_id, minimum)
    } else {
        exact_commitment(case_id, result_payload)
    };

    if &expected != stored_commitment {
        return Err("worker result commitment mismatch");
    }

    Ok(calculated)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn component(kind: u8, rows: &[(u16, u64)]) -> Vec<u8> {
        let mut bytes = vec![1, kind + 1, rows.len() as u8];
        for (id, value) in rows {
            bytes.extend(id.to_be_bytes());
            bytes.extend(value.to_be_bytes());
        }
        bytes
    }

    fn quantities() -> Vec<u8> {
        component(0, &[(4, 2), (8, 3)])
    }

    fn prices() -> Vec<u8> {
        component(1, &[(4, 5), (8, 7)])
    }

    fn output(profile: u8, id: u64, value: u128) -> Vec<u8> {
        let mut result = vec![1, profile];
        result.extend(id.to_be_bytes());
        result.extend(value.to_be_bytes());
        result
    }

    #[test]
    fn matched_components_compute_exact_total() {
        assert_eq!(compute_total(&quantities(), &prices()), Ok(31));
    }

    #[test]
    fn exact_commitment_authenticates_computed_value() {
        let case = [7u8; 32];
        let bytes = output(EXACT_SUM, 12, 31);
        let commitment = exact_commitment(&case, &bytes);

        assert_eq!(
            verify_worker_result(
                &case,
                12,
                None,
                &commitment,
                &quantities(),
                &prices(),
                &bytes
            ),
            Ok(31)
        );
    }

    #[test]
    fn minimum_threshold_passes_at_and_above_boundary() {
        let case = [8u8; 32];
        let bytes = output(MINIMUM_SUM, 12, 31);

        for minimum in [1, 30, 31] {
            let commitment = minimum_commitment(&case, minimum);
            assert_eq!(
                verify_worker_result(
                    &case,
                    12,
                    Some(minimum),
                    &commitment,
                    &quantities(),
                    &prices(),
                    &bytes
                ),
                Ok(31)
            );
        }
    }

    #[test]
    fn threshold_above_computed_value_fails() {
        let case = [8u8; 32];
        let bytes = output(MINIMUM_SUM, 12, 31);
        let commitment = minimum_commitment(&case, 32);

        assert!(
            verify_worker_result(
                &case,
                12,
                Some(32),
                &commitment,
                &quantities(),
                &prices(),
                &bytes
            )
            .is_err()
        );
    }

    #[test]
    fn malformed_worker_result_is_rejected() {
        let case = [9u8; 32];
        let good = output(EXACT_SUM, 12, 31);
        let commitment = exact_commitment(&case, &good);

        let mut cases = vec![
            vec![],
            good[..25].to_vec(),
            output(MINIMUM_SUM, 12, 31),
            output(EXACT_SUM, 13, 31),
            output(EXACT_SUM, 12, 32),
        ];

        let mut bad_version = good.clone();
        bad_version[0] = 2;
        cases.push(bad_version);

        for candidate in cases {
            assert!(
                verify_worker_result(
                    &case,
                    12,
                    None,
                    &commitment,
                    &quantities(),
                    &prices(),
                    &candidate
                )
                .is_err()
            );
        }
    }

    #[test]
    fn missing_or_mismatched_items_fail_closed() {
        let quantity = quantities();
        let mismatched = component(1, &[(4, 5), (9, 7)]);
        let missing = component(1, &[(4, 5)]);
        let duplicated = component(1, &[(4, 5), (4, 7)]);

        for prices in [mismatched, missing, duplicated] {
            assert!(compute_total(&quantity, &prices).is_err());
        }
    }

    #[test]
    fn checked_arithmetic_rejects_sum_overflow() {
        let quantity = component(0, &[(1, u64::MAX), (2, u64::MAX)]);
        let price = component(1, &[(1, u64::MAX), (2, u64::MAX)]);

        assert!(compute_total(&quantity, &price).is_err());
    }

    #[test]
    fn domain_and_case_binding_are_distinct() {
        let case_a = [1u8; 32];
        let case_b = [2u8; 32];
        let bytes = output(EXACT_SUM, 1, 31);

        let exact = exact_commitment(&case_a, &bytes);
        let minimum = minimum_commitment(&case_a, 31);

        assert_ne!(exact, minimum);
        assert_ne!(exact, exact_commitment(&case_b, &bytes));
        assert_ne!(minimum, minimum_commitment(&case_b, 31));
        assert_ne!(minimum, minimum_commitment(&case_a, 32));

        assert!(
            verify_worker_result(&case_b, 1, None, &exact, &quantities(), &prices(), &bytes)
                .is_err()
        );
    }
}
