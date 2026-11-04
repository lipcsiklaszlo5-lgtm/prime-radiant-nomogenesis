"""Add bounded capped-equal sponsor allocation for the atomic-award step."""
from pathlib import Path
import subprocess
import sys

BASE = "2854d2f"
SELF = "scripts/m3/m3_r3_03b_01_allocation.py"

ALLOCATOR = '''pub(crate) fn allocate_rescue_cost(
    caps: &[(u64, u128)],
    price: u128,
) -> Result<Vec<rescue::RescueAllocation>, &'static str> {
    if caps.is_empty() || price == 0 {
        return Err("empty sponsors or zero price");
    }
    if caps.len() > rescue::MAX_RESCUE_JOBS {
        return Err("too many sponsors");
    }

    let mut rows = caps.to_vec();
    rows.sort_unstable_by_key(|row| row.0);
    if rows.windows(2).any(|pair| pair[0].0 == pair[1].0) {
        return Err("duplicate job ID");
    }

    let mut cap_total = 0u128;
    for (_, cap) in &rows {
        if *cap == 0 {
            return Err("zero rescue cap");
        }
        cap_total = cap_total.checked_add(*cap).ok_or("cap overflow")?;
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
            .filter_map(|(i, amount)| (*amount < rows[i].1).then_some(i))
            .collect();
        if active.is_empty() {
            return Err("insufficient caps");
        }

        let count = active.len() as u128;
        let share = remaining / count;
        let remainder = (remaining % count) as usize;
        let mut paid = 0u128;
        for (rank, i) in active.into_iter().enumerate() {
            let requested = share
                .checked_add(u128::from(rank < remainder))
                .ok_or("allocation overflow")?;
            let amount = requested.min(rows[i].1 - amounts[i]);
            amounts[i] = amounts[i]
                .checked_add(amount)
                .ok_or("allocation overflow")?;
            remaining = remaining.checked_sub(amount).ok_or("allocation invariant")?;
            paid = paid.checked_add(amount).ok_or("allocation overflow")?;
        }
        if paid == 0 {
            return Err("allocation made no progress");
        }
    }

    Ok(rows
        .into_iter()
        .zip(amounts)
        .map(|((job_id, _), amount)| rescue::RescueAllocation { job_id, amount })
        .collect())
}

'''

TESTS = '''use crate::rescue_clearing::allocate_rescue_cost;

fn rows(caps: &[(u64, u128)], price: u128) -> Vec<(u64, u128)> {
    allocate_rescue_cost(caps, price)
        .unwrap()
        .into_iter()
        .map(|allocation| (allocation.job_id, allocation.amount))
        .collect()
}

#[test]
fn three_bounded_sponsors_share_twelve_equally() {
    assert_eq!(rows(&[(2, 5), (0, 5), (1, 5)], 12), vec![(0, 4), (1, 4), (2, 4)]);
}

#[test]
fn saturated_sponsor_leaves_remainder_for_active_sponsors() {
    assert_eq!(rows(&[(0, 1), (1, 10), (2, 10)], 8), vec![(0, 1), (1, 4), (2, 3)]);
}

#[test]
fn indivisible_units_follow_job_ids_and_zero_rows_are_preserved() {
    assert_eq!(rows(&[(9, 10), (2, 10), (5, 10)], 5), vec![(2, 2), (5, 2), (9, 1)]);
    assert_eq!(rows(&[(9, 5), (2, 5), (5, 5)], 1), vec![(2, 1), (5, 0), (9, 0)]);
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
    assert_eq!(rows(&[(0, cap), (1, cap), (2, cap)], price),
               vec![(0, price / 3 + 1), (1, price / 3 + 1), (2, price / 3)]);
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
                    assert_eq!(allocations.iter().map(|(id, _)| *id).collect::<Vec<_>>(),
                               vec![1, 2, 3]);
                }
            }
        }
    }
}
'''

WORKLOG = '''# M3-R3-03B-01 — capped-equal sponsor allocation

**Branch/base:** `feat/m2-escrow` / `2854d2f`.
**Starting worktree:** only `sandbox/real_low_margin_audit.cjs` untracked.
**Status:** scaffolded; focused tests pending.

## Purpose

Prepare the bounded, deterministic buyer-allocation part of atomic bundle
award. Input is the eligible `(job_id, held_cap)` list derived by R3-03A and
the selected bundle price. Output contains every eligible job in ascending
ID order, including zero allocations that must be released at award.
Reject empty/duplicate/zero caps, more than six sponsors, insufficient
funding and arithmetic overflow before state mutation.

## Exact reproduction

`python3 -B scripts/m3/m3_r3_03b_01_allocation.py`
`cargo fmt --all`
`cargo test --locked --lib rescue_allocation_tests`
`git diff --check`

Outputs and exit codes pending user execution. This step creates no bundle,
credit, capacity lock or RecoveryRight. The local audit file stays untouched.

## Changed files and next action

`src/rescue_clearing.rs`, `src/lib.rs`, `src/rescue_allocation_tests.rs`,
`docs/HANDOFF.md`, this worklog and the Python scaffold.
Next: inspect the focused test output, then implement award state mutation.
'''


def git(*args):
    return subprocess.check_output(["git", *args], text=True)


def once(text, old, new, name):
    if text.count(old) != 1:
        raise ValueError(f"{name}: expected one anchor, found {text.count(old)}")
    return text.replace(old, new, 1)


def main():
    if git("branch", "--show-current").strip() != "feat/m2-escrow":
        raise ValueError("unexpected branch")
    if git("rev-parse", "--short", "HEAD").strip() != BASE:
        raise ValueError("unexpected HEAD")
    expected = {"?? sandbox/real_low_margin_audit.cjs", f"?? {SELF}"}
    status = set(git("status", "--porcelain").splitlines())
    if status != expected or git("diff", "--cached", "--name-only").strip():
        raise ValueError(f"unexpected worktree: {sorted(status)}")
    targets = ("src/rescue_allocation_tests.rs", "docs/worklog/M3-R3-03B-01-allocation.md")
    if any(Path(name).exists() for name in targets):
        raise ValueError("R3-03B-01 target already exists")

    clearing = Path("src/rescue_clearing.rs")
    lib = Path("src/lib.rs")
    handoff = Path("docs/HANDOFF.md")
    new_clearing = once(clearing.read_text(encoding="utf-8"),
                        "impl Nomogenesis {", ALLOCATOR + "impl Nomogenesis {", str(clearing))
    new_lib = once(lib.read_text(encoding="utf-8"),
                   "mod rescue_clearing_tests;\n",
                   "mod rescue_clearing_tests;\n\n#[cfg(test)]\nmod rescue_allocation_tests;\n", str(lib))
    new_handoff = once(handoff.read_text(encoding="utf-8"),
                       "- Next single action: M3-R3-03B capped-equal allocation and atomic award.",
                       "- Active ticket: M3-R3-03B-01 capped-equal allocation; focused tests pending.\n"
                       "- Next single action: run focused allocation tests before award mutation.", str(handoff))
    clearing.write_text(new_clearing, encoding="utf-8")
    lib.write_text(new_lib, encoding="utf-8")
    handoff.write_text(new_handoff, encoding="utf-8")
    Path(targets[0]).write_text(TESTS, encoding="utf-8")
    Path(targets[1]).write_text(WORKLOG, encoding="utf-8")
    print("M3-R3-03B-01 SCAFFOLD PASS; focused tests pending")
    for name in (str(clearing), str(lib), targets[0], str(handoff), targets[1], SELF):
        print(name)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as error:
        print(f"M3-R3-03B-01 SCAFFOLD FAIL: {error}", file=sys.stderr)
        sys.exit(2)
