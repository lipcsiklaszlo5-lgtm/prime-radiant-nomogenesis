from pathlib import Path
import subprocess
import sys

BASE = "b3eb084"

def fail(message: str) -> None:
    print(f"M3-R2-01 SCAFFOLD FAIL: {message}")
    sys.exit(2)

def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"{name}: expected one target, found {count}")
    return text.replace(old, new, 1)

def append_before_final_brace(text: str, block: str, name: str) -> str:
    text = text.rstrip()
    if not text.endswith("}"):
        fail(f"{name}: final brace missing")
    return text[:-1].rstrip() + "\n\n" + block.strip() + "\n}\n"

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
    "?? scripts/m3/m3_r2_01_schema.py",
}

if branch != "feat/m2-escrow":
    fail(f"unexpected branch: {branch}")
if head != BASE:
    fail(f"unexpected HEAD: {head}")
if status != expected_status:
    fail(f"unexpected status: {sorted(status)}")

for name in (
    "src/rescue.rs",
    "src/rescue_schema_tests.rs",
    "docs/worklog/M3-R2-01-schema.md",
):
    if Path(name).exists():
        fail(f"target already exists: {name}")

files = {}
for name in (
    "src/lib.rs",
    "src/withdrawal.rs",
    "src/withdrawal_tests.rs",
    "src/rescue_market_model.rs",
):
    files[name] = Path(name).read_text(encoding="utf-8")

lib = files["src/lib.rs"]

lib = replace_once(
    lib,
    "mod offer;\npub mod settlement;",
    "mod offer;\npub mod rescue;\npub mod settlement;",
    "src/lib.rs module",
)

lib = replace_once(
    lib,
    """    pending_withdrawals: LookupMap<u64, withdrawal::PendingWithdrawal>,
    pending_total: u128,
}""",
    """    pending_withdrawals: LookupMap<u64, withdrawal::PendingWithdrawal>,
    pending_total: u128,
    next_rescue_job_id: u64,
    rescue_cases: LookupMap<[u8; 32], rescue::RescueCase>,
    rescue_jobs: LookupMap<u64, rescue::RescueJob>,
    rescue_mandates: LookupMap<u64, rescue::RescueMandate>,
    rescue_escrow: u128,
}""",
    "src/lib.rs state",
)

lib = replace_once(
    lib,
    """            pending_withdrawals: LookupMap::new(b"pending".as_slice()),
            pending_total: 0,
        }""",
    """            pending_withdrawals: LookupMap::new(b"pending".as_slice()),
            pending_total: 0,
            next_rescue_job_id: 0,
            rescue_cases: LookupMap::new(b"m3cases".as_slice()),
            rescue_jobs: LookupMap::new(b"m3jobs".as_slice()),
            rescue_mandates: LookupMap::new(b"m3mandates".as_slice()),
            rescue_escrow: 0,
        }""",
    "src/lib.rs default",
)

lib = replace_once(
    lib,
    """#[near]
impl Nomogenesis {
    pub fn task_storage_bond""",
    """#[near]
impl Nomogenesis {
    pub fn rescue_escrow_total(&self) -> U128 {
        U128(self.rescue_escrow)
    }

    pub fn next_rescue_job_id(&self) -> u64 {
        self.next_rescue_job_id
    }

    pub fn has_rescue_case(&self, case_id: Vec<u8>) -> bool {
        let Ok(key) = <[u8; 32]>::try_from(case_id) else {
            return false;
        };
        self.rescue_cases.get(&key).is_some()
    }

    pub fn has_rescue_job(&self, job_id: u64) -> bool {
        self.rescue_jobs.get(&job_id).is_some()
    }

    pub fn has_rescue_mandate(&self, job_id: u64) -> bool {
        self.rescue_mandates.get(&job_id).is_some()
    }

    pub fn task_storage_bond""",
    "src/lib.rs views",
)

lib = replace_once(
    lib,
    """#[cfg(test)]
mod withdrawal_tests;

#[cfg(test)]
mod storage_admission_tests;""",
    """#[cfg(test)]
mod withdrawal_tests;

#[cfg(test)]
mod rescue_schema_tests;

#[cfg(test)]
mod storage_admission_tests;""",
    "src/lib.rs test module",
)

files["src/lib.rs"] = lib

files["src/withdrawal.rs"] = replace_once(
    files["src/withdrawal.rs"],
    """            self.economic_escrow,
            self.collateral_escrow,
            new_claimable_total,""",
    """            self.economic_escrow,
            self.collateral_escrow,
            self.rescue_escrow,
            new_claimable_total,""",
    "src/withdrawal.rs",
)

withdrawal_test = """
#[test]
fn active_rescue_liability_is_protected_from_withdrawal() {
    let mut c = earned_credit();
    let protected = NearToken::from_near(101).as_yoctonear();
    c.rescue_escrow = protected;

    actor(0, 160);

    assert!(
        catch_unwind(AssertUnwindSafe(|| {
            c.withdraw(U128(5));
        }))
        .is_err()
    );

    assert_eq!(c.rescue_escrow_total(), U128(protected));
    assert_eq!(c.get_claimable(accounts(0)), U128(12));
    assert_eq!(c.payout_totals(), (U128(48), U128(0)));
    assert!(c.get_pending_withdrawal(0).is_none());
}
"""

files["src/withdrawal_tests.rs"] = (
    files["src/withdrawal_tests.rs"].rstrip()
    + "\n\n"
    + withdrawal_test.strip()
    + "\n"
)

model = replace_once(
    files["src/rescue_market_model.rs"],
    """            let price = a.fee.checked_add(b.fee).ok_or("price overflow")?;
            if a.bond < price || b.bond < price {""",
    """            let Some(price) = a.fee.checked_add(b.fee) else {
                continue;
            };
            if a.bond < price || b.bond < price {""",
    "src/rescue_market_model.rs overflow",
)

model_tests = """
    #[test]
    fn invalid_mandate_boundaries_are_rejected() {
        assert!(
            allocate_cost(
                &[
                    Mandate { job_id: 1, cap: 5 },
                    Mandate { job_id: 1, cap: 5 },
                ],
                5,
            )
            .is_err()
        );

        assert!(
            allocate_cost(
                &[
                    Mandate { job_id: 1, cap: 2 },
                    Mandate { job_id: 2, cap: 2 },
                ],
                5,
            )
            .is_err()
        );

        assert!(
            allocate_cost(
                &[
                    Mandate {
                        job_id: 1,
                        cap: u128::MAX,
                    },
                    Mandate { job_id: 2, cap: 1 },
                ],
                1,
            )
            .is_err()
        );

        let too_many: Vec<Mandate> = (0..=MAX_SPONSORS as u64)
            .map(|job_id| Mandate { job_id, cap: 1 })
            .collect();

        assert!(allocate_cost(&too_many, 1).is_err());
    }

    #[test]
    fn overflowing_pair_does_not_block_valid_pair() {
        let mut overflow_a = offer(1, 1, "overflow-a", u128::MAX);
        let mut overflow_b = offer(2, 2, "valid-a", 1);
        let mut valid_a = offer(3, 1, "valid-a", 3);
        let mut valid_b = offer(4, 2, "valid-b", 4);

        overflow_a.bond = u128::MAX;
        overflow_b.bond = u128::MAX;
        valid_a.bond = 7;
        valid_b.bond = 7;

        let bundle = clear_bundle(
            &[Mandate { job_id: 1, cap: 10 }],
            [1, 2],
            &[overflow_a, overflow_b, valid_a, valid_b],
            10,
        )
        .unwrap();

        assert_eq!(bundle.price, 7);
        assert_eq!([bundle.offers[0].id, bundle.offers[1].id], [3, 4]);
    }

    #[test]
    fn expiry_boundary_and_duplicate_ids_are_rejected() {
        assert!(
            clear_bundle(
                &[Mandate { job_id: 1, cap: 10 }],
                [1, 2],
                &[offer(1, 1, "a", 2), offer(2, 2, "b", 2)],
                50,
            )
            .is_err()
        );

        assert!(
            clear_bundle(
                &[Mandate { job_id: 1, cap: 10 }],
                [1, 2],
                &[offer(1, 1, "a", 2), offer(1, 2, "b", 2)],
                10,
            )
            .is_err()
        );
    }

    #[test]
    fn equal_price_tie_breaks_by_offer_ids() {
        let bundle = clear_bundle(
            &[Mandate { job_id: 1, cap: 10 }],
            [1, 2],
            &[
                offer(5, 1, "a-five", 3),
                offer(9, 2, "b-nine", 4),
                offer(3, 1, "a-three", 3),
                offer(8, 2, "b-eight", 4),
            ],
            10,
        )
        .unwrap();

        assert_eq!([bundle.offers[0].id, bundle.offers[1].id], [3, 8]);
    }
"""

files["src/rescue_market_model.rs"] = append_before_final_brace(
    model,
    model_tests,
    "src/rescue_market_model.rs",
)

files["src/rescue.rs"] = """
use near_sdk::{AccountId, near};

pub const COMPONENT_COUNT: usize = 2;
pub const MAX_RESCUE_JOBS: usize = 6;
pub const COMMITMENT_BYTES: usize = 32;

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueCasePhase {
    Open,
    OriginalDelivered,
    BundleAwarded,
    Closed,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueJobPhase {
    Funded,
    Accepted,
    Completed,
    Expired,
    Cancelled,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueMandatePhase {
    Open,
    Locked,
    Released,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MandateReleaseReason {
    Revoked,
    JobCancelled,
    JobExpired,
    ZeroAllocation,
    Settled,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueCase {
    pub id: [u8; COMMITMENT_BYTES],
    pub descriptor_version: u16,
    pub descriptor_hash: [u8; COMMITMENT_BYTES],
    pub original_provider: AccountId,
    pub component_commitments: [[u8; COMMITMENT_BYTES]; COMPONENT_COUNT],
    pub dependency_deadline: u64,
    pub bid_close: u64,
    pub award_close: u64,
    pub recovery_deadline: u64,
    pub job_ids: Vec<u64>,
    pub phase: RescueCasePhase,
    pub awarded_bundle_id: Option<u64>,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueJob {
    pub id: u64,
    pub case_id: [u8; COMMITMENT_BYTES],
    pub buyer: AccountId,
    pub worker: AccountId,
    pub worker_reward: u128,
    pub held_worker_reward: u128,
    pub result_commitment: [u8; COMMITMENT_BYTES],
    pub threshold: Option<u128>,
    pub final_deadline: u64,
    pub phase: RescueJobPhase,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueMandate {
    pub job_id: u64,
    pub original_cap: u128,
    pub held_principal: u128,
    pub phase: RescueMandatePhase,
    pub locked_bundle_id: Option<u64>,
    pub locked_allocation: Option<u128>,
    pub release_reason: Option<MandateReleaseReason>,
}
"""

files["src/rescue_schema_tests.rs"] = """
use super::*;
use crate::rescue::{
    COMMITMENT_BYTES, COMPONENT_COUNT, MAX_RESCUE_JOBS, RescueCase, RescueCasePhase, RescueJob,
    RescueJobPhase, RescueMandate, RescueMandatePhase,
};

#[test]
fn default_schema_is_empty_and_zero_liability() {
    let c = Nomogenesis::default();

    assert_eq!(c.next_rescue_job_id(), 0);
    assert!(!c.has_rescue_case(vec![0; COMMITMENT_BYTES]));
    assert!(!c.has_rescue_job(0));
    assert!(!c.has_rescue_mandate(0));
    assert_eq!(c.rescue_escrow_total(), U128(0));
}

#[test]
fn maximum_record_serialization_is_bounded_and_reported() {
    let account: AccountId = "a".repeat(64).parse().unwrap();
    let case_id = [1; COMMITMENT_BYTES];

    let case = RescueCase {
        id: case_id,
        descriptor_version: u16::MAX,
        descriptor_hash: [2; COMMITMENT_BYTES],
        original_provider: account.clone(),
        component_commitments: [
            [3; COMMITMENT_BYTES],
            [4; COMMITMENT_BYTES],
        ],
        dependency_deadline: u64::MAX - 4,
        bid_close: u64::MAX - 3,
        award_close: u64::MAX - 2,
        recovery_deadline: u64::MAX - 1,
        job_ids: vec![u64::MAX; MAX_RESCUE_JOBS],
        phase: RescueCasePhase::BundleAwarded,
        awarded_bundle_id: Some(u64::MAX),
    };

    let job = RescueJob {
        id: u64::MAX,
        case_id,
        buyer: account.clone(),
        worker: account,
        worker_reward: u128::MAX,
        held_worker_reward: u128::MAX,
        result_commitment: [5; COMMITMENT_BYTES],
        threshold: Some(u128::MAX),
        final_deadline: u64::MAX,
        phase: RescueJobPhase::Accepted,
    };

    let mandate = RescueMandate {
        job_id: u64::MAX,
        original_cap: u128::MAX,
        held_principal: u128::MAX,
        phase: RescueMandatePhase::Locked,
        locked_bundle_id: Some(u64::MAX),
        locked_allocation: Some(u128::MAX),
        release_reason: None,
    };

    let case_bytes = near_sdk::borsh::to_vec(&case).unwrap();
    let job_bytes = near_sdk::borsh::to_vec(&job).unwrap();
    let mandate_bytes = near_sdk::borsh::to_vec(&mandate).unwrap();

    println!(
        "M3_SERIALIZED_BYTES case={} job={} mandate={}",
        case_bytes.len(),
        job_bytes.len(),
        mandate_bytes.len()
    );

    assert_eq!(case.component_commitments.len(), COMPONENT_COUNT);
    assert_eq!(case.job_ids.len(), MAX_RESCUE_JOBS);
    assert!(case_bytes.len() <= 2_048);
    assert!(job_bytes.len() <= 1_024);
    assert!(mandate_bytes.len() <= 512);
}
"""

files["docs/worklog/M3-R2-01-schema.md"] = """
# M3-R2-01 — Zero-liability persistent schema

**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `b3eb084`
**State:** scaffold generated; verification pending

## Purpose

Introduce bounded M3 persistent record types before accepting M3 funds.
Protect active M3 principal in the native-withdrawal backing calculation and
close identified R1 arithmetic and admission boundaries.

## Builder command

`python3 scripts/m3/m3_r2_01_schema.py`

## Intended verification

- focused rescue-market boundary tests;
- empty-schema and serialized-record checks;
- withdrawal tests including active M3 liability;
- full Rust regression;
- Clippy with warnings denied;
- WASM target check;
- `git diff --check`.

## Claim boundary

No M3 funding, award, mutation or settlement endpoint is enabled. Serialized
Borsh length is not yet a real Sandbox storage-cost quote.

## Exactly one next action

Run verification and record the observed results before commit.
"""

for name, content in files.items():
    content = content.strip() + "\n"
    if any(line.rstrip() != line for line in content.splitlines()):
        fail(f"trailing whitespace prepared for {name}")
    Path(name).write_text(content, encoding="utf-8")

required = {
    "src/lib.rs": (
        "rescue_escrow: u128",
        "rescue_escrow_total",
        'LookupMap::new(b"m3cases".as_slice())',
    ),
    "src/withdrawal.rs": (
        "self.rescue_escrow",
    ),
    "src/rescue_market_model.rs": (
        "overflowing_pair_does_not_block_valid_pair",
        "let Some(price)",
    ),
    "src/rescue.rs": (
        "pub struct RescueCase",
        "pub struct RescueJob",
        "pub struct RescueMandate",
    ),
    "src/rescue_schema_tests.rs": (
        "M3_SERIALIZED_BYTES",
        "default_schema_is_empty_and_zero_liability",
    ),
}

for name, markers in required.items():
    text = Path(name).read_text(encoding="utf-8")
    for marker in markers:
        if marker not in text:
            fail(f"{name}: missing marker {marker}")

print("M3-R2-01 SCAFFOLD PASS")
for name in sorted(files):
    print(name)
