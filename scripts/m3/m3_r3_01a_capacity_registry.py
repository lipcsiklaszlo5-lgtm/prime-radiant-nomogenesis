from pathlib import Path
import subprocess
import sys

BASE = "c719804"
AUDIT = "?? sandbox/real_low_margin_audit.cjs"
SELF = "?? scripts/m3/m3_r3_01a_capacity_registry.py"

def fail(message: str) -> None:
    print(f"M3-R3-01A SCAFFOLD FAIL: {message}")
    sys.exit(2)

def read(name: str) -> str:
    return Path(name).read_text(encoding="utf-8")

def write(name: str, content: str) -> None:
    path = Path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")

def replace_once(
    text: str,
    old: str,
    new: str,
    label: str,
) -> str:
    if text.count(old) != 1:
        fail(
            f"{label}: expected one occurrence, "
            f"found {text.count(old)}"
        )
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

if branch != "feat/m2-escrow":
    fail(f"unexpected branch: {branch}")
if head != BASE:
    fail(f"unexpected HEAD: {head}")
if status != {AUDIT, SELF}:
    fail(f"unexpected worktree status: {sorted(status)}")

for name in (
    "src/capacity.rs",
    "src/capacity_lock_tests.rs",
    "docs/worklog/M3-R3-01A-capacity-registry.md",
):
    if Path(name).exists():
        fail(f"target already exists: {name}")

capacity = r'''use near_sdk::{AccountId, near};

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CapacityOwner {
    M2Offer(u64),
    M3RescueOffer(u64),
}

pub fn capacity_key(
    provider: &AccountId,
    slot_id: &str,
) -> String {
    format!("{provider}|{slot_id}")
}
'''

lib_path = Path("src/lib.rs")
lib = read(str(lib_path))

lib = replace_once(
    lib,
    "mod escrow;\n",
    "pub mod capacity;\nmod escrow;\n",
    "capacity module declaration",
)

lib = replace_once(
    lib,
    "use escrow::{OfferDeposit, StorageBond, TaskDeposit, reserve_cost};\n",
    "use capacity::CapacityOwner;\n"
    "use escrow::{OfferDeposit, StorageBond, TaskDeposit, reserve_cost};\n",
    "capacity owner import",
)

lib = replace_once(
    lib,
    "    slot_locks: LookupMap<String, u64>,\n",
    "    capacity_locks: LookupMap<String, CapacityOwner>,\n",
    "root capacity field",
)

lib = replace_once(
    lib,
    '            slot_locks: LookupMap::new(b"locks".as_slice()),\n',
    '            capacity_locks: LookupMap::new(b"capacity".as_slice()),\n',
    "capacity field initialization",
)

lib = lib.replace(
    'format!("{}|{}", offer.reserve, offer.slot_id)',
    'capacity::capacity_key(&offer.reserve, &offer.slot_id)',
)

lib = lib.replace(
    'format!("{reserve}|{slot_id}")',
    'capacity::capacity_key(&reserve, &slot_id)',
)

lib = lib.replace(
    "self.slot_locks",
    "self.capacity_locks",
)

lib = replace_once(
    lib,
    "        self.capacity_locks.insert(key, offer_id);\n",
    "        self.capacity_locks\n"
    "            .insert(key, CapacityOwner::M2Offer(offer_id));\n",
    "typed M2 lock insertion",
)

lib = lib.replace(
    "self.capacity_locks.get(&key).copied()",
    "self.capacity_locks.get(&key).cloned()",
)

lib = replace_once(
    lib,
    "        assert_eq!(self.capacity_locks.get(&key).cloned(), Some(id));\n",
    "        assert_eq!(\n"
    "            self.capacity_locks.get(&key).cloned(),\n"
    "            Some(CapacityOwner::M2Offer(id))\n"
    "        );\n",
    "typed unactivated lock check",
)

offer_check_old = """            self.capacity_locks.get(&key).cloned(),
            Some(offer_id),
            "slot lock mismatch"
"""
offer_check_new = """            self.capacity_locks.get(&key).cloned(),
            Some(CapacityOwner::M2Offer(offer_id)),
            "slot lock mismatch"
"""

offer_check_count = lib.count(offer_check_old)

nested_offer_check_old = """                self.capacity_locks.get(&key).cloned(),
                Some(offer_id),
                "slot lock mismatch"
"""

nested_offer_check_new = """                self.capacity_locks.get(&key).cloned(),
                Some(CapacityOwner::M2Offer(offer_id)),
                "slot lock mismatch"
"""

nested_offer_check_count = lib.count(
    nested_offer_check_old
)

if (
    offer_check_count != 3
    or nested_offer_check_count != 1
):
    fail(
        "typed offer lock checks: expected "
        "three standard and one nested, found "
        f"{offer_check_count} and "
        f"{nested_offer_check_count}"
    )

lib = lib.replace(
    offer_check_old,
    offer_check_new,
)

lib = lib.replace(
    nested_offer_check_old,
    nested_offer_check_new,
)

lib = replace_once(
    lib,
    "        assert_eq!(self.capacity_locks.remove(&key), Some(id));\n",
    "        assert_eq!(\n"
    "            self.capacity_locks.remove(&key),\n"
    "            Some(CapacityOwner::M2Offer(id))\n"
    "        );\n",
    "typed unactivated lock removal",
)

lib = replace_once(
    lib,
    "        assert_eq!(self.capacity_locks.remove(&key), Some(offer_id));\n",
    "        assert_eq!(\n"
    "            self.capacity_locks.remove(&key),\n"
    "            Some(CapacityOwner::M2Offer(offer_id))\n"
    "        );\n",
    "typed reserve-failure lock removal",
)

standalone_remove = "        self.capacity_locks.remove(&key);\n"
standalone_count = lib.count(standalone_remove)

if standalone_count != 2:
    fail(
        "typed proof lock removals: expected two, "
        f"found {standalone_count}"
    )

lib = lib.replace(
    standalone_remove,
    "        assert_eq!(\n"
    "            self.capacity_locks.remove(&key),\n"
    "            Some(CapacityOwner::M2Offer(offer_id))\n"
    "        );\n",
)

slot_view_old = """    pub fn slot_holder(&self, reserve: AccountId, slot_id: String) -> Option<u64> {
        let key = capacity::capacity_key(&reserve, &slot_id);
        self.capacity_locks.get(&key).cloned()
    }
"""

slot_view_new = """    pub fn slot_holder(&self, reserve: AccountId, slot_id: String) -> Option<u64> {
        let key = capacity::capacity_key(&reserve, &slot_id);

        match self.capacity_locks.get(&key) {
            Some(CapacityOwner::M2Offer(offer_id)) => Some(*offer_id),
            Some(CapacityOwner::M3RescueOffer(_)) | None => None,
        }
    }

    pub fn capacity_lock_holder(
        &self,
        provider: AccountId,
        slot_id: String,
    ) -> Option<CapacityOwner> {
        let key = capacity::capacity_key(&provider, &slot_id);
        self.capacity_locks.get(&key).cloned()
    }
"""

lib = replace_once(
    lib,
    slot_view_old,
    slot_view_new,
    "capacity views",
)

if "slot_locks" in lib:
    fail("untyped slot_locks reference remains")

module_anchor = """#[cfg(test)]
mod rescue_expiry_tests;
"""

if lib.count(module_anchor) != 1:
    fail("rescue expiry test module anchor not found exactly once")

lib = lib.replace(
    module_anchor,
    module_anchor + "\n#[cfg(test)]\nmod capacity_lock_tests;\n",
    1,
)

tests = r'''use super::*;
use crate::capacity::{CapacityOwner, capacity_key};

use near_sdk::{
    env,
    test_utils::{VMContextBuilder, accounts},
    testing_env,
};

use std::panic::{AssertUnwindSafe, catch_unwind};

fn actor(id: usize, now: u64) {
    let mut context = VMContextBuilder::new();

    context
        .predecessor_account_id(accounts(id))
        .block_timestamp(now);

    testing_env!(context.build());
}

fn rejected<T>(call: impl FnOnce() -> T) {
    assert!(catch_unwind(AssertUnwindSafe(call)).is_err());
}

fn ready(
    contract: &mut Nomogenesis,
    buyer: usize,
) -> u64 {
    actor(buyer, 100);

    let task = contract.test_create_task(
        accounts(1),
        vec![7; 32],
        2,
        2,
        200,
        300,
    );

    actor(1, 110);
    contract.accept_primary(task);

    task
}

fn listed(
    contract: &mut Nomogenesis,
    task: u64,
    slot: &str,
) -> u64 {
    actor(2, 120);
    contract.test_post_offer(
        task,
        slot.into(),
        180,
    )
}

#[test]
fn default_capacity_registry_is_empty_and_zero_liability() {
    let contract = Nomogenesis::default();

    assert_eq!(
        contract.capacity_lock_holder(
            accounts(2),
            "shared".into(),
        ),
        None
    );

    assert_eq!(
        contract.slot_holder(
            accounts(2),
            "shared".into(),
        ),
        None
    );

    assert_eq!(contract.rescue_escrow_total(), U128(0));
    assert_eq!(
        contract.escrow_totals(),
        (U128(0), U128(0), U128(0))
    );
}

#[test]
fn m2_selection_writes_typed_owner_and_legacy_view() {
    let mut contract = Nomogenesis::default();
    let task = ready(&mut contract, 0);
    let offer = listed(&mut contract, task, "typed");

    actor(0, 130);
    contract.select_offer(task, offer);

    assert_eq!(
        contract.capacity_lock_holder(
            accounts(2),
            "typed".into(),
        ),
        Some(CapacityOwner::M2Offer(offer))
    );

    assert_eq!(
        contract.slot_holder(
            accounts(2),
            "typed".into(),
        ),
        Some(offer)
    );
}

#[test]
fn simulated_m3_owner_blocks_m2_selection_atomically() {
    let mut contract = Nomogenesis::default();
    let task = ready(&mut contract, 0);
    let offer = listed(&mut contract, task, "shared");

    contract.capacity_locks.insert(
        capacity_key(&accounts(2), "shared"),
        CapacityOwner::M3RescueOffer(77),
    );

    actor(0, 130);
    rejected(|| contract.select_offer(task, offer));

    assert_eq!(
        contract.capacity_lock_holder(
            accounts(2),
            "shared".into(),
        ),
        Some(CapacityOwner::M3RescueOffer(77))
    );

    assert_eq!(
        contract.slot_holder(
            accounts(2),
            "shared".into(),
        ),
        None
    );

    assert_eq!(
        contract.get_task(task).unwrap().phase,
        TaskPhase::SeekingReserve
    );

    assert_eq!(
        contract.get_offer(offer).unwrap().status,
        OfferStatus::Available
    );
}

#[test]
fn m2_terminal_path_removes_exact_typed_owner() {
    let mut contract = Nomogenesis::default();
    let task = ready(&mut contract, 0);
    let offer = listed(&mut contract, task, "release");

    actor(0, 130);
    contract.select_offer(task, offer);

    assert_eq!(
        contract.capacity_lock_holder(
            accounts(2),
            "release".into(),
        ),
        Some(CapacityOwner::M2Offer(offer))
    );

    actor(4, 300);
    contract.close_unactivated(task);

    assert_eq!(
        contract.capacity_lock_holder(
            accounts(2),
            "release".into(),
        ),
        None
    );

    assert_eq!(
        contract.slot_holder(
            accounts(2),
            "release".into(),
        ),
        None
    );
}

#[test]
fn typed_capacity_owner_survives_state_reload() {
    let mut contract = Nomogenesis::default();
    let task = ready(&mut contract, 0);
    let offer = listed(&mut contract, task, "persisted");

    actor(0, 130);
    contract.select_offer(task, offer);

    contract.capacity_locks.flush();
    env::state_write(&contract);
    drop(contract);

    let reloaded: Nomogenesis =
        env::state_read().expect("state missing");

    assert_eq!(
        reloaded.capacity_lock_holder(
            accounts(2),
            "persisted".into(),
        ),
        Some(CapacityOwner::M2Offer(offer))
    );

    assert_eq!(
        reloaded.slot_holder(
            accounts(2),
            "persisted".into(),
        ),
        Some(offer)
    );
}
'''

worklog = r'''# M3-R3-01A — typed cross-market capacity registry

**Status:** scaffolded
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `c719804`

## Purpose

Replace the M2-only untyped slot value with one typed capacity owner while
preserving the existing M2 public view and state-machine behavior.

This is the first R3 persistent-schema substep. It does not add RescueOffer,
RescueBundle, provider funding or bundle award.

## Schema

The registry value is:

- `M2Offer(offer_id)`;
- `M3RescueOffer(offer_id)`.

The canonical key remains provider account plus validated slot identifier.

The persistent prefix changes from `locks` to `capacity`. R3 evidence therefore
uses a fresh deployment and makes no migration claim.

## Compatibility

`slot_holder` continues returning an M2 offer ID for M2-owned capacity.

It returns `None` for an M3-owned slot rather than misrepresenting that owner
as an M2 offer.

`capacity_lock_holder` exposes the complete typed owner.

## Required evidence

- default registry is empty and creates no liability;
- M2 selection writes `M2Offer`;
- legacy M2 view still returns the offer ID;
- simulated M3 ownership blocks M2 selection before mutation;
- terminal M2 path removes the exact typed owner;
- typed owner survives state reload;
- every existing M2 and M3 regression remains green;
- Clippy and WASM checks pass.

## Files

- `src/capacity.rs`
- `src/lib.rs`
- `src/capacity_lock_tests.rs`
- `scripts/m3/m3_r3_01a_capacity_registry.py`
- `docs/worklog/M3-R3-01A-capacity-registry.md`

## Scaffold finding

The initial builder expected four identically indented M2 lock assertions.
The source contains three method-level checks and one check nested inside the
reserve-proof validation block. No contract mutation occurred before the
builder stopped. The builder now validates and rewrites the 3+1 structure
explicitly.

### Capacity-view anchor

The repaired builder then reached the public view replacement after its
earlier global `.copied()` to `.cloned()` transformation. The replacement
anchor still described the pre-transformation text, so it found zero matches.
No repository source file had been written. The anchor now describes the
actual intermediate representation.

## Next single action

Run focused capacity tests. If green, run the full regression, Clippy and WASM
gates before committing. Then implement R3-01B zero-liability RescueOffer and
RescueBundle schema.
'''

write("src/capacity.rs", capacity)
write("src/lib.rs", lib)
write("src/capacity_lock_tests.rs", tests)
write(
    "docs/worklog/M3-R3-01A-capacity-registry.md",
    worklog,
)

print("M3-R3-01A SCAFFOLD PASS")
for name in (
    "src/capacity.rs",
    "src/lib.rs",
    "src/capacity_lock_tests.rs",
    "docs/worklog/M3-R3-01A-capacity-registry.md",
    "scripts/m3/m3_r3_01a_capacity_registry.py",
):
    print(name)
