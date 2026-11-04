"""Add the R3-03A on-chain pair preview regression."""
from pathlib import Path
import subprocess
import sys

BASE = "46c0080"
SELF = "scripts/m3/m3_r3_03a_sandbox.py"
TARGET = "sandbox/m3_pair_preview.cjs"
SANDBOX = r'''const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const wasm = process.env.NOMOGENESIS_WASM;
const UNIT = 10n ** 21n;
const SECOND = 1000000000n;

async function rpc(worker, method, params) {
  const url = worker.config?.rpcAddr;
  assert.match(url || '', /^http:\/\/127\.0\.0\.1:\d+$/);
  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})
  });
  assert.equal(response.ok, true);
  const data = await response.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}

async function timestamp(worker) {
  const block = await rpc(worker, 'block', {finality: 'optimistic'});
  return BigInt(block.header.timestamp_nanosec ?? block.header.timestamp);
}

async function advanceTo(worker, target) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const now = await timestamp(worker);
    if (now >= target) return;
    const blocks = Math.max(20, Math.min(100,
      Number((target - now + 500000000n - 1n) / 500000000n)));
    console.log('Fast-forward blocks:', blocks);
    await rpc(worker, 'sandbox_fast_forward', {delta_height: blocks});
  }
  throw new Error('bid close not reached');
}

async function main() {
  assert.ok(wasm, 'NOMOGENESIS_WASM is required');
  let worker;
  try {
    worker = await Worker.init();
    const root = worker.rootAccount;
    const contract = await root.devDeploy(wasm);
    const creator = await root.createSubAccount('creator');
    const source = await root.createSubAccount('source');
    const buyers = [];
    const workers = [];
    const providers = [];
    for (let i = 0; i < 3; i++) {
      buyers.push(await root.createSubAccount(`buyer${i}`));
      workers.push(await root.createSubAccount(`worker${i}`));
    }
    for (let i = 0; i < 4; i++) {
      providers.push(await root.createSubAccount(`provider${i}`));
    }
    const quote = await contract.view('m3_storage_quote', {});
    const caseStorage = BigInt(quote.case_storage_cost);
    const jobStorage = BigInt(quote.job_storage_cost);
    const offerStorage = BigInt(quote.offer_storage_cost);
    const start = await timestamp(worker);
    const bidClose = start + 1500n * SECOND;
    const caseId = await creator.call(contract, 'create_rescue_case', {
      descriptor: {
        descriptor_version: 1,
        original_provider: source.accountId,
        component_commitments: [Array(32).fill(1), Array(32).fill(2)],
        dependency_deadline: Number(start + 1200n * SECOND),
        bid_close: Number(bidClose),
        award_close: Number(start + 3600n * SECOND),
        recovery_deadline: Number(start + 4800n * SECOND)
      }
    }, {attachedDeposit: caseStorage.toString()});

    console.log('=== THREE INDEPENDENT FUNDED JOBS ===');
    for (let i = 0; i < 3; i++) {
      const job = await buyers[i].call(contract, 'create_funded_rescue_job', {
        input: {
          case_id: caseId,
          worker: workers[i].accountId,
          worker_reward: (25n * UNIT).toString(),
          rescue_cap: (5n * UNIT).toString(),
          result_profile: 'ExactCommitment',
          result_commitment: Array(32).fill(10 + i),
          threshold: null,
          final_deadline: Number(start + 6000n * SECOND)
        }
      }, {attachedDeposit: (30n * UNIT + jobStorage).toString()});
      assert.equal(Number(job), i);
      await workers[i].call(contract, 'accept_rescue_job', {job_id: i});
    }

    console.log('=== UNDER-BONDED AND FULLY BONDED PAIRS ===');
    for (let i = 0; i < 4; i++) {
      const cheap = i < 2;
      const fee = (cheap ? 1n : 6n) * UNIT;
      const bond = (cheap ? 1n : 12n) * UNIT;
      const id = await providers[i].call(contract, 'post_rescue_offer', {
        input: {
          case_id: caseId,
          component_index: i % 2,
          slot_id: `slot_${i}`,
          fee: fee.toString(),
          bond_capacity: bond.toString()
        }
      }, {attachedDeposit: (bond + offerStorage).toString()});
      assert.equal(Number(id), i);
    }
    await assert.rejects(() => contract.view('preview_rescue_pair', {case_id: caseId}));
    await advanceTo(worker, bidClose);

    console.log('=== READ-ONLY DETERMINISTIC PREVIEW ===');
    const preview = await contract.view('preview_rescue_pair', {case_id: caseId});
    assert.deepEqual(preview.offer_ids, [2, 3]);
    assert.equal(BigInt(preview.total_price), 12n * UNIT);
    assert.deepEqual(preview.eligible_job_ids, [0, 1, 2]);
    assert.equal(BigInt(preview.eligible_cap_total), 15n * UNIT);
    const totals = await contract.view('m3_totals', {});
    assert.equal(BigInt(totals.rescue_escrow), 116n * UNIT);
    assert.equal(BigInt(totals.storage_reserves),
      caseStorage + 3n * jobStorage + 4n * offerStorage);
    assert.equal(await contract.view('next_rescue_bundle_id', {}), 0);
    assert.equal(await contract.view('has_rescue_bundle', {bundle_id: 0}), false);
    const caseView = await contract.view('get_rescue_case', {case_id: caseId});
    assert.equal(caseView.phase, 'Open');
    assert.equal(caseView.awarded_bundle_id, null);
    for (const i of [2, 3]) {
      assert.equal((await contract.view('get_rescue_offer', {offer_id: i})).phase, 'Open');
      assert.equal(await contract.view('capacity_lock_holder', {
        provider: providers[i].accountId, slot_id: `slot_${i}`
      }), null);
    }

    console.log('=== CAP REVOCATION REMOVES THE CANDIDATE ===');
    await buyers[2].call(contract, 'revoke_open_rescue_mandate', {job_id: 2});
    assert.equal(await contract.view('preview_rescue_pair', {case_id: caseId}), null);
    assert.equal(await contract.view('next_rescue_bundle_id', {}), 0);
    assert.equal(BigInt((await contract.view('m3_totals', {})).rescue_escrow), 111n * UNIT);
    console.log('=== SANDBOX/M3-R3-03A RESULT: PASS ===');
  } finally {
    if (worker) await worker.tearDown();
  }
}

main().catch(error => {
  console.error('=== SANDBOX/M3-R3-03A RESULT: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
'''

PACKAGE_OLD = '"sandbox:m3-r3-release": "NOMOGENESIS_WASM=$PWD/target/nomogenesis_compatible.wasm node sandbox/m3_offer_release.cjs"'
PACKAGE_NEW = PACKAGE_OLD + ',\n    "sandbox:m3-r3-preview": "NOMOGENESIS_WASM=$PWD/target/nomogenesis_compatible.wasm node sandbox/m3_pair_preview.cjs"'
HANDOFF_OLD = '- Next single action: run focused read-only clearing tests.'
HANDOFF_NEW = ('- R3-03A focused read-only tests: 7 passed, 0 failed (Codespaces output).\n'
               '- Next single action: run full Rust regression and on-chain pair preview.')
LOG_ENTRY = """
## Focused execution — 2026-11-04

- `python3 -B scripts/m3/m3_r3_03a_pair_preflight.py`: exit 0.
- `cargo fmt --all`: exit 0.
- `cargo test --locked --lib rescue_clearing_tests`: 7 passed, 0 failed; exit 0.
- `git diff --check`: exit 0.
- Worktree contained only expected edits and the preserved audit file.

## Sandbox step — pending execution

`python3 -B scripts/m3/m3_r3_03a_sandbox.py` adds a fresh-state NEAR Sandbox
scenario with three funded jobs, four offers, under-bonded cheap bids, a
read-only winner preview, and a revoked mandate eliminating that candidate.
The full Rust suite, Clippy, compatible WASM and Sandbox results remain to
be recorded from actual Codespaces output.
"""


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
        " M docs/HANDOFF.md", " M src/lib.rs", " M src/rescue.rs",
        "?? docs/worklog/M3-R3-03A-pair-preflight.md",
        "?? sandbox/real_low_margin_audit.cjs",
        "?? scripts/m3/m3_r3_03a_pair_preflight.py",
        f"?? {SELF}", "?? src/rescue_clearing.rs", "?? src/rescue_clearing_tests.rs",
    }
    status = set(git("status", "--porcelain").splitlines())
    if status != expected or git("diff", "--cached", "--name-only").strip():
        raise ValueError(f"unexpected worktree: {sorted(status)}")
    if Path(TARGET).exists():
        raise ValueError("sandbox target already exists")
    if "pub fn preview_rescue_pair" not in Path("src/lib.rs").read_text():
        raise ValueError("preview endpoint missing")
    package = once(Path("package.json").read_text(), PACKAGE_OLD, PACKAGE_NEW, "package")
    handoff = once(Path("docs/HANDOFF.md").read_text(), HANDOFF_OLD, HANDOFF_NEW, "handoff")
    log = Path("docs/worklog/M3-R3-03A-pair-preflight.md").read_text()
    if "## Focused execution" in log:
        raise ValueError("worklog already updated")
    Path(TARGET).write_text(SANDBOX)
    Path("package.json").write_text(package)
    Path("docs/HANDOFF.md").write_text(handoff)
    Path("docs/worklog/M3-R3-03A-pair-preflight.md").write_text(log.rstrip() + "\n\n" + LOG_ENTRY.strip() + "\n")
    print("M3-R3-03A SANDBOX SCAFFOLD PASS; on-chain run pending")
    print(TARGET)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as error:
        print(f"M3-R3-03A SANDBOX SCAFFOLD FAIL: {error}", file=sys.stderr)
        sys.exit(2)
