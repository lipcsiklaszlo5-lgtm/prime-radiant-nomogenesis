from pathlib import Path
import json
import subprocess
import sys

BASE = "3bfb9cb"
AUDIT = "?? sandbox/real_low_margin_audit.cjs"
SELF = "?? scripts/m3/m3_r2_04_sandbox.py"

def fail(message: str) -> None:
    print(f"M3-R2-04 SCAFFOLD FAIL: {message}")
    sys.exit(2)

def read(name: str) -> str:
    return Path(name).read_text(encoding="utf-8")

def write(name: str, content: str) -> None:
    path = Path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")

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
    "sandbox/m3_rescue_lifecycle.cjs",
    "docs/worklog/M3-R2-04-sandbox.md",
):
    if Path(name).exists():
        fail(f"target already exists: {name}")

package_path = Path("package.json")
package = json.loads(read(str(package_path)))

script_name = "sandbox:m3-r2"
script_value = (
    "NOMOGENESIS_WASM=$PWD/target/nomogenesis_compatible.wasm "
    "node sandbox/m3_rescue_lifecycle.cjs"
)

if script_name in package["scripts"]:
    fail(f"package script already exists: {script_name}")

package["scripts"][script_name] = script_value

sandbox = r'''const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const wasm = process.env.NOMOGENESIS_WASM;

const YOCTO = 10n ** 24n;
const UNIT = YOCTO / 1000n;
const REWARD = 25n * UNIT;
const CAP = 5n * UNIT;
const PRINCIPAL = REWARD + CAP;
const WITHDRAWAL = 20n * UNIT;
const GAS_MARGIN = 10n * UNIT;
const SECOND = 1000000000n;

async function sandboxRpc(worker, method, params) {
  const url = worker.config?.rpcAddr;

  assert.match(
    url || '',
    /^http:\/\/127\.0\.0\.1:\d+$/,
    'Expected local sandbox RPC address'
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    })
  });

  assert.equal(
    response.ok,
    true,
    'Sandbox RPC HTTP failure'
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(
      method + ': ' + JSON.stringify(data.error)
    );
  }

  return data.result;
}

async function blockTimestamp(worker) {
  const block = await sandboxRpc(
    worker,
    'block',
    {finality: 'optimistic'}
  );

  return BigInt(
    block.header.timestamp_nanosec ??
    block.header.timestamp
  );
}

async function fastForwardPast(
  worker,
  target,
  label
) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    const current = await blockTimestamp(worker);

    if (current >= target) {
      console.log(label + ' reached: PASS');
      return;
    }

    const remaining = target - current;
    const estimate = Number(
      (remaining + 500000000n - 1n) /
      500000000n
    );
    const blocks = Math.max(
      20,
      Math.min(5000, estimate)
    );

    console.log(
      label + ' advance:',
      blocks,
      'blocks, step',
      attempt
    );

    await sandboxRpc(
      worker,
      'sandbox_fast_forward',
      {delta_height: blocks}
    );
  }

  throw new Error(label + ' was not reached');
}

async function accountBalance(worker, accountId) {
  const result = await sandboxRpc(worker, 'query', {
    request_type: 'view_account',
    account_id: accountId,
    finality: 'optimistic'
  });

  return BigInt(result.amount);
}

async function main() {
  let worker;

  try {
    console.log('=== START M3-R2 NEAR SANDBOX ===');

    worker = await Worker.init();

    const root = worker.rootAccount;
    const contract = await root.devDeploy(wasm);

    const creator = await root.createSubAccount('creator');
    const source = await root.createSubAccount('source');
    const keeper = await root.createSubAccount('keeper');
    const outsider = await root.createSubAccount('outsider');

    const buyers = [];
    const workers = [];

    for (let index = 0; index < 3; index++) {
      buyers.push(
        await root.createSubAccount('buyer' + index)
      );
      workers.push(
        await root.createSubAccount('worker' + index)
      );
    }

    console.log('Contract:', contract.accountId);
    console.log(
      'Independent accounts:',
      3,
      'buyers,',
      3,
      'workers'
    );

    const quote = await contract.view(
      'm3_storage_quote',
      {}
    );

    const caseStorage = BigInt(
      quote.case_storage_cost
    );
    const jobStorage = BigInt(
      quote.job_storage_cost
    );

    assert.equal(
      BigInt(quote.case_storage_bytes),
      893n
    );
    assert.equal(
      BigInt(quote.job_storage_bytes),
      576n
    );

    console.log(
      'Case storage quote:',
      caseStorage.toString()
    );
    console.log(
      'Job storage quote:',
      jobStorage.toString()
    );

    const initialTime = await blockTimestamp(worker);

    const dependencyDeadline =
      initialTime + 120n * SECOND;
    const bidClose =
      initialTime + 150n * SECOND;
    const awardClose =
      initialTime + 180n * SECOND;
    const recoveryDeadline =
      initialTime + 240n * SECOND;
    const finalDeadline =
      initialTime + 300n * SECOND;

    const descriptor = {
      descriptor_version: 1,
      original_provider: source.accountId,
      component_commitments: [
        Array(32).fill(1),
        Array(32).fill(2)
      ],
      dependency_deadline:
        Number(dependencyDeadline),
      bid_close: Number(bidClose),
      award_close: Number(awardClose),
      recovery_deadline:
        Number(recoveryDeadline)
    };

    const m3Totals = async () => {
      const value = await contract.view(
        'm3_totals',
        {}
      );

      return {
        rescueEscrow:
          BigInt(value.rescue_escrow),
        storageReserves:
          BigInt(value.storage_reserves),
        nextJob:
          Number(value.next_rescue_job_id)
      };
    };

    const claim = async account => BigInt(
      await contract.view('get_claimable', {
        account: account.accountId
      })
    );

    const payoutTotals = async () => (
      await contract.view('payout_totals', {})
    ).map(BigInt);

    console.log(
      '=== EXACT CASE STORAGE ADMISSION ==='
    );

    await assert.rejects(
      () => creator.call(
        contract,
        'create_rescue_case',
        {descriptor},
        {
          attachedDeposit:
            (caseStorage - 1n).toString()
        }
      )
    );

    assert.deepEqual(
      await m3Totals(),
      {
        rescueEscrow: 0n,
        storageReserves: 0n,
        nextJob: 0
      }
    );

    const caseId = await creator.call(
      contract,
      'create_rescue_case',
      {descriptor},
      {
        attachedDeposit: caseStorage.toString()
      }
    );

    assert.equal(caseId.length, 32);

    const caseView = await contract.view(
      'get_rescue_case',
      {case_id: caseId}
    );

    assert.equal(caseView.phase, 'Open');
    assert.equal(
      caseView.original_provider,
      source.accountId
    );
    assert.deepEqual(caseView.job_ids, []);

    await assert.rejects(
      () => creator.call(
        contract,
        'create_rescue_case',
        {descriptor},
        {
          attachedDeposit: caseStorage.toString()
        }
      )
    );

    assert.equal(
      (await m3Totals()).storageReserves,
      caseStorage
    );

    console.log(
      'Canonical case and exact storage:',
      'PASS'
    );

    const jobInput = index => ({
      case_id: caseId,
      worker: workers[index].accountId,
      worker_reward: REWARD.toString(),
      rescue_cap: CAP.toString(),
      result_profile: 'ExactCommitment',
      result_commitment:
        Array(32).fill(10 + index),
      threshold: null,
      final_deadline: Number(finalDeadline)
    });

    console.log(
      '=== THREE ATOMIC FUNDED JOBS ==='
    );

    const required = PRINCIPAL + jobStorage;

    await assert.rejects(
      () => buyers[0].call(
        contract,
        'create_funded_rescue_job',
        {input: jobInput(0)},
        {
          attachedDeposit:
            (required - 1n).toString()
        }
      )
    );

    assert.deepEqual(
      await m3Totals(),
      {
        rescueEscrow: 0n,
        storageReserves: caseStorage,
        nextJob: 0
      }
    );

    const jobs = [];

    for (let index = 0; index < 3; index++) {
      const jobId = Number(
        await buyers[index].call(
          contract,
          'create_funded_rescue_job',
          {input: jobInput(index)},
          {
            attachedDeposit:
              required.toString()
          }
        )
      );

      assert.equal(jobId, index);
      jobs.push(jobId);

      const job = await contract.view(
        'get_rescue_job',
        {job_id: jobId}
      );

      const mandate = await contract.view(
        'get_rescue_mandate',
        {job_id: jobId}
      );

      assert.equal(job.buyer, buyers[index].accountId);
      assert.equal(job.worker, workers[index].accountId);
      assert.equal(job.phase, 'Funded');
      assert.equal(
        BigInt(job.held_worker_reward),
        REWARD
      );

      assert.equal(mandate.phase, 'Open');
      assert.equal(
        BigInt(mandate.held_principal),
        CAP
      );
    }

    assert.deepEqual(
      await m3Totals(),
      {
        rescueEscrow: 3n * PRINCIPAL,
        storageReserves:
          caseStorage + 3n * jobStorage,
        nextJob: 3
      }
    );

    assert.deepEqual(
      (await contract.view(
        'get_rescue_case',
        {case_id: caseId}
      )).job_ids,
      [0, 1, 2]
    );

    console.log(
      'Three buyers funded one recovery market:',
      'PASS'
    );

    console.log(
      '=== THREE AUTHENTIC WORKER ACCEPTANCES ==='
    );

    await assert.rejects(
      () => outsider.call(
        contract,
        'accept_rescue_job',
        {job_id: jobs[0]}
      )
    );

    for (let index = 0; index < 3; index++) {
      await workers[index].call(
        contract,
        'accept_rescue_job',
        {job_id: jobs[index]}
      );

      assert.equal(
        (await contract.view(
          'get_rescue_job',
          {job_id: jobs[index]}
        )).phase,
        'Accepted'
      );
    }

    assert.equal(
      (await m3Totals()).rescueEscrow,
      3n * PRINCIPAL
    );

    console.log(
      'Designated workers accepted independently:',
      'PASS'
    );

    console.log(
      '=== BUYER-CONTROLLED CAP REVOCATION ==='
    );

    await buyers[0].call(
      contract,
      'revoke_open_rescue_mandate',
      {job_id: jobs[0]}
    );

    assert.equal(await claim(buyers[0]), CAP);
    assert.equal(await claim(buyers[1]), 0n);
    assert.equal(await claim(buyers[2]), 0n);
    assert.equal(
      (await m3Totals()).rescueEscrow,
      3n * PRINCIPAL - CAP
    );

    assert.equal(
      (await contract.view(
        'get_rescue_mandate',
        {job_id: jobs[0]}
      )).release_reason,
      'Revoked'
    );

    console.log(
      'Manual cap release conserved value:',
      'PASS'
    );

    console.log(
      '=== PERMISSIONLESS AWARD EXPIRY ==='
    );

    await fastForwardPast(
      worker,
      awardClose,
      'Award close'
    );

    for (const index of [1, 2]) {
      await keeper.call(
        contract,
        'release_expired_rescue_mandate',
        {job_id: jobs[index]}
      );

      const mandate = await contract.view(
        'get_rescue_mandate',
        {job_id: jobs[index]}
      );

      assert.equal(mandate.phase, 'Released');
      assert.equal(
        mandate.release_reason,
        'AwardExpired'
      );
    }

    assert.equal(await claim(buyers[0]), CAP);
    assert.equal(await claim(buyers[1]), CAP);
    assert.equal(await claim(buyers[2]), CAP);
    assert.equal(
      (await m3Totals()).rescueEscrow,
      3n * REWARD
    );

    console.log(
      'Keeper released two abandoned caps:',
      'PASS'
    );

    console.log(
      '=== PERMISSIONLESS FINAL JOB EXPIRY ==='
    );

    await fastForwardPast(
      worker,
      finalDeadline,
      'Final job deadline'
    );

    for (const jobId of jobs) {
      await keeper.call(
        contract,
        'expire_rescue_job',
        {job_id: jobId}
      );

      const job = await contract.view(
        'get_rescue_job',
        {job_id: jobId}
      );

      assert.equal(job.phase, 'Expired');
      assert.equal(
        BigInt(job.held_worker_reward),
        0n
      );
    }

    assert.equal(await claim(buyers[0]), PRINCIPAL);
    assert.equal(await claim(buyers[1]), PRINCIPAL);
    assert.equal(await claim(buyers[2]), PRINCIPAL);

    assert.deepEqual(
      await m3Totals(),
      {
        rescueEscrow: 0n,
        storageReserves:
          caseStorage + 3n * jobStorage,
        nextJob: 3
      }
    );

    assert.deepEqual(
      await payoutTotals(),
      [3n * PRINCIPAL, 0n]
    );

    console.log(
      'All worker rewards returned at deadline:',
      'PASS'
    );

    console.log(
      '=== REPLAY PROTECTION ==='
    );

    await assert.rejects(
      () => keeper.call(
        contract,
        'expire_rescue_job',
        {job_id: jobs[0]}
      )
    );

    await assert.rejects(
      () => keeper.call(
        contract,
        'release_expired_rescue_mandate',
        {job_id: jobs[1]}
      )
    );

    assert.equal(await claim(buyers[0]), PRINCIPAL);
    assert.equal(await claim(buyers[1]), PRINCIPAL);
    assert.equal(await claim(buyers[2]), PRINCIPAL);
    assert.equal(
      (await m3Totals()).rescueEscrow,
      0n
    );

    console.log(
      'Repeated terminal transitions rejected:',
      'PASS'
    );

    console.log(
      '=== NATIVE M3-GENERATED WITHDRAWAL ==='
    );

    const balanceBefore = await accountBalance(
      worker,
      buyers[0].accountId
    );

    await buyers[0].call(
      contract,
      'withdraw',
      {amount: WITHDRAWAL.toString()},
      {gas: '200000000000000'}
    );

    const balanceAfter = await accountBalance(
      worker,
      buyers[0].accountId
    );

    const observed = balanceAfter - balanceBefore;
    const difference = observed - WITHDRAWAL;

    console.log(
      'Requested native payout:',
      WITHDRAWAL.toString()
    );
    console.log(
      'Observed account balance change:',
      observed.toString()
    );
    console.log(
      'Gas/refund difference:',
      difference.toString()
    );

    assert(
      difference >= -GAS_MARGIN &&
      difference <= GAS_MARGIN,
      'Native balance change exceeds tolerance'
    );

    assert.equal(
      await claim(buyers[0]),
      PRINCIPAL - WITHDRAWAL
    );
    assert.equal(
      await claim(buyers[1]),
      PRINCIPAL
    );
    assert.equal(
      await claim(buyers[2]),
      PRINCIPAL
    );

    assert.equal(
      await contract.view(
        'get_pending_withdrawal',
        {withdrawal_id: 0}
      ),
      null
    );

    assert.deepEqual(
      await payoutTotals(),
      [3n * PRINCIPAL - WITHDRAWAL, 0n]
    );

    const finalTotals = await m3Totals();
    const finalClaimable = BigInt(
      await contract.view('claimable_total', {})
    );

    assert.equal(
      WITHDRAWAL +
        finalClaimable +
        finalTotals.rescueEscrow,
      3n * PRINCIPAL,
      'M3 economic conservation failed'
    );

    assert.equal(
      finalTotals.storageReserves,
      caseStorage + 3n * jobStorage
    );

    console.log(
      'Native payout and callback:',
      'PASS'
    );
    console.log(
      'M3 principal conservation:',
      'PASS'
    );
    console.log(
      '=== SANDBOX/M3-R2 RESULT: PASS ==='
    );

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error(
    '=== SANDBOX/M3-R2 RESULT: FAIL ==='
  );
  console.error(error);
  process.exitCode = 1;
});
'''

worklog = r'''# M3-R2-04 — multi-party NEAR Sandbox reproduction

**Status:** scaffolded
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `3bfb9cb`

## Purpose

Move the completed native Rust R2 liability lifecycle onto an actual local
NEAR runtime with independent accounts and real receipts.

The scenario uses:

- one canonical rescue case;
- three independent buyers;
- three independent designated workers;
- one permissionless keeper;
- one outsider used for authorization rejection;
- exact attached deposits;
- one buyer-controlled mandate release;
- two permissionless mandate expiries;
- three permissionless worker-job expiries;
- one native withdrawal sourced entirely from M3 claimables.

## Economic scenario

Each buyer deposits:

- worker reward: 0.025 NEAR;
- rescue cap: 0.005 NEAR;
- separately quoted job storage.

Total M3 economic principal:

`3 × (0.025 + 0.005) = 0.09 NEAR`

Expected terminal identity:

`native payout + remaining claimables + rescue_escrow = 0.09 NEAR`

Storage reserves remain outside this economic identity.

## Required evidence

- real compatible WASM build;
- local deployment succeeds;
- case and job storage quotes are read from the contract;
- underpayment is rejected before IDs or liability change;
- three funded jobs persist under one case;
- three different workers accept;
- outsider acceptance is rejected;
- manual cap revocation returns value only to its buyer;
- keeper-triggered expiry cannot redirect value;
- terminal replays are rejected;
- `rescue_escrow` reaches zero exactly;
- storage reserves remain separately accounted;
- M3-generated claimable balance produces a native transfer and callback;
- aggregate economic value is conserved.

## Files

- `package.json`
- `sandbox/m3_rescue_lifecycle.cjs`
- `scripts/m3/m3_r2_04_sandbox.py`
- `docs/worklog/M3-R2-04-sandbox.md`

## Next single action

Build the compatible WASM and run `npm run sandbox:m3-r2`. Do not commit until
the exact Sandbox output and final ledger identity are recorded.
'''

write(
    "package.json",
    json.dumps(package, indent=2) + "\n",
)
write("sandbox/m3_rescue_lifecycle.cjs", sandbox)
write("docs/worklog/M3-R2-04-sandbox.md", worklog)

print("M3-R2-04 SCAFFOLD PASS")
for name in (
    "package.json",
    "sandbox/m3_rescue_lifecycle.cjs",
    "docs/worklog/M3-R2-04-sandbox.md",
    "scripts/m3/m3_r2_04_sandbox.py",
):
    print(name)
