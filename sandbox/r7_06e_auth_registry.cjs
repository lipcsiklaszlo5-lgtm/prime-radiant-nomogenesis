'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const {Worker} = require('near-workspaces');

const SECOND = 1000000000n;
const DOMAIN = 'NOMOGENESIS/R7-06E/SUBSET/V1';
const WASM = process.env.NOMOGENESIS_V2_WASM;

async function rpc(worker, method, params) {
  const url = worker.config?.rpcAddr;

  assert.match(
    url || '',
    /^http:\/\/127\.0\.0\.1:\d+$/
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

  assert.equal(response.ok, true);

  const data = await response.json();

  if (data.error) {
    throw Error(JSON.stringify(data.error));
  }

  return data.result;
}

async function timestamp(worker) {
  const result = await rpc(
    worker,
    'block',
    {finality: 'optimistic'}
  );

  return BigInt(
    result.header.timestamp_nanosec ??
    result.header.timestamp
  );
}

async function storageBytes(worker, accountId) {
  const result = await rpc(worker, 'query', {
    request_type: 'view_account',
    account_id: accountId,
    finality: 'optimistic'
  });

  return BigInt(result.storage_usage);
}

async function main() {
  assert(WASM && fs.statSync(WASM).size > 0);

  let worker;

  try {
    worker = await Worker.init();

    const root = worker.rootAccount;
    const contract = await root.devDeploy(WASM);

    const alice = await root.createSubAccount('r7alice');
    const bob = await root.createSubAccount('r7bob');
    const outsider = await root.createSubAccount('r7outsider');

    const now = await timestamp(worker);
    const bidClose = Number(now - 60n * SECOND);
    const awardClose = Number(now + 3600n * SECOND);
    const caseId = Array(32).fill(7);

    console.log('=== INITIALIZE ON-CHAIN STATE ===');

    await root.call(contract, 'new', {
      case_id: caseId,
      bid_close: bidClose,
      award_close: awardClose
    });

    const bond = BigInt(
      await contract.view('quote_consent_storage', {})
    );

    assert(bond > 0n);

    const initialBytes = await storageBytes(
      worker,
      contract.accountId
    );

    const input = (buyer, jobId, nonce) => ({
      input: {
        case_id: caseId,
        contract: contract.accountId,
        domain: DOMAIN,
        job_id: jobId,
        buyer: buyer.accountId,
        nonce,
        plan_hash: Array(32).fill(9),
        max_payment: '7',
        exact_payment: '6',
        expires_at: awardClose
      }
    });

    const register = (buyer, jobId, nonce, deposit = bond) =>
      buyer.call(
        contract,
        'register_consent',
        input(buyer, jobId, nonce),
        {attachedDeposit: deposit.toString()}
      );

    const consent = job_id => contract.view(
      'get_consent',
      {job_id}
    );

    const nonceUsed = (buyer, nonce) => contract.view(
      'is_nonce_used',
      {buyer: buyer.accountId, nonce}
    );

    const count = () => contract.view(
      'active_consent_count',
      {}
    );

    const snapshot = async () => ({
      bytes: (
        await storageBytes(worker, contract.accountId)
      ).toString(),
      count: await count(),
      job1: await consent(1),
      job2: await consent(2),
      nonce101: await nonceUsed(alice, 101),
      nonce102: await nonceUsed(bob, 102),
      nonce103: await nonceUsed(alice, 103),
      bonds: await contract.view(
        'retained_storage_bonds',
        {}
      )
    });

    console.log('=== FORGED CALLER MUST FAIL ===');

    const beforeForge = await snapshot();

    await assert.rejects(() =>
      outsider.call(
        contract,
        'register_consent',
        input(alice, 1, 101),
        {attachedDeposit: bond.toString()}
      )
    );

    assert.deepEqual(
      await snapshot(),
      beforeForge
    );

    console.log('FORGED CALLER ROLLBACK: PASS');

    console.log('=== INSUFFICIENT STORAGE FUNDING ===');

    await assert.rejects(() =>
      register(alice, 1, 101, bond - 1n)
    );

    assert.deepEqual(
      await snapshot(),
      beforeForge
    );

    console.log('UNDERFUNDED WRITE ROLLBACK: PASS');

    console.log('=== TWO SIGNED BUYER TRANSACTIONS ===');

    await register(alice, 1, 101);
    await register(bob, 2, 102);

    assert.equal(await count(), 2);
    assert.equal((await consent(1)).buyer, alice.accountId);
    assert.equal((await consent(2)).buyer, bob.accountId);
    assert.equal((await consent(1)).exact_payment, '6');

    assert.equal(await nonceUsed(alice, 101), true);
    assert.equal(await nonceUsed(bob, 102), true);

    console.log(
      'INDEPENDENT NEAR ACCOUNTS AND PERSISTENCE: PASS'
    );

    console.log('=== UNAUTHORIZED REVOCATION ===');

    const beforeRevokeAttack = await snapshot();

    await assert.rejects(() =>
      outsider.call(
        contract,
        'revoke_consent',
        {job_id: 1}
      )
    );

    assert.deepEqual(
      await snapshot(),
      beforeRevokeAttack
    );

    console.log(
      'UNAUTHORIZED REVOCATION ROLLBACK: PASS'
    );

    console.log('=== OWNER REVOCATION ===');

    await alice.call(
      contract,
      'revoke_consent',
      {job_id: 1}
    );

    assert.equal(await count(), 1);
    assert.equal(await consent(1), null);
    assert.equal(await nonceUsed(alice, 101), true);
    assert.equal((await consent(2)).buyer, bob.accountId);

    console.log('OWNER REVOCATION: PASS');

    console.log('=== CONSUMED NONCE REPLAY ===');

    const beforeReplay = await snapshot();

    await assert.rejects(() =>
      register(alice, 1, 101)
    );

    assert.deepEqual(
      await snapshot(),
      beforeReplay
    );

    console.log('NONCE REPLAY ROLLBACK: PASS');

    console.log('=== NEW NONCE REGISTRATION ===');

    await register(alice, 1, 103);

    assert.equal(await count(), 2);
    assert.equal((await consent(1)).nonce, 103);
    assert.equal(await nonceUsed(alice, 101), true);
    assert.equal(await nonceUsed(alice, 103), true);

    const retained = BigInt(
      await contract.view(
        'retained_storage_bonds',
        {}
      )
    );

    assert.equal(retained, 3n * bond);

    console.log('NEW NONCE AFTER REVOCATION: PASS');

    console.log('=== MEASURE ACTUAL STORAGE ===');

    const finalBytes = await storageBytes(
      worker,
      contract.accountId
    );

    assert(finalBytes >= initialBytes);

    // The contract reserves 4096 bytes per
    // successful registration.
    // Verify the storage growth against the
    // actual on-chain quotation.
    const byteCost = bond / 4096n;

    assert.equal(byteCost * 4096n, bond);

    const growth = finalBytes - initialBytes;

    assert(
      growth * byteCost <= retained,
      'Insufficient retained storage coverage'
    );

    console.log(
      'STORAGE GROWTH BYTES:',
      growth.toString()
    );

    console.log(
      'RETAINED STORAGE BONDS:',
      retained.toString()
    );

    console.log('MEASURED STORAGE COVER: PASS');

    console.log(
      '=== R7-06E/03A-02B SANDBOX: PASS ==='
    );

    console.log(
      'BOUNDARY: authorization registry only'
    );

    console.log(
      'BOUNDARY: no funded M3 job validation'
    );

    console.log(
      'BOUNDARY: no atomic coalition award'
    );

    console.log(
      'BOUNDARY: no storage refund implementation'
    );

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error(
    '=== R7-06E/03A-02B SANDBOX: FAIL ==='
  );

  console.error(error.stack || error);
  process.exitCode = 1;
});
