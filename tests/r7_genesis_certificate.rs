// Independent Rust recomputation of Genesis V1.
// Native test target: does not modify the NEAR contract.

use near_sdk::{serde::Deserialize, serde_json};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
struct Buyer {
    cap: u128,
    job_id: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
struct Offer {
    available: bool,
    bond: u128,
    component: u8,
    fee: u128,
    offer_id: u64,
    provider: String,
    ready_at: u64,
    slot: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
struct Input {
    buyers: Vec<Buyer>,
    deadline: u64,
    offers: Vec<Offer>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
struct Pair {
    offers: Vec<u64>,
    price: u128,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
struct Coalition {
    allocation: Option<Vec<u128>>,
    capacity: u128,
    feasible: bool,
    job_ids: Vec<u64>,
    mask: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
struct Certificate {
    version: String,
    input: Input,
    input_hash: String,
    winning_pair: Option<Pair>,
    coalitions: Vec<Coalition>,
    minimal_coalitions: Vec<Vec<u64>>,
    certificate_hash: String,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct Witness {
    genesis_certificate: Certificate,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct Fixture {
    name: String,
    certificate: Certificate,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct Corpus {
    cases: Vec<Fixture>,
}

fn quoted(value: &str) -> String {
    serde_json::to_string(value).unwrap()
}

// Python: json.dumps(value,sort_keys=True,separators=(',',':'))
// All accepted identifier strings are printable ASCII.
fn canonical_input(input: &Input) -> String {
    let buyers = input
        .buyers
        .iter()
        .map(|b| format!(r#"{{"cap":{},"job_id":{}}}"#, b.cap, b.job_id))
        .collect::<Vec<_>>()
        .join(",");

    let offers = input.offers.iter().map(|o| {
        format!(
            concat!(
                r#"{{"available":{},"bond":{},"component":{},"fee":{},"offer_id":{},"provider":{},"ready_at":{},"slot":{}}}"#
            ),
            o.available,
            o.bond,
            o.component,
            o.fee,
            o.offer_id,
            quoted(&o.provider),
            o.ready_at,
            quoted(&o.slot),
        )
    }).collect::<Vec<_>>().join(",");

    format!(
        r#"{{"buyers":[{}],"deadline":{},"offers":[{}]}}"#,
        buyers, input.deadline, offers
    )
}

fn canonical_body(c: &Certificate) -> String {
    let rows = c
        .coalitions
        .iter()
        .map(|r| {
            format!(
                r#"{{"allocation":{},"capacity":{},"feasible":{},"job_ids":{},"mask":{}}}"#,
                serde_json::to_string(&r.allocation).unwrap(),
                r.capacity,
                r.feasible,
                serde_json::to_string(&r.job_ids).unwrap(),
                r.mask,
            )
        })
        .collect::<Vec<_>>()
        .join(",");

    let winning = match &c.winning_pair {
        Some(p) => format!(
            r#"{{"offers":{},"price":{}}}"#,
            serde_json::to_string(&p.offers).unwrap(),
            p.price,
        ),
        None => "null".into(),
    };

    format!(
        r#"{{"coalitions":[{}],"input":{},"input_hash":{},"minimal_coalitions":{},"version":{},"winning_pair":{}}}"#,
        rows,
        canonical_input(&c.input),
        quoted(&c.input_hash),
        serde_json::to_string(&c.minimal_coalitions).unwrap(),
        quoted(&c.version),
        winning,
    )
}

fn digest(label: &str, canonical: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(label.as_bytes());
    hasher.update([0]);
    hasher.update(canonical.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn allocation(caps: &[u128], price: u128) -> Option<Vec<u128>> {
    let total = caps
        .iter()
        .try_fold(0u128, |sum, cap| sum.checked_add(*cap))?;

    if total < price {
        return None;
    }

    let mut values = vec![0u128; caps.len()];
    let mut remaining = price;

    while remaining > 0 {
        let active: Vec<usize> = (0..caps.len()).filter(|&i| values[i] < caps[i]).collect();

        if active.is_empty() {
            return None;
        }

        let share = remaining / active.len() as u128;
        let remainder = remaining % active.len() as u128;
        let mut paid = 0u128;

        for (rank, i) in active.into_iter().enumerate() {
            let requested = share + u128::from((rank as u128) < remainder);
            let add = requested.min(caps[i] - values[i]);
            values[i] += add;
            paid += add;
        }

        if paid == 0 {
            return None;
        }

        remaining -= paid;
    }

    Some(values)
}

fn valid_name(s: &str) -> bool {
    (1..=128).contains(&s.len()) && s.bytes().all(|b| (33..=126).contains(&b))
}

fn verify(c: &Certificate) -> Result<(), &'static str> {
    if c.version != "genesis-v1-offchain" {
        return Err("version");
    }

    let buyers = &c.input.buyers;
    let offers = &c.input.offers;

    if !(1..=6).contains(&buyers.len()) || offers.len() > 6 {
        return Err("bounds");
    }

    if buyers.windows(2).any(|p| p[0].job_id >= p[1].job_id) {
        return Err("buyer ordering or duplicate");
    }

    if offers.windows(2).any(|p| p[0].offer_id >= p[1].offer_id) {
        return Err("offer ordering or duplicate");
    }

    if offers
        .iter()
        .any(|o| o.component > 1 || o.fee == 0 || !valid_name(&o.provider) || !valid_name(&o.slot))
    {
        return Err("invalid offer");
    }

    if buyers
        .iter()
        .try_fold(0u128, |sum, b| sum.checked_add(b.cap))
        .is_none()
    {
        return Err("capacity overflow");
    }

    if c.input_hash != digest("GENESIS_INPUT", &canonical_input(&c.input)) {
        return Err("input hash");
    }

    if c.certificate_hash != digest("GENESIS_CERT", &canonical_body(c)) {
        return Err("certificate hash");
    }

    // Independent offer-pair recomputation.
    let mut candidates = Vec::new();

    for a in offers.iter().filter(|o| o.component == 0) {
        for b in offers.iter().filter(|o| o.component == 1) {
            let Some(price) = a.fee.checked_add(b.fee) else {
                continue;
            };

            if a.available
                && b.available
                && a.provider != b.provider
                && (a.provider != b.provider || a.slot != b.slot)
                && a.ready_at <= c.input.deadline
                && b.ready_at <= c.input.deadline
                && a.bond >= price
                && b.bond >= price
            {
                candidates.push((price, a.offer_id, b.offer_id));
            }
        }
    }

    let best = candidates.into_iter().min();

    let expected_pair = best.map(|(price, a, b)| Pair {
        offers: vec![a, b],
        price,
    });

    if c.winning_pair != expected_pair {
        return Err("winning pair");
    }

    // Independent exhaustive coalition enumeration.
    let mut rows = Vec::new();

    for mask in 1..(1usize << buyers.len()) {
        let selected: Vec<&Buyer> = buyers
            .iter()
            .enumerate()
            .filter(|(i, _)| mask & (1 << i) != 0)
            .map(|(_, b)| b)
            .collect();

        let caps: Vec<u128> = selected.iter().map(|b| b.cap).collect();

        let capacity: u128 = caps.iter().sum();
        let feasible = best.is_some_and(|(price, _, _)| capacity >= price);

        let amounts = if feasible {
            allocation(&caps, best.unwrap().0)
        } else {
            None
        };

        if feasible && amounts.is_none() {
            return Err("allocation failure");
        }

        rows.push(Coalition {
            allocation: amounts,
            capacity,
            feasible,
            job_ids: selected.iter().map(|b| b.job_id).collect(),
            mask: mask as u64,
        });
    }

    let winners: Vec<u64> = rows.iter().filter(|r| r.feasible).map(|r| r.mask).collect();

    let minimal: Vec<Vec<u64>> = rows
        .iter()
        .filter(|r| {
            r.feasible
                && !winners
                    .iter()
                    .any(|&sub| sub != r.mask && (sub & r.mask) == sub)
        })
        .map(|r| r.job_ids.clone())
        .collect();

    if c.coalitions != rows {
        return Err("coalition outcomes");
    }

    if c.minimal_coalitions != minimal {
        return Err("minimal coalitions");
    }

    Ok(())
}

fn reference() -> Certificate {
    let raw = include_str!("../docs/evidence/R7-02B-01-transaction-witness.json");
    let witness: Witness = serde_json::from_str(raw).expect("invalid historical witness");
    witness.genesis_certificate
}

#[test]
fn verifies_actual_testnet_genesis_certificate() {
    let c = reference();
    verify(&c).expect("Rust certificate verification failed");

    assert_eq!(c.coalitions.len(), 7);
    assert_eq!(c.minimal_coalitions, vec![vec![1, 2, 3]]);
    assert_eq!(
        c.input_hash,
        "ac976b17a3c9b4520cd410709b86d90903af47d84cea1bd993eb72d082af0da7"
    );
    assert_eq!(
        c.certificate_hash,
        "c05c1c7656f4608575e733978c149dd5f6198c8bbf70edebd069e29833a759fb"
    );

    println!("REAL TESTNET GENESIS: RUST VERIFIED");
}

#[test]
fn accepts_distinct_providers_sharing_a_slot_name() {
    let mut c = reference();
    c.input.offers[1].slot = c.input.offers[0].slot.clone();
    c.input_hash = digest("GENESIS_INPUT", &canonical_input(&c.input));
    c.certificate_hash = digest("GENESIS_CERT", &canonical_body(&c));

    verify(&c).expect("different providers have independent capacity slots");
}

#[test]
fn rejects_same_provider_sharing_a_slot_name() {
    let mut c = reference();
    c.input.offers[1].provider = c.input.offers[0].provider.clone();
    c.input.offers[1].slot = c.input.offers[0].slot.clone();
    c.input_hash = digest("GENESIS_INPUT", &canonical_input(&c.input));
    c.certificate_hash = digest("GENESIS_CERT", &canonical_body(&c));

    assert_eq!(verify(&c), Err("winning pair"));
}

#[test]
fn verifies_six_independent_python_certificates() {
    let corpus: Corpus = serde_json::from_str(include_str!(
        "../docs/evidence/R7-02C-certificate-fixtures.json"
    ))
    .expect("invalid fixtures");

    assert_eq!(corpus.cases.len(), 6);

    for case in &corpus.cases {
        verify(&case.certificate)
            .unwrap_or_else(|reason| panic!("{} rejected: {}", case.name, reason));
    }

    println!("CROSS-LANGUAGE FULL CERTIFICATES: 6/6");
}

#[test]
fn rejects_rehashed_forged_allocation() {
    let mut c = reference();

    c.coalitions
        .last_mut()
        .unwrap()
        .allocation
        .as_mut()
        .unwrap()[0] += 1;

    c.certificate_hash = digest("GENESIS_CERT", &canonical_body(&c));

    assert!(verify(&c).is_err());
}

#[test]
fn rejects_rehashed_forged_input() {
    let mut c = reference();

    c.input.buyers[0].cap += 1;
    c.input_hash = digest("GENESIS_INPUT", &canonical_input(&c.input));
    c.certificate_hash = digest("GENESIS_CERT", &canonical_body(&c));

    assert!(verify(&c).is_err());
}

#[test]
fn rejects_rehashed_forged_winner() {
    let mut c = reference();

    c.winning_pair.as_mut().unwrap().price += 1;
    c.certificate_hash = digest("GENESIS_CERT", &canonical_body(&c));

    assert!(verify(&c).is_err());
}
