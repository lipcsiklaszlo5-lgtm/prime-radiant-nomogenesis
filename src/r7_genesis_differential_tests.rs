use crate::rescue_clearing::allocate_rescue_cost;
use near_sdk::serde_json::Value;

fn vectors() -> Vec<Value> {
    let data: Value = near_sdk::serde_json::from_str(include_str!(
        "../docs/evidence/R7-02C-allocation-vectors.json"
    ))
    .expect("invalid differential fixture");

    assert_eq!(data["version"], "r7-02c-allocation-v1");

    let cases = data["cases"].as_array().expect("missing cases");

    assert_eq!(cases.len(), 185);
    cases.clone()
}

type JobAmounts = Vec<(u64, u128)>;

fn parse_case(row: &Value) -> (JobAmounts, u128, JobAmounts) {
    let price = row["price"]
        .as_str()
        .expect("price string")
        .parse::<u128>()
        .expect("invalid price");

    let caps = row["caps"]
        .as_array()
        .expect("caps")
        .iter()
        .map(|x| {
            (
                x["job_id"].as_u64().expect("job ID"),
                x["cap"]
                    .as_str()
                    .expect("cap")
                    .parse::<u128>()
                    .expect("invalid cap"),
            )
        })
        .collect();

    let expected = row["allocation"]
        .as_array()
        .expect("allocations")
        .iter()
        .map(|x| {
            (
                x["job_id"].as_u64().expect("allocation ID"),
                x["amount"]
                    .as_str()
                    .expect("amount")
                    .parse::<u128>()
                    .expect("invalid amount"),
            )
        })
        .collect();

    (caps, price, expected)
}

#[test]
fn rust_matches_python_on_all_185_cases() {
    for row in vectors() {
        let (caps, price, expected) = parse_case(&row);

        let actual: Vec<(u64, u128)> = allocate_rescue_cost(&caps, price)
            .expect("Rust allocation failed")
            .into_iter()
            .map(|a| (a.job_id, a.amount))
            .collect();

        assert_eq!(actual, expected, "Python/Rust mismatch in {}", row["id"]);
    }
}

#[test]
fn input_order_does_not_change_rust_results() {
    for row in vectors() {
        let (mut caps, price, expected) = parse_case(&row);
        caps.reverse();

        let actual: Vec<(u64, u128)> = allocate_rescue_cost(&caps, price)
            .expect("Rust reversed allocation failed")
            .into_iter()
            .map(|a| (a.job_id, a.amount))
            .collect();

        assert_eq!(actual, expected, "Order-dependent result in {}", row["id"]);
    }
}
