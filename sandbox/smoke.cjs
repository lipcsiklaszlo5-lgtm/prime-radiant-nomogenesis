const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const wasm = process.env.NOMOGENESIS_WASM;

const rootHash =
  '37931d88e0728e9809cc9a71af1494e90174f8ecee166627eb22eac5b40c9314';

const siblings = [
  'dc5fe2eda0ba5ac4f85d2c3d30c93cef8994276ede3f4008ce395526fb9e2f35',
  '4f1acd1519355baa8c1519e131833af25e0a24c178f8791c79e9d9f34f91cdb3'
];

const bytes = hex => Array.from(Buffer.from(hex, 'hex'));

async function main() {
  let worker;
  try {
    console.log('=== START LOCAL NEAR SANDBOX ===');
    worker = await Worker.init();
    const root = worker.rootAccount;

    console.log('=== DEPLOY REAL WASM ===');
    const contract = await root.devDeploy(wasm);
    console.log('Contract:', contract.accountId);

    const buyer = await root.createSubAccount('buyer');
    const primary = await root.createSubAccount('primary');
    const reserve = await root.createSubAccount('reserve');
    const keeper = await root.createSubAccount('keeper');

    console.log('=== CREATE TASK TRANSACTION ===');

    const now = Date.now();
    const primary_deadline =
      Math.floor((now + 600000) * 1000000);
    const reserve_deadline =
      Math.floor((now + 1200000) * 1000000);

    const taskId = await buyer.call(
      contract,
      'create_task',
      {
        primary: primary.accountId,
        root: bytes(rootHash),
        height: 2,
        index: 2,
        primary_deadline,
        reserve_deadline
      }
    );

    assert.equal(Number(taskId), 0);

    let task = await contract.view('get_task', {
      task_id: 0
    });

    assert.equal(task.phase, 'SeekingPrimary');
    assert.equal(task.buyer, buyer.accountId);

    console.log('Task creation: PASS');

    console.log('=== PRIMARY ACCEPTANCE ===');

    await primary.call(contract, 'accept_primary', {
      task_id: 0
    });

    task = await contract.view('get_task', {
      task_id: 0
    });
    assert.equal(task.phase, 'SeekingReserve');

    console.log('Primary acceptance: PASS');

    console.log('=== RESERVE OFFER AND SLOT LOCK ===');

    const offerId = await reserve.call(
      contract,
      'post_offer',
      {
        task_id: 0,
        slot_id: 'sandbox_slot',
        expires_at: primary_deadline - 60000000000
      }
    );

    assert.equal(Number(offerId), 0);

    await buyer.call(contract, 'select_offer', {
      task_id: 0,
      offer_id: 0
    });

    task = await contract.view('get_task', {
      task_id: 0
    });

    assert.equal(task.phase, 'OfferSelected');

    let holder = await contract.view('slot_holder', {
      reserve: reserve.accountId,
      slot_id: 'sandbox_slot'
    });

    assert.equal(Number(holder), 0);

    console.log('Exclusive slot reservation: PASS');

    console.log('=== REJECT PREMATURE BACKUP ===');

    await assert.rejects(
      () => keeper.call(contract, 'trigger_backup', {
        task_id: 0
      })
    );

    task = await contract.view('get_task', {
      task_id: 0
    });

    assert.equal(task.phase, 'OfferSelected');

    console.log('Premature backup rejected: PASS');

    console.log('=== PRIMARY MERKLE PROOF ===');

    await primary.call(
      contract,
      'submit_primary_proof',
      {
        task_id: 0,
        payload: Array.from(Buffer.from('charlie')),
        siblings: siblings.map(bytes)
      }
    );

    task = await contract.view('get_task', {
      task_id: 0
    });

    const offer = await contract.view('get_offer', {
      offer_id: 0
    });

    holder = await contract.view('slot_holder', {
      reserve: reserve.accountId,
      slot_id: 'sandbox_slot'
    });

    assert.equal(task.phase, 'PrimaryProofAccepted');
    assert.equal(offer.status, 'Released');
    assert.equal(holder, null);

    console.log('Valid primary proof: PASS');
    console.log('On-chain state persistence: PASS');
    console.log('Capacity release: PASS');

    console.log('=== SANDBOX/01 RESULT: PASS ===');
  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(err => {
  console.error('=== SANDBOX/01 RESULT: FAIL ===');
  console.error(err);
  process.exitCode = 1;
});
