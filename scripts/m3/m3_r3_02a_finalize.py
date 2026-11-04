"""Record verified R3-02A evidence before the checkpoint commit."""

from pathlib import Path
import subprocess
import sys

BASE = "314d44b"
WASM = "a82f0c54d1e1d24d92d2a745a4882ac7e381c6c27b7094e4aee09f0291b367c5"


def git(*args):
    return subprocess.check_output(["git", *args], text=True)


def once(text, old, new, name):
    if text.count(old) != 1:
        raise ValueError(f"{name}: expected one marker, found {text.count(old)}")
    return text.replace(old, new, 1)


def main():
    tracked = {"docs/HANDOFF.md", "package.json", "src/lib.rs", "src/rescue.rs"}
    untracked = {
        "docs/worklog/M3-R3-02A-offer-admission.md",
        "sandbox/m3_provider_offer_admission.cjs",
        "sandbox/real_low_margin_audit.cjs",
        "scripts/m3/m3_r3_02a_offer_admission.py",
        "scripts/m3/m3_r3_02a_sandbox.py",
        "scripts/m3/m3_r3_02a_finalize.py",
        "src/rescue_offer_tests.rs",
    }
    if git("branch", "--show-current").strip() != "feat/m2-escrow":
        raise ValueError("unexpected branch")
    if git("rev-parse", "--short", "HEAD").strip() != BASE:
        raise ValueError("unexpected HEAD")
    if set(git("diff", "--name-only").splitlines()) != tracked:
        raise ValueError("unexpected tracked diff")
    if git("diff", "--cached", "--name-only").strip():
        raise ValueError("unexpected staged files")
    actual = {
        s[3:] for s in git("status", "--porcelain").splitlines()
        if s.startswith("?? ")
    }
    if actual != untracked:
        raise ValueError(f"unexpected untracked files: {sorted(actual)}")

    builder_path = Path("scripts/m3/m3_r3_02a_offer_admission.py")
    builder = builder_path.read_text(encoding="utf-8")
    lines = builder.splitlines(keepends=True)
    if sum(line == " \n" for line in lines) != 6:
        raise ValueError("offer builder whitespace fixture differs")
    builder = "".join("\\x20\n" if line == " \n" else line for line in lines)
    marker = '"""\n\ndef run(*args, input=None):'
    builder = once(
        builder,
        marker,
        '"""\nPATCH = PATCH.replace("\\\\x20\\n", " \\n")\n\ndef run(*args, input=None):',
        "offer builder",
    )

    paths = [
        "docs/HANDOFF.md", "docs/STATUS.md", "AGENTS.md",
        "docs/worklog/M3-R3-02A-offer-admission.md",
    ]
    docs = {name: Path(name).read_text(encoding="utf-8") for name in paths}
    handoff = docs["docs/HANDOFF.md"]
    start = handoff.index("## Current M3 checkpoint — 2026-11-04")
    end = handoff.index("## Munkamenetindító parancsok", start)
    if "verification pending" not in handoff[start:end]:
        raise ValueError("HANDOFF active checkpoint differs")
    handoff = handoff[:start] + f"""## Current M3 checkpoint — 2026-11-04

- Branch: `feat/m2-escrow`; base: `{BASE}`.
- M3-R3-02A funded provider offer admission: verified on fresh state.
- Six focused offer tests and 179 full Rust tests: PASS.
- Clippy, compatible WASM build and Node syntax: PASS.
- WASM SHA-256: `{WASM}`.
- M3 offer Sandbox plus M2 primary, backup, settlement and M3-R2 Sandboxes: PASS.
- Two separate provider bonds are funded; offer posting leaves slots unreserved.
- Preserve untracked `sandbox/real_low_margin_audit.cjs`.
- Offer terminal release, bundle award and public testnet: not verified.
- Next single action: M3-R3-02B provider offer terminal release.

""" + handoff[end:]
    handoff = once(
        handoff,
        "## Session napló (append-only)\n\n",
        f"""## Session napló (append-only)

### 2026-11-04 — M3-R3-02A funded provider admission

- Base: `{BASE}`; fresh deployment only.
- Exact bond plus storage deposit, six-offer limit and authenticated provider.
- Six focused tests; 179 full Rust tests; Clippy and WASM: PASS.
- WASM SHA-256: `{WASM}`.
- M3 offer and four existing lifecycle Sandboxes: PASS.
- Posting does not reserve an M2/M3 capacity slot.
- Next: R3-02B offer release and provider claimable accounting.

""",
        "HANDOFF",
    )
    docs["docs/HANDOFF.md"] = handoff

    status = docs["docs/STATUS.md"]
    start = status.index("**Current state:**")
    end = status.index("## Frissítési szabály", start)
    if "M3-R3-01B bounded offer/bundle schema verified" not in status[start:end]:
        raise ValueError("STATUS current gate differs")
    status = status[:start] + f"""**Current state:** M3-R3-02A funded provider offers verified locally
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Verified implementation base:** `{BASE}` plus R3-02A checkpoint

| Area | Verified state |
|---|---|
| R2 funded demand and liability | COMPLETE |
| Typed M2/M3 capacity registry | IMPLEMENTED |
| Provider offer admission and individual bonds | SANDBOX PASS |
| Separate storage and M3 economic liability | SANDBOX PASS |
| Full Rust regression | 179 tests PASS |
| Clippy and compatible WASM | PASS |
| M2 primary, backup, settlement and M3-R2 Sandbox | PASS |
| Provider offer terminal release | NOT IMPLEMENTED |
| Atomic RecoveryRight award | NOT IMPLEMENTED |
| Public testnet evidence | NOT VERIFIED |
| Production funds | NOT APPROVED |

## Current gate

Two provider offers funded separate bonds in local Sandbox on WASM
`{WASM}`. Underpayment and duplicate component posting were rejected;
neither offer reserved a capacity slot. Settlement and default paths for
provider bonds remain unimplemented.

## Next task

M3-R3-02B: authenticated cancellation and permissionless terminal release
of open offers, with exact claimable credit and replay protection.

""" + status[end:]
    docs["docs/STATUS.md"] = status

    agents = docs["AGENTS.md"]
    start = agents.index("Jelenlegi ellenőrzött kapu: M3-R3-01B.")
    end = agents.index("## 5. Munkamenet lezárás", start)
    agents = agents[:start] + """Jelenlegi ellenőrzött kapu: M3-R3-02A. Két provider külön
fedezett ajánlata helyi Sandboxban átment; a slotok még szabadok.
179 Rust teszt, Clippy, kompatibilis WASM, három M2 és két M3 Sandbox
átment. Offer release, bundle award és public testnet működés még
nincs igazolva. A következő ticket M3-R3-02B terminal release.

""" + agents[end:]
    docs["AGENTS.md"] = agents

    log = docs["docs/worklog/M3-R3-02A-offer-admission.md"]
    if log.count("**Status:** scaffolded; tests pending.") != 1:
        raise ValueError("worklog verification state differs")
    marker = "## Exact command and observed result\n"
    if log.count(marker) != 1:
        raise ValueError("worklog command section differs")
    log = log[:log.index(marker)]
    log = log.replace(
        "**Status:** scaffolded; tests pending.",
        "**Status:** verified locally; checkpoint SHA in Git history.",
    )
    log += f"""## Commands and observed results

- `python3 -B scripts/m3/m3_r3_02a_offer_admission.py`: exit 0.
- `cargo test --locked --lib rescue_offer_tests`: 6 passed, exit 0.
- `cargo test --locked`: 145 unit + 11 model + 17 event + 6 ledger = 179 passed, exit 0.
- `cargo fmt --all -- --check`: exit 0.
- `cargo clippy --locked --all-targets -- -D warnings`: exit 0.
- `npm run wasm:build`: exit 0, SHA-256 `{WASM}`.
- `python3 -B scripts/m3/m3_r3_02a_sandbox.py`: exit 0.
- `node --check sandbox/m3_provider_offer_admission.cjs`: exit 0.
- `npm run sandbox:m3-r3-offer`: PASS, exit 0. Two independent bonds,
  exact storage and no capacity lock; underpayment and duplicate rejected.
- `npm run sandbox:primary`, `sandbox:backup`, `sandbox:settlement`,
  `sandbox:m3-r2`: each PASS, exit 0 on the same WASM.
- `git diff --check`: exit 0. Audit file remains untracked and untouched.
- Precommit review found six whitespace-only patch context lines in the
  Python builder. These are escaped without changing the applied Rust diff.

## Changed files

`src/rescue.rs`, `src/lib.rs`, `src/rescue_offer_tests.rs`,
`sandbox/m3_provider_offer_admission.cjs`, `package.json`,
`docs/HANDOFF.md`, `docs/STATUS.md`, `AGENTS.md`, this worklog and
the three Python step scripts.

## Limitations and next action

Posting does not reserve a slot or bind a RecoveryRight. Provider bond
release and bundle award remain absent. Next: R3-02B terminal offer
release with authenticated claimable credit and replay protection.
"""
    docs["docs/worklog/M3-R3-02A-offer-admission.md"] = log

    for name, value in docs.items():
        Path(name).write_text(value, encoding="utf-8")
    builder_path.write_text(builder, encoding="utf-8")
    print("M3-R3-02A DOCUMENTATION PASS (commit pending)")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        print(f"M3-R3-02A FINALIZE FAIL: {exc}")
        sys.exit(2)
