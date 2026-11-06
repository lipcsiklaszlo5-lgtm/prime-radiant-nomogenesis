#![cfg(feature = "r7-v2")]

use prime_radiant_nomogenesis::Nomogenesis;
use std::panic::{AssertUnwindSafe, catch_unwind};

fn assert_disabled(case_id: Vec<u8>) {
    let mut contract = Nomogenesis::default();

    let result = catch_unwind(AssertUnwindSafe(|| contract.award_rescue_bundle(case_id)));

    let failure = result.expect_err("V2 legacy award must reject");

    let message = failure
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| failure.downcast_ref::<String>().cloned());

    assert_eq!(message.as_deref(), Some("R7 V2: legacy award disabled"));
}

#[test]
fn v2_rejects_legacy_award_for_valid_length_case() {
    assert_disabled(vec![7u8; 32]);
}

#[test]
fn v2_rejects_before_legacy_case_parsing() {
    assert_disabled(Vec::new());
}
