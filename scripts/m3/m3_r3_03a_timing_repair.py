"""Bound Sandbox fast-forward steps after the observed award-window overshoot."""
from pathlib import Path
import subprocess
import sys

BASE = "46c0080"
SELF = "scripts/m3/m3_r3_03a_timing_repair.py"


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
        "?? scripts/m3/m3_r3_03a_sandbox.py", f"?? {SELF}",
        "?? src/rescue_clearing.rs", "?? src/rescue_clearing_tests.rs",
    }
    status = set(git("status", "--porcelain").splitlines())
    if status != expected or git("diff", "--cached", "--name-only").strip():
        raise ValueError(f"unexpected worktree: {sorted(status)}")

    paths = [Path("sandbox/m3_pair_preview.cjs"),
             Path("scripts/m3/m3_r3_03a_sandbox.py")]
    originals = {path: path.read_text(encoding="utf-8") for path in paths}
    updated = {}
    for path, content in originals.items():
        content = once(content, "attempt < 20", "attempt < 100", str(path))
        content = once(content, "Math.min(5000,", "Math.min(100,", str(path))
        updated[path] = content

    log_path = Path("docs/worklog/M3-R3-03A-pair-preflight.md")
    log = log_path.read_text(encoding="utf-8")
    if "## Sandbox timing finding" in log:
        raise ValueError("timing finding already recorded")
    log += """

## Sandbox timing finding — 2026-11-04

- Full `cargo test --locked --quiet`: 157 + 11 + 17 + 6 passed; exit 0.
- `cargo clippy --locked --all-targets -- -D warnings`: exit 0.
- `npm run wasm:build`: exit 0; WASM SHA-256 `59c1cd29cd54f1c4e5985e8ff4193d558f41985b61e26144ed08556d9d7d968c`.
- Initial `npm run sandbox:m3-r3-preview`: exit 1. The helper jumped 2960
  blocks in one step, past `award_close`; the contract rejected the preview
  with `outside award window`. No Rust contract change is indicated.
- Repair: cap each fast-forward step at 100 blocks and allow up to 100
  measured iterations. Rerun the same on-chain scenario; result pending.
"""
    handoff_path = Path("docs/HANDOFF.md")
    handoff = once(handoff_path.read_text(encoding="utf-8"),
                   "- Next single action: run full Rust regression and on-chain pair preview.",
                   "- Full Rust suite, Clippy and compatible WASM: PASS; Sandbox timing repair pending.\n"
                   "- Next single action: rerun on-chain pair preview after bounded fast-forward.",
                   str(handoff_path))

    for path, content in updated.items():
        path.write_text(content, encoding="utf-8")
    log_path.write_text(log.rstrip() + "\n", encoding="utf-8")
    handoff_path.write_text(handoff, encoding="utf-8")
    print("M3-R3-03A TIMING REPAIR PASS; on-chain rerun pending")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as error:
        print(f"M3-R3-03A TIMING REPAIR FAIL: {error}", file=sys.stderr)
        sys.exit(2)
