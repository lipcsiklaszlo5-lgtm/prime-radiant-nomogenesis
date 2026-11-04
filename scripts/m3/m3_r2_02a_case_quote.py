from pathlib import Path
import subprocess
import sys

BASE = "b9e53f1"

def fail(message: str) -> None:
    print(f"M3-R2-02A SCAFFOLD FAIL: {message}")
    sys.exit(2)

def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"{name}: expected one target, found {count}")
    return text.replace(old, new, 1)

branch = subprocess.check_output(
    ["git", "branch", "--show-current"], text=True
).strip()
head = subprocess.check_output(
    ["git", "rev-parse", "--short", "HEAD"], text=True
).strip()
status = set(
    subprocess.check_output(
        ["git", "status", "--porcelain"], text=True
    ).splitlines()
)

expected_status = {
    "?? sandbox/real_low_margin_audit.cjs",
    "?? scripts/m3/m3_r2_02a_case_quote.py",
}

if branch != "feat/m2-escrow":
    fail(f"unexpected branch: {branch}")
if head != BASE:
    fail(f"unexpected HEAD: {head}")
if status != expected_status:
    fail(f"unexpected status: {sorted(status)}")

for name in (
    "src/rescue_case_tests.rs",
    "docs/worklog/M3-R2-02A-case-quote.md",
):
    if Path(name).exists():
        fail(f"target already exists: {name}")

rescue_path = Path("src/rescue.rs")
rescue = rescue_path.read_text(encoding="utf-8")

rescue = replace_once(
    rescue,
    "use near_sdk::{AccountId, near};",
    """use near_sdk::{AccountId, env, json_types::U128, near};
use sha2::{Digest, Sha256};""",
    "src/rescue.rs imports",
)

rescue = replace_once(
    rescue,
    """pub const COMPONENT_COUNT: usize = 2;
pub const MAX_RESCUE_JOBS: usize = 6;
pub const COMMITMENT_BYTES: usize = 32;""",
    """pub const COMPONENT_COUNT: usize = 2;
pub const MAX_RESCUE_JOBS: usize = 6;
pub const COMMITMENT_BYTES: usize = 32;
pub const MAX_COMPONENT_PAYLOAD_BYTES: usize = 256;

pub const RAW_ENTRY_OVERHEAD_BYTES: u64 = 40;
pub const MAX_CASE_RECORD_BYTES: u64 = 814;
pub const MAX_JOB_RECORD_BYTES: u64 = 266;
pub const MAX_MANDATE_RECORD_BYTES: u64 = 68;

const CASE_PREFIX_BYTES: u64 = 7;
const JOB_PREFIX_BYTES: u64 = 6;
const MANDATE_PREFIX_BYTES: u64 = 10;
const CLAIM_PREFIX_BYTES: u64 = 6;
const U64_KEY_BYTES: u64 = 8;
const ACCOUNT_LENGTH_PREFIX_BYTES: u64 = 4;
const MAX_ACCOUNT_BYTES: u64 = 64;
const U128_VALUE_BYTES: u64 = 16;

pub const CASE_STORAGE_BYTES: u64 = RAW_ENTRY_OVERHEAD_BYTES
    + CASE_PREFIX_BYTES
    + COMMITMENT_BYTES as u64
    + MAX_CASE_RECORD_BYTES;

pub const JOB_STORAGE_BYTES: u64 = (
    RAW_ENTRY_OVERHEAD_BYTES
        + JOB_PREFIX_BYTES
        + U64_KEY_BYTES
        + MAX_JOB_RECORD_BYTES
) + (
    RAW_ENTRY_OVERHEAD_BYTES
        + MANDATE_PREFIX_BYTES
        + U64_KEY_BYTES
        + MAX_MANDATE_RECORD_BYTES
) + (
    RAW_ENTRY_OVERHEAD_BYTES
        + CLAIM_PREFIX_BYTES
        + ACCOUNT_LENGTH_PREFIX_BYTES
        + MAX_ACCOUNT_BYTES
        + U128_VALUE_BYTES
);""",
    "src/rescue.rs constants",
)

rescue = rescue.replace(
    "#[near(serializers = [borsh])]\n#[derive(Debug, Clone, PartialEq, Eq)]\npub enum",
    "#[near(serializers = [borsh, json])]\n#[derive(Debug, Clone, PartialEq, Eq)]\npub enum",
)

rescue = replace_once(
    rescue,
    """    pub phase: RescueCasePhase,
    pub awarded_bundle_id: Option<u64>,
}""",
    """    pub phase: RescueCasePhase,
    pub awarded_bundle_id: Option<u64>,
    pub resolved_payloads: [Option<Vec<u8>>; COMPONENT_COUNT],
}""",
    "src/rescue.rs bounded payload slots",
)

rescue_addition = r'''
#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueCaseDescriptorInput {
    pub descriptor_version: u16,
    pub original_provider: AccountId,
    pub component_commitments: Vec<Vec<u8>>,
    pub dependency_deadline: u64,
    pub bid_close: u64,
    pub award_close: u64,
    pub recovery_deadline: u64,
}

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueCaseView {
    pub id: Vec<u8>,
    pub descriptor_version: u16,
    pub descriptor_hash: Vec<u8>,
    pub original_provider: AccountId,
    pub component_commitments: Vec<Vec<u8>>,
    pub dependency_deadline: u64,
    pub bid_close: u64,
    pub award_close: u64,
    pub recovery_deadline: u64,
    pub job_ids: Vec<u64>,
    pub phase: RescueCasePhase,
    pub awarded_bundle_id: Option<u64>,
    pub resolved_payloads: Vec<Option<Vec<u8>>>,
}

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct M3StorageQuoteView {
    pub quote_version: u16,
    pub case_storage_bytes: u64,
    pub case_storage_cost: U128,
    pub job_storage_bytes: u64,
    pub job_storage_cost: U128,
}

impl From<&RescueCase> for RescueCaseView {
    fn from(value: &RescueCase) -> Self {
        Self {
            id: value.id.to_vec(),
            descriptor_version: value.descriptor_version,
            descriptor_hash: value.descriptor_hash.to_vec(),
            original_provider: value.original_provider.clone(),
            component_commitments: value
                .component_commitments
                .iter()
                .map(|commitment| commitment.to_vec())
                .collect(),
            dependency_deadline: value.dependency_deadline,
            bid_close: value.bid_close,
            award_close: value.award_close,
            recovery_deadline: value.recovery_deadline,
            job_ids: value.job_ids.clone(),
            phase: value.phase.clone(),
            awarded_bundle_id: value.awarded_bundle_id,
            resolved_payloads: value.resolved_payloads.to_vec(),
        }
    }
}

pub fn parse_case_id(value: Vec<u8>) -> Result<[u8; COMMITMENT_BYTES], &'static str> {
    value.try_into().map_err(|_| "invalid rescue case ID")
}

pub fn parse_component_commitments(
    values: Vec<Vec<u8>>,
) -> Result<[[u8; COMMITMENT_BYTES]; COMPONENT_COUNT], &'static str> {
    if values.len() != COMPONENT_COUNT {
        return Err("exactly two component commitments required");
    }

    let mut values = values.into_iter();
    let first = values
        .next()
        .expect("length checked")
        .try_into()
        .map_err(|_| "invalid component commitment")?;
    let second = values
        .next()
        .expect("length checked")
        .try_into()
        .map_err(|_| "invalid component commitment")?;

    Ok([first, second])
}

pub fn case_storage_cost() -> u128 {
    env::storage_byte_cost()
        .as_yoctonear()
        .checked_mul(u128::from(CASE_STORAGE_BYTES))
        .expect("case storage quote overflow")
}

pub fn job_storage_cost() -> u128 {
    env::storage_byte_cost()
        .as_yoctonear()
        .checked_mul(u128::from(JOB_STORAGE_BYTES))
        .expect("job storage quote overflow")
}

pub fn storage_quote() -> M3StorageQuoteView {
    M3StorageQuoteView {
        quote_version: 1,
        case_storage_bytes: CASE_STORAGE_BYTES,
        case_storage_cost: U128(case_storage_cost()),
        job_storage_bytes: JOB_STORAGE_BYTES,
        job_storage_cost: U128(job_storage_cost()),
    }
}

fn hash_bytes(hasher: &mut Sha256, value: &[u8]) {
    let length = u32::try_from(value.len()).expect("canonical field too long");
    hasher.update(length.to_be_bytes());
    hasher.update(value);
}

pub fn derive_descriptor_hash(
    descriptor_version: u16,
    original_provider: &AccountId,
    component_commitments: &[[u8; COMMITMENT_BYTES]; COMPONENT_COUNT],
    deadlines: [u64; 4],
) -> [u8; COMMITMENT_BYTES] {
    let mut hasher = Sha256::new();
    hasher.update(b"nomogenesis:rescue-descriptor");
    hasher.update(descriptor_version.to_be_bytes());
    hash_bytes(&mut hasher, original_provider.as_str().as_bytes());

    for commitment in component_commitments {
        hasher.update(commitment);
    }
    for deadline in deadlines {
        hasher.update(deadline.to_be_bytes());
    }

    hasher.finalize().into()
}

pub fn derive_case_id(
    contract_account: &AccountId,
    descriptor_hash: &[u8; COMMITMENT_BYTES],
) -> [u8; COMMITMENT_BYTES] {
    let mut hasher = Sha256::new();
    hasher.update(b"nomogenesis:rescue-case");
    hash_bytes(&mut hasher, contract_account.as_str().as_bytes());
    hasher.update(descriptor_hash);
    hasher.finalize().into()
}
'''

if "pub struct RescueCaseView" in rescue:
    fail("src/rescue.rs: case view already exists")

rescue = rescue.rstrip() + "\n\n" + rescue_addition.strip() + "\n"
rescue_path.write_text(rescue, encoding="utf-8")

lib_path = Path("src/lib.rs")
lib = lib_path.read_text(encoding="utf-8")

case_methods = r'''
    pub fn m3_storage_quote(&self) -> rescue::M3StorageQuoteView {
        rescue::storage_quote()
    }

    pub fn get_rescue_case(&self, case_id: Vec<u8>) -> Option<rescue::RescueCaseView> {
        let key = rescue::parse_case_id(case_id).ok()?;
        self.rescue_cases
            .get(&key)
            .map(rescue::RescueCaseView::from)
    }

    #[payable]
    pub fn create_rescue_case(
        &mut self,
        descriptor: rescue::RescueCaseDescriptorInput,
    ) -> Vec<u8> {
        let rescue::RescueCaseDescriptorInput {
            descriptor_version,
            original_provider,
            component_commitments,
            dependency_deadline,
            bid_close,
            award_close,
            recovery_deadline,
        } = descriptor;

        let now = env::block_timestamp();

        assert_eq!(descriptor_version, 1, "unsupported descriptor version");
        assert_ne!(
            original_provider,
            env::current_account_id(),
            "contract cannot be original provider"
        );
        assert!(
            now < dependency_deadline
                && dependency_deadline < bid_close
                && bid_close < award_close
                && award_close < recovery_deadline,
            "invalid rescue case deadlines"
        );

        let commitments = rescue::parse_component_commitments(component_commitments)
            .expect("invalid component commitments");
        assert_ne!(
            commitments[0], commitments[1],
            "component commitments must differ"
        );

        let deadlines = [
            dependency_deadline,
            bid_close,
            award_close,
            recovery_deadline,
        ];
        let descriptor_hash = rescue::derive_descriptor_hash(
            descriptor_version,
            &original_provider,
            &commitments,
            deadlines,
        );
        let case_id =
            rescue::derive_case_id(&env::current_account_id(), &descriptor_hash);

        assert!(
            self.rescue_cases.get(&case_id).is_none(),
            "rescue case already exists"
        );

        let storage_payment = rescue::case_storage_cost();
        assert_eq!(
            env::attached_deposit().as_yoctonear(),
            storage_payment,
            "incorrect rescue case storage deposit"
        );

        let next_storage = self
            .storage_reserves
            .checked_add(storage_payment)
            .expect("storage reserve overflow");

        self.rescue_cases.insert(
            case_id,
            rescue::RescueCase {
                id: case_id,
                descriptor_version,
                descriptor_hash,
                original_provider,
                component_commitments: commitments,
                dependency_deadline,
                bid_close,
                award_close,
                recovery_deadline,
                job_ids: Vec::new(),
                phase: rescue::RescueCasePhase::Open,
                awarded_bundle_id: None,
                resolved_payloads: [None, None],
            },
        );
        self.storage_reserves = next_storage;

        case_id.to_vec()
    }
'''

lib = replace_once(
    lib,
    """#[near]
impl Nomogenesis {
    pub fn rescue_escrow_total""",
    """#[near]
impl Nomogenesis {
""" + case_methods.strip("\n") + """

    pub fn rescue_escrow_total""",
    "src/lib.rs case methods",
)

lib = replace_once(
    lib,
    """#[cfg(test)]
mod rescue_schema_tests;

#[cfg(test)]
mod storage_admission_tests;""",
    """#[cfg(test)]
mod rescue_schema_tests;

#[cfg(test)]
mod rescue_case_tests;

#[cfg(test)]
mod storage_admission_tests;""",
    "src/lib.rs case test module",
)

lib_path.write_text(lib, encoding="utf-8")

schema_path = Path("src/rescue_schema_tests.rs")
schema = schema_path.read_text(encoding="utf-8")

schema = replace_once(
    schema,
    """    COMMITMENT_BYTES, COMPONENT_COUNT, MAX_RESCUE_JOBS, RescueCase, RescueCasePhase, RescueJob,
    RescueJobPhase, RescueMandate, RescueMandatePhase,""",
    """    COMMITMENT_BYTES, COMPONENT_COUNT, MAX_CASE_RECORD_BYTES, MAX_COMPONENT_PAYLOAD_BYTES,
    MAX_JOB_RECORD_BYTES, MAX_MANDATE_RECORD_BYTES, MAX_RESCUE_JOBS, RescueCase, RescueCasePhase,
    RescueJob, RescueJobPhase, RescueMandate, RescueMandatePhase,""",
    "src/rescue_schema_tests.rs imports",
)

schema = replace_once(
    schema,
    """        phase: RescueCasePhase::BundleAwarded,
        awarded_bundle_id: Some(u64::MAX),
    };""",
    """        phase: RescueCasePhase::BundleAwarded,
        awarded_bundle_id: Some(u64::MAX),
        resolved_payloads: [
            Some(vec![6; MAX_COMPONENT_PAYLOAD_BYTES]),
            Some(vec![7; MAX_COMPONENT_PAYLOAD_BYTES]),
        ],
    };""",
    "src/rescue_schema_tests.rs payloads",
)

schema = replace_once(
    schema,
    """    assert!(case_bytes.len() <= 2_048);
    assert!(job_bytes.len() <= 1_024);
    assert!(mandate_bytes.len() <= 512);""",
    """    assert_eq!(case_bytes.len() as u64, MAX_CASE_RECORD_BYTES);
    assert_eq!(job_bytes.len() as u64, MAX_JOB_RECORD_BYTES);
    assert_eq!(mandate_bytes.len() as u64, MAX_MANDATE_RECORD_BYTES);""",
    "src/rescue_schema_tests.rs exact sizes",
)

schema_path.write_text(schema, encoding="utf-8")

Path("src/rescue_case_tests.rs").write_text(r'''
use super::*;
use crate::rescue::{
    CASE_STORAGE_BYTES, JOB_STORAGE_BYTES, RescueCaseDescriptorInput, RescueCasePhase,
};

use near_sdk::{
    NearToken,
    test_utils::{VMContextBuilder, accounts},
    testing_env,
};

use std::panic::{AssertUnwindSafe, catch_unwind};

fn context(actor: usize, now: u64, deposit: u128) {
    let mut builder = VMContextBuilder::new();
    let current: AccountId = "contract.near".parse().unwrap();

    builder
        .current_account_id(current)
        .signer_account_id(accounts(actor))
        .predecessor_account_id(accounts(actor))
        .block_timestamp(now)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100));

    testing_env!(builder.build());
}

fn rejected(call: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(call)).is_err());
}

fn commitments() -> Vec<Vec<u8>> {
    vec![vec![1; 32], vec![2; 32]]
}
fn descriptor(
    descriptor_version: u16,
    original_provider: AccountId,
    component_commitments: Vec<Vec<u8>>,
    dependency_deadline: u64,
    bid_close: u64,
    award_close: u64,
    recovery_deadline: u64,
) -> RescueCaseDescriptorInput {
    RescueCaseDescriptorInput {
        descriptor_version,
        original_provider,
        component_commitments,
        dependency_deadline,
        bid_close,
        award_close,
        recovery_deadline,
    }
}

#[test]
fn storage_quote_is_derived_from_bounded_records() {
    context(0, 100, 0);
    let c = Nomogenesis::default();
    let quote = c.m3_storage_quote();

    assert_eq!(quote.quote_version, 1);
    assert_eq!(quote.case_storage_bytes, 893);
    assert_eq!(quote.job_storage_bytes, 576);
    assert_eq!(quote.case_storage_bytes, CASE_STORAGE_BYTES);
    assert_eq!(quote.job_storage_bytes, JOB_STORAGE_BYTES);

    assert_eq!(
        quote.case_storage_cost.0,
        env::storage_byte_cost()
            .as_yoctonear()
            .checked_mul(u128::from(CASE_STORAGE_BYTES))
            .unwrap()
    );
}

#[test]
fn case_creation_requires_exact_storage_and_is_canonical() {
    let mut c = Nomogenesis::default();

    context(0, 100, 0);
    let quote = c.m3_storage_quote().case_storage_cost.0;

    for deposit in [0, quote - 1, quote + 1] {
        context(0, 100, deposit);
        rejected(|| {
            c.create_rescue_case(descriptor(
                1,
                accounts(1),
                commitments(),
                200,
                220,
                240,
                260,
            ));
        });
    }

    assert_eq!(c.storage_reserves, 0);

    context(0, 100, quote);
    let before = env::storage_usage();
    let case_id = c.create_rescue_case(descriptor(
        1,
        accounts(1),
        commitments(),
        200,
        220,
        240,
        260,
    ));

    c.rescue_cases.flush();
    let measured = env::storage_usage() - before;

    println!(
        "M3_CASE_STORAGE measured={} quoted={}",
        measured, CASE_STORAGE_BYTES
    );

    assert!(measured > 0);
    assert!(measured <= CASE_STORAGE_BYTES);
    assert_eq!(c.storage_reserves, quote);
    assert!(c.has_rescue_case(case_id.clone()));

    let view = c.get_rescue_case(case_id.clone()).unwrap();
    assert_eq!(view.id, case_id);
    assert_eq!(view.original_provider, accounts(1));
    assert_eq!(view.phase, RescueCasePhase::Open);
    assert!(view.job_ids.is_empty());
    assert_eq!(view.resolved_payloads, vec![None, None]);

    let case_before_replay = c.get_rescue_case(case_id.clone()).unwrap();

    context(0, 100, quote);
    rejected(|| {
        c.create_rescue_case(descriptor(
            1,
            accounts(1),
            commitments(),
            200,
            220,
            240,
            260,
        ));
    });

    let case_after_replay = c.get_rescue_case(case_id).unwrap();
    assert_eq!(case_after_replay, case_before_replay);
    assert_eq!(c.storage_reserves, quote);
}

#[test]
fn invalid_descriptor_creates_no_case_or_storage_liability() {
    let mut c = Nomogenesis::default();

    context(0, 100, 0);
    let quote = c.m3_storage_quote().case_storage_cost.0;

    context(0, 100, quote);
    rejected(|| {
        c.create_rescue_case(descriptor(
            0,
            accounts(1),
            commitments(),
            200,
            220,
            240,
            260,
        ));
    });

    rejected(|| {
        c.create_rescue_case(descriptor(
            1,
            accounts(1),
            vec![vec![1; 32]],
            200,
            220,
            240,
            260,
        ));
    });

    rejected(|| {
        c.create_rescue_case(descriptor(
            1,
            accounts(1),
            vec![vec![1; 32], vec![1; 32]],
            200,
            220,
            240,
            260,
        ));
    });

    rejected(|| {
        c.create_rescue_case(descriptor(
            1,
            accounts(1),
            commitments(),
            200,
            200,
            240,
            260,
        ));
    });

    assert_eq!(c.storage_reserves, 0);
    assert_eq!(c.next_rescue_job_id(), 0);
}

#[test]
fn case_and_quote_survive_state_reload() {
    let mut c = Nomogenesis::default();

    context(0, 100, 0);
    let quote = c.m3_storage_quote().case_storage_cost.0;

    context(0, 100, quote);
    let case_id = c.create_rescue_case(descriptor(
        1,
        accounts(1),
        commitments(),
        200,
        220,
        240,
        260,
    ));

    c.rescue_cases.flush();
    env::state_write(&c);
    drop(c);

    let reloaded: Nomogenesis = env::state_read().expect("state missing");

    assert!(reloaded.has_rescue_case(case_id.clone()));
    assert_eq!(
        reloaded.get_rescue_case(case_id).unwrap().phase,
        RescueCasePhase::Open
    );
    assert_eq!(reloaded.storage_reserves, quote);
    assert_eq!(
        reloaded.m3_storage_quote().case_storage_cost,
        U128(quote)
    );
}
'''.strip() + "\n", encoding="utf-8")

Path("docs/worklog/M3-R2-02A-case-quote.md").write_text(r'''
# M3-R2-02A — Canonical case and storage quote

**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `b9e53f1`
**State:** scaffold generated; verification pending

## Purpose

Create immutable rescue cases using a contract-bound canonical identifier and
a storage-only payable entrypoint. Establish bounded case and future job quotes
before enabling worker reward or rescue-cap funding.

## Quote derivation

The quote uses:

- measured 40-byte raw key/value overhead;
- actual M3 storage-prefix and key lengths;
- exact maximum Borsh record lengths;
- six future case job references;
- one future bundle identifier;
- two bounded 256-byte resolved payloads;
- job, mandate and worst-case buyer claimable records.

Case quote: 893 bytes.

Future job-plus-mandate quote: 576 bytes.

## Builder command

`python3 scripts/m3/m3_r2_02a_case_quote.py`

## Intended verification

- exact descriptor and deposit rejection;
- canonical duplicate rejection;
- explicit `LookupMap::flush()` storage measurement;
- state reload;
- full Rust regression;
- Clippy, WASM target and diff checks.

## Claim boundary

This checkpoint accepts only case storage payment. It does not accept worker
reward, rescue cap or provider bond. Host-unit storage measurement is not yet
real Sandbox evidence.

## Exactly one next action

Verify and checkpoint R2-02A, then implement atomic funded job plus mandate.
'''.strip() + "\n", encoding="utf-8")

for name in (
    "src/rescue.rs",
    "src/lib.rs",
    "src/rescue_schema_tests.rs",
    "src/rescue_case_tests.rs",
    "docs/worklog/M3-R2-02A-case-quote.md",
):
    text = Path(name).read_text(encoding="utf-8")
    if any(line.rstrip() != line for line in text.splitlines()):
        fail(f"trailing whitespace in {name}")

required = {
    "src/rescue.rs": (
        "CASE_STORAGE_BYTES",
        "JOB_STORAGE_BYTES",
        "pub fn derive_descriptor_hash",
        "pub struct RescueCaseView",
        "resolved_payloads",
    ),
    "src/lib.rs": (
        "pub fn create_rescue_case",
        "pub fn m3_storage_quote",
        "mod rescue_case_tests",
    ),
    "src/rescue_case_tests.rs": (
        "M3_CASE_STORAGE",
        "case_and_quote_survive_state_reload",
    ),
}

for name, markers in required.items():
    text = Path(name).read_text(encoding="utf-8")
    for marker in markers:
        if marker not in text:
            fail(f"{name}: missing marker {marker}")

print("M3-R2-02A SCAFFOLD PASS")
for name in (
    "src/rescue.rs",
    "src/lib.rs",
    "src/rescue_schema_tests.rs",
    "src/rescue_case_tests.rs",
    "docs/worklog/M3-R2-02A-case-quote.md",
    "scripts/m3/m3_r2_02a_case_quote.py",
):
    print(name)
