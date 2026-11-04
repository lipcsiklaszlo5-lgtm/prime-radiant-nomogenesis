const assert = require('node:assert/strict');
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
