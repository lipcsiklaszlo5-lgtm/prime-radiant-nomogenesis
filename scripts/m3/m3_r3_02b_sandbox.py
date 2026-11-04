"""Add the R3-02B on-chain release regression after focused Rust tests."""
from pathlib import Path
import subprocess
import sys

BASE = "71a1350"
SELF = "scripts/m3/m3_r3_02b_sandbox.py"
TARGET = "sandbox/m3_offer_release.cjs"
SANDBOX = r'''const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const wasm = process.env.NOMOGENESIS_WASM;
const UNIT = 10n ** 21n;
const BOND = 12n * UNIT;
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
  for (let attempt = 0; attempt < 20; attempt++) {
    const current = await timestamp(worker);
    if (current >= target) return;
    const blocks = Math.max(20, Math.min(5000,
      Number((target - current + 500000000n - 1n) / 500000000n)));
    console.log('Fast-forward blocks:', blocks);
    await rpc(worker, 'sandbox_fast_forward', {delta_height: blocks});
  }
  throw new Error('award close not reached');
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
    const provider0 = await root.createSubAccount('provider0');
    const provider1 = await root.createSubAccount('provider1');
    const keeper = await root.createSubAccount('keeper');
    const quote = await contract.view('m3_storage_quote', {});
    const caseStorage = BigInt(quote.case_storage_cost);
    const offerStorage = BigInt(quote.offer_storage_cost);
    const now = await timestamp(worker);
    const awardClose = now + 1800n * SECOND;
    const caseId = await creator.call(contract, 'create_rescue_case', {
      descriptor: {
        descriptor_version: 1,
        original_provider: source.accountId,
        component_commitments: [Array(32).fill(1), Array(32).fill(2)],
        dependency_deadline: Number(now + 1200n * SECOND),
        bid_close: Number(now + 1500n * SECOND),
        award_close: Number(awardClose),
        recovery_deadline: Number(now + 2400n * SECOND)
      }
    }, {attachedDeposit: caseStorage.toString()});
    const offerInput = component => ({
      case_id: caseId,
      component_index: component,
      slot_id: `slot_${component}`,
      fee: (6n * UNIT).toString(),
      bond_capacity: BOND.toString()
    });
    for (const [index, provider] of [provider0, provider1].entries()) {
      assert.equal(Number(await provider.call(contract, 'post_rescue_offer',
        {input: offerInput(index)},
        {attachedDeposit: (BOND + offerStorage).toString()})), index);
    }
    const totals = async () => {
      const v = await contract.view('m3_totals', {});
      return [BigInt(v.rescue_escrow), BigInt(v.storage_reserves)];
    };
    const claim = async provider => BigInt(await contract.view('get_claimable', {
      account: provider.accountId
    }));
    const storage = caseStorage + 2n * offerStorage;
    assert.deepEqual(await totals(), [2n * BOND, storage]);

    console.log('=== AUTHENTICATED CANCELLATION ===');
    await assert.rejects(() => keeper.call(contract, 'cancel_rescue_offer', {offer_id: 0}));
    assert.deepEqual(await totals(), [2n * BOND, storage]);
    await provider0.call(contract, 'cancel_rescue_offer', {offer_id: 0});
    await assert.rejects(() => provider0.call(contract, 'cancel_rescue_offer', {offer_id: 0}));
    assert.equal(await claim(provider0), BOND);
    assert.equal(await claim(provider1), 0n);
    assert.deepEqual(await totals(), [BOND, storage]);
    const cancelled = await contract.view('get_rescue_offer', {offer_id: 0});
    assert.equal(cancelled.phase, 'Released');
    assert.equal(cancelled.release_reason, 'Cancelled');
    assert.equal(BigInt(cancelled.held_bond), 0n);

    console.log('=== PERMISSIONLESS EXPIRY ===');
    await assert.rejects(() => keeper.call(contract, 'release_open_rescue_offer', {offer_id: 1}));
    await advanceTo(worker, awardClose);
    await keeper.call(contract, 'release_open_rescue_offer', {offer_id: 1});
    await assert.rejects(() => keeper.call(contract, 'release_open_rescue_offer', {offer_id: 1}));
    const expired = await contract.view('get_rescue_offer', {offer_id: 1});
    assert.equal(expired.phase, 'Released');
    assert.equal(expired.release_reason, 'AwardExpired');
    assert.equal(BigInt(expired.held_bond), 0n);
    assert.equal(await claim(provider1), BOND);
    assert.deepEqual(await totals(), [0n, storage]);
    assert.deepEqual((await contract.view('payout_totals', {})).map(BigInt), [2n * BOND, 0n]);
    for (const [index, provider] of [provider0, provider1].entries()) {
      assert.equal(await contract.view('capacity_lock_holder', {
        provider: provider.accountId, slot_id: `slot_${index}`
      }), null);
    }

    console.log('=== NATIVE PROVIDER WITHDRAWAL ===');
    await provider0.call(contract, 'withdraw', {amount: BOND.toString()},
      {gas: '200000000000000'});
    assert.equal(await claim(provider0), 0n);
    assert.equal(await claim(provider1), BOND);
    assert.deepEqual((await contract.view('payout_totals', {})).map(BigInt), [BOND, 0n]);
    assert.equal(await contract.view('get_pending_withdrawal', {withdrawal_id: 0}), null);
    console.log('=== SANDBOX/M3-R3-02B RESULT: PASS ===');
  } finally {
    if (worker) await worker.tearDown();
  }
}

main().catch(error => {
  console.error('=== SANDBOX/M3-R3-02B RESULT: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
'''

PACKAGE_OLD = '"sandbox:m3-r3-offer": "NOMOGENESIS_WASM=$PWD/target/nomogenesis_compatible.wasm node sandbox/m3_provider_offer_admission.cjs"'
PACKAGE_NEW = PACKAGE_OLD + ',\n    "sandbox:m3-r3-release": "NOMOGENESIS_WASM=$PWD/target/nomogenesis_compatible.wasm node sandbox/m3_offer_release.cjs"'
HANDOFF_OLD = '- Next single action: run focused offer release tests.'
HANDOFF_NEW = ('- Focused R3-02B tests: 5 passed, 0 failed (user Codespaces output).\n'
               '- Next single action: run full regression and R3-02B on-chain Sandbox.')
LOG_ENTRY = """
## Focused execution — 2026-11-04

- `python3 -B scripts/m3/m3_r3_02b_offer_release.py`: scaffold exit 0.
- `cargo fmt --all`: exit 0.
- `cargo test --locked --lib rescue_offer_release_tests`: 5 passed, 0 failed, exit 0.
- `git diff --check`: exit 0.
- Status: expected edits plus preserved untracked audit file.

## Sandbox step — pending execution

`python3 -B scripts/m3/m3_r3_02b_sandbox.py` creates the focused Sandbox
test and package command. Run the full Rust regression, Clippy, WASM build
and `npm run sandbox:m3-r3-release`; record actual exit codes. The Sandbox
checks two independent bonds, unauthorized cancellation, replay, keeper
expiry, storage invariance, claimable totals and native withdrawal.

The post-award unselected path currently has only a unit test with a
constructed bundle. A real award does not exist until R3-03.
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
        " M docs/HANDOFF.md", " M src/lib.rs",
        "?? docs/worklog/M3-R3-02B-offer-release.md",
        "?? sandbox/real_low_margin_audit.cjs",
        "?? scripts/m3/m3_r3_02b_offer_release.py",
        f"?? {SELF}",
        "?? src/rescue_offer_release_tests.rs",
    }
    status = set(git("status", "--porcelain").splitlines())
    if status != expected or git("diff", "--cached", "--name-only").strip():
        raise ValueError(f"unexpected worktree: {sorted(status)}")
    if Path(TARGET).exists():
        raise ValueError("sandbox target already exists")
    if "pub fn cancel_rescue_offer" not in Path("src/lib.rs").read_text():
        raise ValueError("release implementation missing")
    package = Path("package.json").read_text()
    handoff = Path("docs/HANDOFF.md").read_text()
    log = Path("docs/worklog/M3-R3-02B-offer-release.md").read_text()
    package = once(package, PACKAGE_OLD, PACKAGE_NEW, "package.json")
    handoff = once(handoff, HANDOFF_OLD, HANDOFF_NEW, "docs/HANDOFF.md")
    if "## Focused execution" in log:
        raise ValueError("worklog already updated")
    Path(TARGET).write_text(SANDBOX)
    Path("package.json").write_text(package)
    Path("docs/HANDOFF.md").write_text(handoff)
    Path("docs/worklog/M3-R3-02B-offer-release.md").write_text(log.rstrip() + "\n\n" + LOG_ENTRY.strip() + "\n")
    print("M3-R3-02B SANDBOX SCAFFOLD PASS; on-chain run pending")
    print(TARGET)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as error:
        print(f"M3-R3-02B SANDBOX SCAFFOLD FAIL: {error}", file=sys.stderr)
        sys.exit(2)
