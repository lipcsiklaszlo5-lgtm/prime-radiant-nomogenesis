"""R3-01B: bounded offer/bundle records and prepaid storage quotes."""

from pathlib import Path
import subprocess
import sys

BASE = "97e9178"
SELF = "scripts/m3/m3_r3_01b_schema.py"
AUDIT = "sandbox/real_low_margin_audit.cjs"


def git(*args):
    return subprocess.check_output(["git", *args], text=True)


def replace(text, old, new, name):
    count = text.count(old)
    if count != 1:
        raise ValueError(f"{name}: expected one anchor, found {count}: {old[:80]!r}")
    return text.replace(old, new, 1)


def main():
    if git("branch", "--show-current").strip() != "feat/m2-escrow":
        raise ValueError("unexpected branch")
    if git("rev-parse", "--short", "HEAD").strip() != BASE:
        raise ValueError("unexpected HEAD")
    status = set(git("status", "--porcelain").splitlines())
    allowed = {f"?? {AUDIT}", f"?? {SELF}"}
    if status != allowed or git("diff", "--cached", "--name-only").strip():
        raise ValueError(f"unexpected worktree: {sorted(status)}")
    if Path("docs/worklog/M3-R3-01B-schema.md").exists():
        raise ValueError("worklog already exists")

    files = {name: Path(name).read_text(encoding="utf-8") for name in (
        "src/rescue.rs", "src/lib.rs", "src/rescue_schema_tests.rs",
        "src/rescue_case_tests.rs", "sandbox/m3_rescue_lifecycle.cjs",
        "docs/HANDOFF.md",
    )}

    def edit(name, old, new):
        files[name] = replace(files[name], old, new, name)

    edit("src/rescue.rs", "pub const MAX_RESCUE_JOBS: usize = 6;",
         "pub const MAX_RESCUE_JOBS: usize = 6;\n"
         "pub const MAX_RESCUE_OFFERS: usize = 6;\n"
         "pub const MAX_RESCUE_SLOT_BYTES: usize = 64;")
    edit("src/rescue.rs", "pub const MAX_CASE_RECORD_BYTES: u64 = 814;",
         "pub const MAX_CASE_RECORD_BYTES: u64 = 866;\n"
         "pub const MAX_OFFER_RECORD_BYTES: u64 = 237;\n"
         "pub const MAX_BUNDLE_RECORD_BYTES: u64 = 231;")
    edit("src/rescue.rs", "const CASE_PREFIX_BYTES: u64 = 7;",
         "const CASE_PREFIX_BYTES: u64 = 7;\n"
         "const OFFER_PREFIX_BYTES: u64 = 8;\n"
         "const BUNDLE_PREFIX_BYTES: u64 = 9;\n"
         "const CAPACITY_PREFIX_BYTES: u64 = 8;\n"
         "const STRING_LENGTH_PREFIX_BYTES: u64 = 4;\n"
         "const CAPACITY_OWNER_BYTES: u64 = 9;")
    edit("src/rescue.rs", "pub const CASE_STORAGE_BYTES: u64 =\n"
         "    RAW_ENTRY_OVERHEAD_BYTES + CASE_PREFIX_BYTES + COMMITMENT_BYTES as u64 + MAX_CASE_RECORD_BYTES;",
         "pub const CASE_STORAGE_BYTES: u64 =\n"
         "    (RAW_ENTRY_OVERHEAD_BYTES + CASE_PREFIX_BYTES + COMMITMENT_BYTES as u64 + MAX_CASE_RECORD_BYTES)\n"
         "    + (RAW_ENTRY_OVERHEAD_BYTES + BUNDLE_PREFIX_BYTES + U64_KEY_BYTES + MAX_BUNDLE_RECORD_BYTES);\n\n"
         "pub const OFFER_STORAGE_BYTES: u64 =\n"
         "    (RAW_ENTRY_OVERHEAD_BYTES + OFFER_PREFIX_BYTES + U64_KEY_BYTES + MAX_OFFER_RECORD_BYTES)\n"
         "    + (RAW_ENTRY_OVERHEAD_BYTES + CLAIM_PREFIX_BYTES + ACCOUNT_LENGTH_PREFIX_BYTES\n"
         "        + MAX_ACCOUNT_BYTES + U128_VALUE_BYTES)\n"
         "    + (RAW_ENTRY_OVERHEAD_BYTES + CAPACITY_PREFIX_BYTES + STRING_LENGTH_PREFIX_BYTES\n"
         "        + MAX_ACCOUNT_BYTES + 1 + MAX_RESCUE_SLOT_BYTES as u64\n"
         "        + CAPACITY_OWNER_BYTES);")
    types = '''#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueOfferPhase {
    Open,
    Locked,
    Released,
    Proven,
    Defaulted,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueOfferReleaseReason {
    Cancelled,
    AwardExpired,
    Unselected,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueOffer {
    pub id: u64,
    pub case_id: [u8; COMMITMENT_BYTES],
    pub component_index: u8,
    pub provider: AccountId,
    pub slot_id: String,
    pub fee: u128,
    pub bond_capacity: u128,
    pub held_bond: u128,
    pub phase: RescueOfferPhase,
    pub locked_bundle_id: Option<u64>,
    pub release_reason: Option<RescueOfferReleaseReason>,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueBundlePhase {
    Awarded,
    SettledSuccess,
    SettledDefault,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RescueComponentOutcome {
    Pending,
    Proven,
    Defaulted,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueAllocation {
    pub job_id: u64,
    pub amount: u128,
}

#[near(serializers = [borsh])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RescueBundle {
    pub id: u64,
    pub case_id: [u8; COMMITMENT_BYTES],
    pub offer_ids: [u64; COMPONENT_COUNT],
    pub total_price: u128,
    pub allocations: Vec<RescueAllocation>,
    pub recovery_deadline: u64,
    pub phase: RescueBundlePhase,
    pub component_outcomes: [RescueComponentOutcome; COMPONENT_COUNT],
}

'''
    edit("src/rescue.rs", "#[near(serializers = [borsh, json])]\n#[derive(Debug, Clone, PartialEq, Eq)]\npub enum RescueCasePhase {",
         types + "#[near(serializers = [borsh, json])]\n#[derive(Debug, Clone, PartialEq, Eq)]\npub enum RescueCasePhase {")
    edit("src/rescue.rs", "    pub resolved_payloads: [Option<Vec<u8>>; COMPONENT_COUNT],\n}",
         "    pub resolved_payloads: [Option<Vec<u8>>; COMPONENT_COUNT],\n"
         "    pub offer_ids: Vec<u64>,\n}")
    edit("src/rescue.rs", "    pub resolved_payloads: Vec<Option<Vec<u8>>>,\n}",
         "    pub resolved_payloads: Vec<Option<Vec<u8>>>,\n    pub offer_ids: Vec<u64>,\n}")
    edit("src/rescue.rs", "    pub job_storage_cost: U128,\n}",
         "    pub job_storage_cost: U128,\n    pub offer_storage_bytes: u64,\n    pub offer_storage_cost: U128,\n}")
    edit("src/rescue.rs", "            job_ids: value.job_ids.clone(),\n",
         "            job_ids: value.job_ids.clone(),\n            offer_ids: value.offer_ids.clone(),\n")
    edit("src/rescue.rs", "pub fn storage_quote() -> M3StorageQuoteView {",
         "pub fn offer_storage_cost() -> u128 {\n"
         "    env::storage_byte_cost()\n"
         "        .as_yoctonear()\n"
         "        .checked_mul(u128::from(OFFER_STORAGE_BYTES))\n"
         "        .expect(\"offer storage quote overflow\")\n"
         "}\n\n"
         "pub fn storage_quote() -> M3StorageQuoteView {")
    edit("src/rescue.rs", "        quote_version: 1,", "        quote_version: 2,")
    edit("src/rescue.rs", "        job_storage_cost: U128(job_storage_cost()),",
         "        job_storage_cost: U128(job_storage_cost()),\n"
         "        offer_storage_bytes: OFFER_STORAGE_BYTES,\n"
         "        offer_storage_cost: U128(offer_storage_cost()),")

    edit("src/lib.rs", "    next_rescue_job_id: u64,\n    rescue_cases:",
         "    next_rescue_job_id: u64,\n    next_rescue_offer_id: u64,\n"
         "    next_rescue_bundle_id: u64,\n"
         "    rescue_offers: LookupMap<u64, rescue::RescueOffer>,\n"
         "    rescue_bundles: LookupMap<u64, rescue::RescueBundle>,\n    rescue_cases:")
    edit("src/lib.rs", "            next_rescue_job_id: 0,\n            rescue_cases:",
         "            next_rescue_job_id: 0,\n            next_rescue_offer_id: 0,\n"
         "            next_rescue_bundle_id: 0,\n"
         "            rescue_offers: LookupMap::new(b\"m3offers\".as_slice()),\n"
         "            rescue_bundles: LookupMap::new(b\"m3bundles\".as_slice()),\n"
         "            rescue_cases:")
    edit("src/lib.rs", "                job_ids: Vec::new(),\n                phase: rescue::RescueCasePhase::Open,",
         "                job_ids: Vec::new(),\n                offer_ids: Vec::new(),\n"
         "                phase: rescue::RescueCasePhase::Open,")
    edit("src/lib.rs", "    pub fn next_rescue_job_id(&self) -> u64 {\n        self.next_rescue_job_id\n    }",
         "    pub fn next_rescue_job_id(&self) -> u64 {\n        self.next_rescue_job_id\n    }\n\n"
         "    pub fn next_rescue_offer_id(&self) -> u64 {\n        self.next_rescue_offer_id\n    }\n\n"
         "    pub fn next_rescue_bundle_id(&self) -> u64 {\n        self.next_rescue_bundle_id\n    }\n\n"
         "    pub fn has_rescue_offer(&self, offer_id: u64) -> bool {\n"
         "        self.rescue_offers.get(&offer_id).is_some()\n    }\n\n"
         "    pub fn has_rescue_bundle(&self, bundle_id: u64) -> bool {\n"
         "        self.rescue_bundles.get(&bundle_id).is_some()\n    }")

    edit("src/rescue_schema_tests.rs", "    COMMITMENT_BYTES, COMPONENT_COUNT, MAX_CASE_RECORD_BYTES, MAX_COMPONENT_PAYLOAD_BYTES,",
         "    COMMITMENT_BYTES, COMPONENT_COUNT, MAX_BUNDLE_RECORD_BYTES, MAX_CASE_RECORD_BYTES,\n"
         "    MAX_COMPONENT_PAYLOAD_BYTES, MAX_OFFER_RECORD_BYTES, MAX_RESCUE_OFFERS,\n"
         "    MAX_RESCUE_SLOT_BYTES, OFFER_STORAGE_BYTES, RescueAllocation, RescueBundle,\n"
         "    RescueBundlePhase, RescueComponentOutcome, RescueOffer, RescueOfferPhase,")
    edit("src/rescue_schema_tests.rs", "        job_ids: vec![u64::MAX; MAX_RESCUE_JOBS],",
         "        job_ids: vec![u64::MAX; MAX_RESCUE_JOBS],\n"
         "        offer_ids: vec![u64::MAX; MAX_RESCUE_OFFERS],")
    edit("src/rescue_schema_tests.rs", "    let case_bytes = near_sdk::borsh::to_vec(&case).unwrap();",
         '''    let offer = RescueOffer {
        id: u64::MAX,
        case_id,
        component_index: 1,
        provider: "a".repeat(64).parse().unwrap(),
        slot_id: "s".repeat(MAX_RESCUE_SLOT_BYTES),
        fee: u128::MAX,
        bond_capacity: u128::MAX,
        held_bond: u128::MAX,
        phase: RescueOfferPhase::Locked,
        locked_bundle_id: Some(u64::MAX),
        release_reason: Some(crate::rescue::RescueOfferReleaseReason::Unselected),
    };

    let bundle = RescueBundle {
        id: u64::MAX,
        case_id,
        offer_ids: [u64::MAX; COMPONENT_COUNT],
        total_price: u128::MAX,
        allocations: (0..MAX_RESCUE_JOBS)
            .map(|job_id| RescueAllocation { job_id: job_id as u64, amount: u128::MAX })
            .collect(),
        recovery_deadline: u64::MAX,
        phase: RescueBundlePhase::SettledDefault,
        component_outcomes: [RescueComponentOutcome::Proven, RescueComponentOutcome::Defaulted],
    };

    let offer_bytes = near_sdk::borsh::to_vec(&offer).unwrap();
    let bundle_bytes = near_sdk::borsh::to_vec(&bundle).unwrap();
    let case_bytes = near_sdk::borsh::to_vec(&case).unwrap();''')
    edit("src/rescue_schema_tests.rs", "    assert_eq!(case.job_ids.len(), MAX_RESCUE_JOBS);",
         "    assert_eq!(case.job_ids.len(), MAX_RESCUE_JOBS);\n"
         "    assert_eq!(case.offer_ids.len(), MAX_RESCUE_OFFERS);\n"
         "    assert_eq!(offer_bytes.len() as u64, MAX_OFFER_RECORD_BYTES);\n"
         "    assert_eq!(bundle_bytes.len() as u64, MAX_BUNDLE_RECORD_BYTES);\n"
         "    assert_eq!(OFFER_STORAGE_BYTES, 613);")
    edit("src/rescue_schema_tests.rs", "    assert_eq!(c.next_rescue_job_id(), 0);",
         "    assert_eq!(c.next_rescue_job_id(), 0);\n"
         "    assert_eq!(c.next_rescue_offer_id(), 0);\n"
         "    assert_eq!(c.next_rescue_bundle_id(), 0);\n"
         "    assert!(!c.has_rescue_offer(0));\n"
         "    assert!(!c.has_rescue_bundle(0));")
    edit("src/rescue_case_tests.rs", "    assert_eq!(quote.quote_version, 1);\n    assert_eq!(quote.case_storage_bytes, 893);",
         "    assert_eq!(quote.quote_version, 2);\n"
         "    assert_eq!(quote.case_storage_bytes, 1233);\n"
         "    assert_eq!(quote.offer_storage_bytes, 613);\n"
         "    assert_eq!(quote.offer_storage_cost.0,\n"
         "        env::storage_byte_cost().as_yoctonear() * 613);")
    edit("src/rescue_case_tests.rs", "    assert!(view.job_ids.is_empty());",
         "    assert!(view.job_ids.is_empty());\n    assert!(view.offer_ids.is_empty());")
    edit("sandbox/m3_rescue_lifecycle.cjs", "      893n", "      1233n")
    edit("docs/HANDOFF.md", "- Next single action: M3-R3-01B zero-liability offer and bundle schema",
         "- Active ticket: M3-R3-01B bounded offer/bundle schema and storage quote; verification pending\n"
         "- Next single action: run the R3-01B focused Rust tests and inspect actual output")

    worklog = '''# M3-R3-01B — bounded offer and bundle schema

**Base:** `97e9178` on `feat/m2-escrow`.
**Status:** scaffolded; verification pending.

## Purpose

Reserve storage for six offer references, one future bundle, each provider's
offer and claimable, and a typed capacity lock. No offer deposit, bond lock,
award endpoint or economic liability is activated by this step.

## Inputs and output

Input: committed R3-01A schema, R3 design, clean tracked worktree and the
preserved local audit file. Output: persistent zero-liability records,
version-2 storage quote, maximum-size serialization fixtures and updated
case/sandbox quote expectations.

## Exact command

`python3 scripts/m3/m3_r3_01b_schema.py`

## Observed result

Pending the user's focused test output. Builder output and exit code must be
recorded here after running. Do not mark this checkpoint PASS until tests run.

## Files

`src/rescue.rs`, `src/lib.rs`, `src/rescue_schema_tests.rs`,
`src/rescue_case_tests.rs`, `sandbox/m3_rescue_lifecycle.cjs`,
`docs/HANDOFF.md`, this worklog and the builder itself.

## Limitations and next action

Fresh deployment only; old serialized contract state is not migrated. Offer
admission and award remain absent. Run focused case/schema tests, then full
Rust suite, Clippy, WASM and the R2 Sandbox before finalizing the checkpoint.
'''
    for name, value in files.items():
        Path(name).write_text(value, encoding="utf-8")
    Path("docs/worklog/M3-R3-01B-schema.md").write_text(worklog, encoding="utf-8")
    print("M3-R3-01B SCAFFOLD PASS (tests pending)")
    for name in sorted([*files, "docs/worklog/M3-R3-01B-schema.md", SELF]):
        print(name)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        print(f"M3-R3-01B SCAFFOLD FAIL: {exc}")
        sys.exit(2)
