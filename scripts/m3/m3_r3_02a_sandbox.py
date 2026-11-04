"""Add the focused on-chain provider offer admission regression."""

from pathlib import Path
import json
import subprocess
import sys

BASE = "314d44b"
SELF = "scripts/m3/m3_r3_02a_sandbox.py"
TEST = "sandbox/m3_provider_offer_admission.cjs"

SANDBOX = r'''const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const wasm = process.env.NOMOGENESIS_WASM;
const UNIT = 10n ** 21n;
const BOND = 12n * UNIT;
const FEE = 6n * UNIT;
const SECOND = 1000000000n;

async function blockTimestamp(worker) {
  const url = worker.config?.rpcAddr;
  assert.match(url || '', /^http:\/\/127\.0\.0\.1:\d+$/);
  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'block',
      params: {finality: 'optimistic'}
    })
  });
  assert.equal(response.ok, true);
  const body = await response.json();
  if (body.error) throw new Error(JSON.stringify(body.error));
  return BigInt(body.result.header.timestamp_nanosec ??
    body.result.header.timestamp);
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
    const quote = await contract.view('m3_storage_quote', {});
    const caseStorage = BigInt(quote.case_storage_cost);
    const offerStorage = BigInt(quote.offer_storage_cost);
    assert.equal(Number(quote.quote_version), 2);
    assert.equal(Number(quote.offer_storage_bytes), 613);

    const now = await blockTimestamp(worker);
    const descriptor = {
      descriptor_version: 1,
      original_provider: source.accountId,
      component_commitments: [Array(32).fill(1), Array(32).fill(2)],
      dependency_deadline: Number(now + 120n * SECOND),
      bid_close: Number(now + 150n * SECOND),
      award_close: Number(now + 180n * SECOND),
      recovery_deadline: Number(now + 240n * SECOND)
    };
    const caseId = await creator.call(
      contract, 'create_rescue_case', {descriptor},
      {attachedDeposit: caseStorage.toString()}
    );
    assert.equal(caseId.length, 32);

    const input = (component, slot) => ({
      case_id: caseId,
      component_index: component,
      slot_id: slot,
      fee: FEE.toString(),
      bond_capacity: BOND.toString()
    });
    const totals = async () => {
      const value = await contract.view('m3_totals', {});
      return {
        escrow: BigInt(value.rescue_escrow),
        storage: BigInt(value.storage_reserves)
      };
    };

    console.log('=== FUNDED OFFER UNDERPAYMENT ===');
    await assert.rejects(() => provider0.call(
      contract, 'post_rescue_offer', {input: input(0, 'slot_0')},
      {attachedDeposit: (BOND + offerStorage - 1n).toString()}
    ));
    assert.deepEqual(await totals(), {escrow: 0n, storage: caseStorage});

    console.log('=== TWO INDEPENDENT PROVIDERS ===');
    for (const [index, provider] of [provider0, provider1].entries()) {
      const offerId = Number(await provider.call(
        contract, 'post_rescue_offer',
        {input: input(index, 'slot_' + index)},
        {attachedDeposit: (BOND + offerStorage).toString()}
      ));
      assert.equal(offerId, index);
      const offer = await contract.view('get_rescue_offer', {offer_id: offerId});
      assert.equal(offer.provider, provider.accountId);
      assert.equal(offer.phase, 'Open');
      assert.equal(BigInt(offer.fee), FEE);
      assert.equal(BigInt(offer.bond_capacity), BOND);
      assert.equal(BigInt(offer.held_bond), BOND);
      assert.equal(await contract.view('capacity_lock_holder', {
        provider: provider.accountId, slot_id: 'slot_' + index
      }), null);
    }

    const caseView = await contract.view('get_rescue_case', {case_id: caseId});
    assert.deepEqual(caseView.offer_ids, [0, 1]);
    assert.deepEqual(await totals(), {
      escrow: 2n * BOND,
      storage: caseStorage + 2n * offerStorage
    });
    await assert.rejects(() => provider0.call(
      contract, 'post_rescue_offer', {input: input(0, 'different')},
      {attachedDeposit: (BOND + offerStorage).toString()}
    ));
    assert.deepEqual(await totals(), {
      escrow: 2n * BOND,
      storage: caseStorage + 2n * offerStorage
    });
    assert.deepEqual(
      (await contract.view('get_rescue_case', {case_id: caseId})).offer_ids,
      [0, 1]
    );
    console.log('Independent bonds, storage and replay rejection: PASS');
    console.log('=== SANDBOX/M3-R3-02A RESULT: PASS ===');
  } finally {
    if (worker) await worker.tearDown();
  }
}

main().catch(error => {
  console.error('=== SANDBOX/M3-R3-02A RESULT: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
'''


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    if run("git", "branch", "--show-current") != "feat/m2-escrow":
        raise ValueError("unexpected branch")
    if run("git", "rev-parse", "--short", "HEAD") != BASE:
        raise ValueError("unexpected HEAD")
    changed = set(run("git", "diff", "--name-only").splitlines())
    if changed != {"docs/HANDOFF.md", "src/lib.rs", "src/rescue.rs"}:
        raise ValueError(f"unexpected tracked files: {sorted(changed)}")
    if run("git", "diff", "--cached", "--name-only"):
        raise ValueError("unexpected staged files")
    lines = run("git", "status", "--porcelain").splitlines()
    untracked = {line[3:] for line in lines if line.startswith("?? ")}
    expected = {
        "docs/worklog/M3-R3-02A-offer-admission.md",
        "sandbox/real_low_margin_audit.cjs",
        "scripts/m3/m3_r3_02a_offer_admission.py",
        SELF,
        "src/rescue_offer_tests.rs",
    }
    if untracked != expected or Path(TEST).exists():
        raise ValueError(f"unexpected untracked files: {sorted(untracked)}")

    package_path = Path("package.json")
    package = json.loads(package_path.read_text(encoding="utf-8"))
    script = "NOMOGENESIS_WASM=$PWD/target/nomogenesis_compatible.wasm node " + TEST
    if "sandbox:m3-r3-offer" in package["scripts"]:
        raise ValueError("sandbox script already registered")
    package["scripts"]["sandbox:m3-r3-offer"] = script

    log_path = Path("docs/worklog/M3-R3-02A-offer-admission.md")
    log = log_path.read_text(encoding="utf-8")
    if log.count("## Focused local verification") != 0:
        raise ValueError("sandbox worklog already recorded")
    log += """
## Focused local verification

- Focused offer tests: 6 passed, exit 0.
- Full Rust suite: 145 unit + 11 model + 17 event + 6 ledger = 179 passed.
- Clippy and compatible WASM build: exit 0.
- WASM SHA-256: `a82f0c54d1e1d24d92d2a745a4882ac7e381c6c27b7094e4aee09f0291b367c5`.
- Sandbox scaffold: `python3 -B scripts/m3/m3_r3_02a_sandbox.py`.
- New files: `sandbox/m3_provider_offer_admission.cjs` and this Python
  scaffold; `package.json` gains `sandbox:m3-r3-offer`.
- `npm run sandbox:m3-r3-offer`: pending actual run and exit code.
- Next: run this on-chain offer admission test, then M2 and R2 regressions.
"""
    package_path.write_text(
        json.dumps(package, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    Path(TEST).write_text(SANDBOX, encoding="utf-8")
    log_path.write_text(log, encoding="utf-8")
    print("M3-R3-02A SANDBOX SCAFFOLD PASS (on-chain run pending)")
    print(TEST)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        print(f"M3-R3-02A SANDBOX SCAFFOLD FAIL: {exc}")
        sys.exit(2)
