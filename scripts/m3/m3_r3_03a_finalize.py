"""Record the verified R3-03A checkpoint before staging."""
from pathlib import Path
import subprocess
import sys

BASE = "46c0080"
WASM = "59c1cd29cd54f1c4e5985e8ff4193d558f41985b61e26144ed08556d9d7d968c"
SELF = "scripts/m3/m3_r3_03a_finalize.py"


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
    expected = {
        " M docs/HANDOFF.md", " M package.json", " M src/lib.rs", " M src/rescue.rs",
        "?? docs/worklog/M3-R3-03A-pair-preflight.md",
        "?? sandbox/m3_pair_preview.cjs", "?? sandbox/real_low_margin_audit.cjs",
        "?? scripts/m3/m3_r3_03a_pair_preflight.py",
        "?? scripts/m3/m3_r3_03a_sandbox.py",
        "?? scripts/m3/m3_r3_03a_timing_repair.py", f"?? {SELF}",
        "?? src/rescue_clearing.rs", "?? src/rescue_clearing_tests.rs",
    }
    actual = set(git("status", "--porcelain").splitlines())
    if actual != expected or git("diff", "--cached", "--name-only").strip():
        raise ValueError(f"unexpected worktree: {sorted(actual)}")
    if subprocess.run(["git", "diff", "--check"], check=False).returncode:
        raise ValueError("diff whitespace check failed")
    js = Path("sandbox/m3_pair_preview.cjs").read_text(encoding="utf-8")
    builder = Path("scripts/m3/m3_r3_03a_sandbox.py").read_text(encoding="utf-8")
    for marker in ("attempt < 100", "Math.min(100,"):
        if marker not in js or marker not in builder:
            raise ValueError(f"repaired helper differs: {marker}")

    handoff_path = Path("docs/HANDOFF.md")
    handoff = handoff_path.read_text(encoding="utf-8")
    start = handoff.index("## Current M3 checkpoint — 2026-11-04")
    end = handoff.index("## Munkamenetindító parancsok", start)
    handoff = handoff[:start] + """## Current M3 checkpoint — 2026-11-04

- Branch: `feat/m2-escrow`; R3-03A implementation base: `46c0080`.
- Deterministic, read-only on-chain pair preflight: verified locally.
- Seven focused tests; full Rust suite: 157 + 11 + 17 + 6 = 191 passed.
- Clippy, compatible WASM build, Node syntax and diff checks: PASS.
- WASM SHA-256: `""" + WASM + """`.
- Fresh NEAR Sandbox: three independent funded jobs, four provider offers,
  full-bond pair selection and cap revocation: PASS.
- The first Sandbox run overshot the award window; the bounded timing repair
  and successful rerun are recorded in the R3-03A worklog.
- Preserve untracked `sandbox/real_low_margin_audit.cjs`.
- Earlier M2 and M3-R2 Sandboxes were not rerun in this ticket.
- Bundle award, RecoveryRight, proof settlement and public testnet: not verified.
- Next single action: M3-R3-03B capped-equal allocation and atomic award.

""" + handoff[end:]
    marker = "## Session napló (append-only)\n\n"
    handoff = once(handoff, marker, marker + """### 2026-11-04 — M3-R3-03A pair preflight

- Base: `46c0080`; seven focused and 191 full Rust tests passed.
- Clippy, compatible WASM and local Sandbox pair preview passed.
- The first Sandbox run overshot the award window; the bounded repair
  passed on rerun. No contract mutation was needed for this timing failure.
- Candidate preview creates no bundle or RecoveryRight. Next: R3-03B.

""", str(handoff_path))

    status_path = Path("docs/STATUS.md")
    status = status_path.read_text(encoding="utf-8")
    start = status.index("**Current state:**")
    end = status.index("## M1 Final Gate — PASS", start)
    status = status[:start] + """**Current state:** M3-R3-03A deterministic on-chain preflight verified locally
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Implementation base:** `46c0080` plus R3-03A checkpoint

| Area | Verified state |
|---|---|
| R2 funded demand and liability | COMPLETE |
| Typed M2/M3 capacity registry | IMPLEMENTED |
| Provider offer funding, cancel and expiry | SANDBOX PASS |
| Read-only deterministic pair preview | SANDBOX PASS |
| Separate storage and M3 economic liability | SANDBOX PASS |
| Full Rust regression | 191 tests PASS |
| Clippy and compatible WASM | PASS |
| M2 and M3-R2 Sandbox | PRIOR CHECKPOINT PASS |
| Atomic RecoveryRight award | NOT IMPLEMENTED |
| Public testnet evidence | NOT VERIFIED |
| Production funds | NOT APPROVED |

## Current gate

The fresh local Sandbox selected the fully bonded offers `[2, 3]` for
three accepted jobs with a total fee of 12 units and a 15-unit aggregate cap.
The preview left the case open, offers unlocked and bundle count zero.
Revoking one buyer's open 5-unit mandate removed the candidate without
creating a bundle. The first run overshot `award_close`; the bounded
fast-forward repair passed on rerun. Successful local transactions were not
printed with receipt IDs. WASM SHA-256: `""" + WASM + """`.
Earlier M2 and M3-R2 Sandboxes were not rerun on this WASM.

## Next task

M3-R3-03B: capped-equal sponsor allocations and atomic bundle award,
with the shared M2/M3 capacity locks and complete liability transition.

## Frissítési szabály

Record the actual commit SHA, test outputs, open limitations and one next
action. Historical milestones remain below.

""" + status[end:]

    agents_path = Path("AGENTS.md")
    agents = agents_path.read_text(encoding="utf-8")
    old = """Jelenlegi ellenőrzött kapu: M3-R3-02B. Két provider nyitott
ajánlata helyi Sandboxban egyszeri claimable jóváírással felszabadult.
184 Rust teszt, Clippy és kompatibilis WASM átment. Az R3-02B Sandbox
átment; a korábbi M2 és M3-R2 Sandboxes ebben a ticketben nem futottak.
Valódi bundle award és public testnet még nincs igazolva. Következő:
M3-R3-03A determinisztikus candidate selection preflight."""
    new = """Jelenlegi ellenőrzött kapu: M3-R3-03A. A read-only pair preflight
helyi Sandboxban három vevő és négy ajánlat mellett átment; a mandátum
visszavonása után nincs finanszírozható jelölt. 191 Rust teszt, Clippy és
kompatibilis WASM átment. A korábbi M2 és M3-R2 Sandboxes ebben a ticketben
nem futottak. Valódi bundle award és public testnet még nincs igazolva.
Következő: M3-R3-03B capped-equal allocation és atomic award."""
    agents = once(agents, old, new, str(agents_path))

    log_path = Path("docs/worklog/M3-R3-03A-pair-preflight.md")
    log = log_path.read_text(encoding="utf-8")
    log = once(log, "**Status:** scaffold prepared; Codespaces tests pending.",
               "**Status:** verified locally; checkpoint SHA in Git history.", str(log_path))
    log = once(log, "Codespaces output and exit code pending. The focused command is\n"
               "`cargo test --locked --lib rescue_clearing_tests`. Record actual failures\n"
               "and repairs here before marking PASS.",
               "Execution results and exit codes are recorded below. The focused command is\n"
               "`cargo test --locked --lib rescue_clearing_tests`.", str(log_path))
    log = once(log, "## Sandbox step — pending execution", "## Sandbox step", str(log_path))
    log = once(log, "The full Rust suite, Clippy, compatible WASM and Sandbox results remain to\n"
               "be recorded from actual Codespaces output.",
               "The full Rust suite, Clippy, compatible WASM and Sandbox results are\n"
               "recorded below.", str(log_path))
    log = once(log, "  measured iterations. Rerun the same on-chain scenario; result pending.",
               "  measured iterations. The same on-chain scenario passed on rerun.", str(log_path))
    if "## Verified execution" in log:
        raise ValueError("verified execution already recorded")
    log += """

## Verified execution

- `python3 -B scripts/m3/m3_r3_03a_sandbox.py`: exit 0.
- `node --check sandbox/m3_pair_preview.cjs`: exit 0.
- `python3 -B scripts/m3/m3_r3_03a_timing_repair.py`: exit 0.
- `cargo test --locked --quiet`: 157 unit + 11 model + 17 event + 6 ledger = 191 passed; exit 0.
- `cargo clippy --locked --all-targets -- -D warnings`: exit 0.
- `npm run wasm:build`: exit 0; SHA-256 `""" + WASM + """`.
- `npm run sandbox:m3-r3-preview`: first run exit 1 (timing overshoot),
  bounded rerun PASS, exit 0. `git diff --check`: exit 0.

The local Sandbox observed the pre-bid rejection, selected offers `[2, 3]`
with price 12, three eligible jobs and aggregate cap 15; it observed zero
bundles, an open case, open offers and free slots. Revoking the third cap
made the preview return no candidate, while escrow moved from 116 to 111.
Successful transaction receipt IDs were not printed by the Sandbox command.

Files: `AGENTS.md`, `docs/HANDOFF.md`, `docs/STATUS.md`, this worklog,
`package.json`, `sandbox/m3_pair_preview.cjs`, `src/lib.rs`, `src/rescue.rs`,
`src/rescue_clearing.rs`, `src/rescue_clearing_tests.rs`, and four R3-03A
Python builders. Preserve the untracked audit file.

Limit: the preview grants no RecoveryRight and changes no buyer allocation,
provider bond or capacity slot. Earlier M2 and M3-R2 Sandboxes were not
rerun; public testnet and production funds remain unverified.
Next single action: M3-R3-03B capped-equal allocation and atomic award.
"""

    for path, content in ((handoff_path, handoff), (status_path, status),
                          (agents_path, agents), (log_path, log.rstrip() + "\n")):
        path.write_text(content, encoding="utf-8")
    print("M3-R3-03A DOCUMENTATION PASS; commit pending")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as error:
        print(f"M3-R3-03A FINALIZE FAIL: {error}", file=sys.stderr)
        sys.exit(2)
