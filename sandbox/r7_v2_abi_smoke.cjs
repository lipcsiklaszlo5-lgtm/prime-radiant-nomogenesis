'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const {Worker} = require('near-workspaces');

const wasm = process.env.NOMOGENESIS_V2_WASM;

async function main() {
  assert(wasm && fs.statSync(wasm).size > 0);

  let worker;

  try {
    worker = await Worker.init();

    const root = worker.rootAccount;
    const contract = await root.devDeploy(wasm);

    console.log('=== V2 STORAGE QUOTE ===');

    const bond = BigInt(
      await contract.view(
        'quote_r7_v2_consent_storage', {}
      )
    );

    assert(bond > 0n);
    console.log('V2 STORAGE QUOTE:', bond.toString());

    console.log('=== ORIGINAL M3 ABI ===');

    const m3 = await contract.view(
      'm3_storage_quote', {}
    );

    assert(BigInt(m3.case_storage_cost) > 0n);
    assert(BigInt(m3.job_storage_cost) > 0n);
    assert(BigInt(m3.offer_storage_cost) > 0n);

    console.log('M3 STORAGE ABI: PASS');

    console.log('=== V2 NONCE QUERY ===');

    assert.equal(
      await contract.view('is_r7_v2_nonce_used', {
        buyer: root.accountId,
        nonce: 123
      }),
      false
    );

    console.log('V2 NONCE ABI: PASS');

    console.log('=== LEGACY AWARD MUST PANIC ===');

    await assert.rejects(
      () => root.call(
        contract,
        'award_rescue_bundle',
        {case_id: []},
        {gas: '100000000000000'}
      ),
      error => {
        assert.match(
          String(error),
          /R7 V2: legacy award disabled/
        );
        return true;
      }
    );

    console.log('LEGACY BYPASS DISABLED: PASS');

    console.log('=== VERIFY NO ECONOMIC MUTATION ===');

    assert.equal(
      BigInt(await contract.view(
        'rescue_escrow_total', {}
      )),
      0n
    );

    assert.equal(
      BigInt(await contract.view(
        'claimable_total', {}
      )),
      0n
    );

    assert.equal(
      await contract.view(
        'next_rescue_bundle_id', {}
      ),
      0
    );

    console.log('INITIAL ECONOMIC LEDGER: PASS');
    console.log('=== R7-06E/03B-05A SANDBOX: PASS ===');

    console.log(
      'LIMIT: no funded buyer transaction yet'
    );
    console.log(
      'LIMIT: no atomic subset award transaction yet'
    );

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error('=== R7-06E/03B-05A: FAIL ===');
  console.error(error.stack || error);
  process.exitCode = 1;
});
