"""Record verified R3-02B evidence before committing the checkpoint."""
from pathlib import Path
import subprocess
import sys

BASE = "71a1350"
WASM = "f67b157ebba28f48b7096c43e10d3322c7b5f4f3e2e6d3bff9d84bcbfa088221"
SELF = "scripts/m3/m3_r3_02b_finalize.py"


def git(*args):
    return subprocess.check_output(["git", *args], text=True)


def once(text, old, new, name):
    count = text.count(old)
    if count != 1:
        raise ValueError(f"{name}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


def main():
    if git("branch", "--show-current").strip() != "feat/m2-escrow":
        raise ValueError("unexpected branch")
    if git("rev-parse", "--short", "HEAD").strip() != BASE:
        raise ValueError("unexpected HEAD")
    expected = {
        " M docs/HANDOFF.md", " M package.json", " M src/lib.rs",
        "?? docs/worklog/M3-R3-02B-offer-release.md",
        "?? sandbox/m3_offer_release.cjs",
        "?? sandbox/real_low_margin_audit.cjs",
        "?? scripts/m3/m3_r3_02b_offer_release.py",
        "?? scripts/m3/m3_r3_02b_sandbox.py",
        f"?? {SELF}", "?? src/rescue_offer_release_tests.rs",
    }
    actual = set(git("status", "--porcelain").splitlines())
    if actual != expected or git("diff", "--cached", "--name-only").strip():
        raise ValueError(f"unexpected worktree: {sorted(actual)}")
    if subprocess.run(["git", "diff", "--check"], check=False).returncode:
        raise ValueError("diff whitespace check failed")

    builder_path = Path("scripts/m3/m3_r3_02b_offer_release.py")
    builder = builder_path.read_text()
    lines = builder.splitlines(keepends=True)
    if sum(line == " \n" for line in lines) != 5:
        raise ValueError("offer builder patch context differs")
    builder = "".join("\\x20\n" if line == " \n" else line for line in lines)
    anchor = '    subprocess.run(["git", "apply", "--check", "-"], input=PATCH, text=True, check=True)'
    if builder.count(anchor) != 1:
        raise ValueError("offer builder apply anchor differs")
    builder = builder.replace(anchor,
        '    patch = PATCH.replace("\\\\x20\\n", " \\n")\n'
        '    subprocess.run(["git", "apply", "--check", "-"], input=patch, text=True, check=True)', 1)
    builder = once(builder,
        '    subprocess.run(["git", "apply", "-"], input=PATCH, text=True, check=True)',
        '    subprocess.run(["git", "apply", "-"], input=patch, text=True, check=True)',
        "offer builder apply")

    handoff_path = Path("docs/HANDOFF.md")
    handoff = handoff_path.read_text()
    start = handoff.index("## Current M3 checkpoint — 2026-11-04\n")
    end = handoff.index("## Munkamenetindító parancsok\n", start)
    current = """## Current M3 checkpoint — 2026-11-04

- Branch: `feat/m2-escrow`; implementation base: `71a1350`.
- M3-R3-02B provider offer terminal release verified locally.
- Five focused release tests; full Rust suite: 150 + 11 + 17 + 6 = 184 passed.
- Clippy, compatible WASM build, Node syntax and diff check: PASS.
- WASM SHA-256: `WASM_HASH`.
- Fresh NEAR Sandbox: authenticated cancellation, permissionless expiry,
  exact claimable/escrow accounting, replay rejection and withdrawal: PASS.
- Earlier M2 and M3-R2 Sandboxes were not rerun in this ticket.
- Preserve untracked `sandbox/real_low_margin_audit.cjs`.
- Real bundle award, post-award unselected release and public testnet: not verified.
- Next single action: M3-R3-03A deterministic candidate selection preflight.

""".replace("WASM_HASH", WASM)
    handoff = handoff[:start] + current + handoff[end:]
    session = """### 2026-11-04 — M3-R3-02B provider offer release

- Base: `71a1350`; five focused and 184 full Rust tests passed.
- Clippy, WASM `WASM_HASH`, Node syntax and diff checks passed.
- Local Sandbox checked two separate provider bonds, authenticated cancel,
  keeper expiry, replay rejection and provider withdrawal.
- Awarded-case unselected path is unit-tested with a constructed bundle;
  production award remains R3-03.
- Next: R3-03A deterministic candidate selection preflight.

""".replace("WASM_HASH", WASM)
    handoff = once(handoff, "## Session napló (append-only)\n\n",
                   "## Session napló (append-only)\n\n" + session, "HANDOFF session")

    status_path = Path("docs/STATUS.md")
    status = status_path.read_text()
    a = status.index("# STATUS — Prime Radiant / Nomogenesis\n")
    b = status.index("## Frissítési szabály\n", a)
    status_current = """# STATUS — Prime Radiant / Nomogenesis

**Current state:** M3-R3-02B provider offer release verified locally
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Implementation base:** `71a1350` plus R3-02B checkpoint

| Area | Verified state |
|---|---|
| R2 funded demand and liability | COMPLETE |
| Typed M2/M3 capacity registry | IMPLEMENTED |
| Provider offer admission and separate bonds | SANDBOX PASS |
| Provider offer cancel and expiry | SANDBOX PASS |
| Separate storage and M3 economic liability | SANDBOX PASS |
| Full Rust regression | 184 tests PASS |
| Clippy and compatible WASM | PASS |
| M2 primary, backup, settlement and M3-R2 Sandbox | PRIOR CHECKPOINT PASS |
| Atomic RecoveryRight award | NOT IMPLEMENTED |
| Public testnet evidence | NOT VERIFIED |
| Production funds | NOT APPROVED |

## Current gate

Two separately bonded offers were released exactly once in a fresh local
NEAR Sandbox. Their original providers received claimable credit; storage
reserves and capacity locks stayed unchanged. A native withdrawal completed.
WASM SHA-256: `WASM_HASH`. The negative receipts are expected rejections.
The test did not measure the receiving account's native balance change.
An actual awarded-case unselected release awaits R3-03 bundle award.

## Next task

M3-R3-03A: deterministic on-chain eligible-pair enumeration and preflight,
before the atomic award state mutation.

""".replace("WASM_HASH", WASM)
    status = status[:a] + status_current + status[b:]

    agents_path = Path("AGENTS.md")
    agents = agents_path.read_text()
    old_gate = """Jelenlegi ellenőrzött kapu: M3-R3-02A. Két provider külön
fedezett ajánlata helyi Sandboxban átment; a slotok még szabadok.
179 Rust teszt, Clippy, kompatibilis WASM, három M2 és két M3 Sandbox
átment. Offer release, bundle award és public testnet működés még
nincs igazolva. A következő ticket M3-R3-02B terminal release."""
    new_gate = """Jelenlegi ellenőrzött kapu: M3-R3-02B. Két provider nyitott
ajánlata helyi Sandboxban egyszeri claimable jóváírással felszabadult.
184 Rust teszt, Clippy és kompatibilis WASM átment. Az R3-02B Sandbox
átment; a korábbi M2 és M3-R2 Sandboxes ebben a ticketben nem futottak.
Valódi bundle award és public testnet még nincs igazolva. Következő:
M3-R3-03A determinisztikus candidate selection preflight."""
    agents = once(agents, old_gate, new_gate, "AGENTS gate")

    log_path = Path("docs/worklog/M3-R3-02B-offer-release.md")
    log = log_path.read_text()
    log = once(log, "**Status:** scaffold prepared; execution in Codespaces pending.",
               "**Status:** verified locally; checkpoint SHA in Git history.", "worklog status")
    log = once(log, "Pending execution and exit code. Focused Rust tests, full regression,\nClippy, compatible WASM and Sandbox results must be recorded from actual\noutput before marking this checkpoint verified.",
               "Execution results and exit codes are recorded below.", "worklog pending")
    log = once(log, "## Sandbox step — pending execution", "## Sandbox step", "worklog step")
    verified = """## Verified execution

- `python3 -B scripts/m3/m3_r3_02b_sandbox.py`: exit 0.
- `node --check sandbox/m3_offer_release.cjs`: exit 0.
- `cargo test --locked`: 150 unit + 11 model + 17 event + 6 ledger = 184 passed; exit 0.
- `cargo clippy --locked --all-targets -- -D warnings`: exit 0.
- `npm run wasm:build`: exit 0; SHA-256 `WASM_HASH`.
- `npm run sandbox:m3-r3-release`: PASS, exit 0 on fresh local state.
- `git diff --check`: exit 0.

Sandbox rejected keeper cancellation (receipt `CapwoFn3gCNBxt9EcUMfky3qAZgk9GWoEQzRjF5PscLh`),
early expiry (`48BuNjsEC2coUBoEkfMPUig5k5HRU8wWim5FtSaBrbjs`) and both
replays. After award close it credited both providers once, retained storage
reserves, left capacity slots free and completed a withdrawal callback.
It did not compare native receiving-account balances. Earlier lifecycle
Sandboxes were not rerun on this WASM. Post-award unselected release still
needs an actual awarded bundle in R3-03.

## Checkpoint and next action

Changed files: `AGENTS.md`, `docs/HANDOFF.md`, `docs/STATUS.md`, this worklog,
`package.json`, `sandbox/m3_offer_release.cjs`, `src/lib.rs`,
`src/rescue_offer_release_tests.rs`, and three R3-02B Python builders.
The commit command prints the resulting SHA. Preserve the local audit file.
Next: M3-R3-03A deterministic candidate selection preflight.
""".replace("WASM_HASH", WASM)
    if "## Verified execution" in log:
        raise ValueError("worklog already finalized")
    log = log.rstrip() + "\n\n" + verified

    for path, content in ((handoff_path, handoff), (status_path, status),
                          (agents_path, agents), (log_path, log)):
        path.write_text(content)
    builder_path.write_text(builder)
    print("M3-R3-02B DOCUMENTATION PASS; commit pending")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as error:
        print(f"M3-R3-02B FINALIZE FAIL: {error}", file=sys.stderr)
        sys.exit(2)
