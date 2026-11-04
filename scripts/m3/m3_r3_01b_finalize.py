"""Record the verified R3-01B checkpoint before staging."""

from pathlib import Path
import subprocess
import sys


def git(*args):
    return subprocess.check_output(["git", *args], text=True)


def change(text, old, new, name):
    if text.count(old) != 1:
        raise ValueError(f"{name}: expected one anchor, found {text.count(old)}")
    return text.replace(old, new, 1)


def main():
    expected_tracked = {
        "docs/HANDOFF.md", "sandbox/m3_rescue_lifecycle.cjs", "src/lib.rs",
        "src/rescue.rs", "src/rescue_case_tests.rs", "src/rescue_schema_tests.rs",
    }
    expected_untracked = {
        "sandbox/real_low_margin_audit.cjs",
        "scripts/m3/m3_r3_01b_schema.py",
        "scripts/m3/m3_r3_01b_finalize.py",
        "docs/worklog/M3-R3-01B-schema.md",
    }
    if git("branch", "--show-current").strip() != "feat/m2-escrow":
        raise ValueError("unexpected branch")
    if git("rev-parse", "--short", "HEAD").strip() != "97e9178":
        raise ValueError("unexpected HEAD")
    if set(git("diff", "--name-only").splitlines()) != expected_tracked:
        raise ValueError("unexpected tracked diff")
    if git("diff", "--cached", "--name-only").strip():
        raise ValueError("unexpected staged files")
    untracked = {
        s[3:] for s in git("status", "--porcelain").splitlines()
        if s.startswith("?? ")
    }
    if untracked != expected_untracked:
        raise ValueError(f"unexpected untracked files: {sorted(untracked)}")

    paths = [
        "docs/HANDOFF.md", "docs/STATUS.md", "AGENTS.md",
        "docs/worklog/M3-R3-01B-schema.md",
    ]
    docs = {name: Path(name).read_text(encoding="utf-8") for name in paths}
    handoff = docs["docs/HANDOFF.md"]
    a = handoff.index("## Current M3 checkpoint — 2026-11-04")
    b = handoff.index("## Munkamenetindító parancsok", a)
    current = handoff[a:b]
    if "verification pending" not in current:
        raise ValueError("HANDOFF checkpoint has changed")
    replacement = """## Current M3 checkpoint — 2026-11-04

- Branch: `feat/m2-escrow`; base: `97e9178` (R3-01A).
- R3-01B bounded offer/bundle schema and v2 storage quote: verified.
- Case/offer/bundle maximum records: 866/237/231 serialized bytes.
- Case quote: 1233 bytes, including one future bundle record.
- Offer quote: 613 bytes; no provider bond is accepted yet.
- Focused schema/case tests: 2 + 4 PASS; full Rust suite: 173 PASS.
- Clippy and compatible WASM build: PASS.
- WASM SHA-256: `242765bb258020878b957e81507be839ed939459380230c69c85ec58a324c2bf`.
- M2 primary, backup, settlement and M3-R2 Sandbox: PASS.
- Preserve untracked `sandbox/real_low_margin_audit.cjs`.
- Offer funding, bond release, bundle award and public testnet: not verified.
- Next single action: M3-R3-02A payable provider offer admission.

"""
    handoff = handoff[:a] + replacement + handoff[b:]
    handoff = change(
        handoff,
        "## Session napló (append-only)\n\n",
        """## Session napló (append-only)

### 2026-11-04 — M3-R3-01B bounded provider records

- Base: `97e9178`.
- Zero-liability offer/bundle records, six offer references and storage quote v2.
- Focused tests: 2 schema + 4 case PASS; full Rust suite: 173 PASS.
- Format, Clippy, compatible WASM, three M2 and one M3 Sandbox: PASS.
- WASM SHA-256: `242765bb258020878b957e81507be839ed939459380230c69c85ec58a324c2bf`.
- Bond funding and bundle award remain unimplemented.
- Next: M3-R3-02A payable provider offer admission.

""",
        "HANDOFF",
    )
    docs["docs/HANDOFF.md"] = handoff

    status = docs["docs/STATUS.md"]
    a = status.index("**Current state:**")
    b = status.index("## Frissítési szabály", a)
    if "M3-R3-01A typed capacity registry verified" not in status[a:b]:
        raise ValueError("STATUS current gate differs")
    status = status[:a] + """**Current state:** M3-R3-01B bounded offer/bundle schema verified
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Verified implementation base:** `97e9178` plus R3-01B checkpoint

| Area | Verified state |
|---|---|
| R2 funded demand and liability | COMPLETE |
| Typed M2/M3 capacity registry | IMPLEMENTED |
| Bounded provider offer and bundle schema | IMPLEMENTED, zero new liability |
| Case/offer storage quote | v2, 1233/613 bytes |
| Full Rust regression | 173 tests PASS |
| Clippy and compatible WASM | PASS |
| M2 primary, backup, settlement and M3-R2 Sandbox | PASS |
| Provider offer admission and bond funding | NOT IMPLEMENTED |
| Atomic RecoveryRight award | NOT IMPLEMENTED |
| Public testnet evidence | NOT VERIFIED |
| Production funds | NOT APPROVED |

## Current gate

R3-01B reserves bounded case, offer and future bundle storage on fresh state.
The four Sandbox runs passed on WASM SHA-256
`242765bb258020878b957e81507be839ed939459380230c69c85ec58a324c2bf`.
No provider bond or bundle award transition exists yet.

## Next task

M3-R3-02A: payable provider offer admission with exact funding, bounded
slot validation and separate bond liability.

""" + status[b:]
    docs["docs/STATUS.md"] = status

    agents = docs["AGENTS.md"]
    a = agents.index("Jelenlegi ellenőrzött kapu: M3-R3-01A.")
    b = agents.index("## 5. Munkamenet lezárás", a)
    agents = agents[:a] + """Jelenlegi ellenőrzött kapu: M3-R3-01B. A bounded offer/bundle
séma és v2 storage quote nulla új liability mellett készült. 173 Rust
teszt, Clippy, kompatibilis WASM build, három M2 és az M3-R2 Sandbox
átment. Valódi M3 offer, bond, bundle award és public testnet működés
még nincs igazolva. A következő ticket M3-R3-02A offer admission.

""" + agents[b:]
    docs["AGENTS.md"] = agents

    log = docs["docs/worklog/M3-R3-01B-schema.md"]
    log = change(
        log,
        "**Status:** scaffolded; verification pending.",
        "**Status:** verified locally; checkpoint SHA in Git history.",
        "worklog",
    )
    a = log.index("## Observed result\n")
    b = log.index("## Files\n", a)
    log = log[:a] + """## Observed result

- `python3 -B scripts/m3/m3_r3_01b_schema.py`: exit 0.
- `cargo fmt --all` and `cargo fmt --all -- --check`: exit 0.
- `cargo test --locked --lib rescue_schema_tests`: 2 PASS, exit 0.
- `cargo test --locked --lib rescue_case_tests`: 4 PASS, exit 0.
- `cargo test --locked`: 139 unit + 11 model + 17 event + 6 ledger =
  173 PASS, exit 0.
- `cargo clippy --locked --all-targets -- -D warnings`: exit 0.
- `npm run wasm:build`: exit 0; WASM SHA-256
  `242765bb258020878b957e81507be839ed939459380230c69c85ec58a324c2bf`.
- `npm run sandbox:primary`, `sandbox:backup`, `sandbox:settlement`,
  `sandbox:m3-r2`: each exit 0. M3 case quote 1233 bytes and the three
  independent buyers' principal reconciled.
- `git diff --check`: exit 0.
- Before commit, the six planned tracked files changed; this worklog and
  the scaffold are new; the untracked local audit file is untouched.

""" + log[b:]
    log = change(
        log,
        "Fresh deployment only; old serialized contract state is not migrated. Offer\nadmission and award remain absent. Run focused case/schema tests, then full\nRust suite, Clippy, WASM and the R2 Sandbox before finalizing the checkpoint.",
        "Fresh deployment only; old serialized contract state is not migrated. Offer\nadmission and award remain absent. Next: M3-R3-02A payable provider\noffer admission, with release in a separate step.",
        "worklog",
    )
    docs["docs/worklog/M3-R3-01B-schema.md"] = log

    for name, content in docs.items():
        Path(name).write_text(content, encoding="utf-8")
    print("R3-01B DOCUMENTATION PASS (commit pending)")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        print(f"R3-01B FINALIZE FAIL: {exc}")
        sys.exit(2)
