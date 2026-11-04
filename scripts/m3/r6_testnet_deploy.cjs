'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const near = require('near-api-js');

const ROOT = path.resolve(__dirname, '../..');

const CREDENTIALS =
  '/workspaces/.nomogenesis-r6/deployer.json';

const WASM = path.join(
  ROOT, 'target/nomogenesis_compatible.wasm'
);

const EXPECTED =
  'f6b470b22a3c8c8e94187510e4de7e6123bf61913a2a16ccb7945d2abf1429f7';

const ACCOUNT =
  'nomogenesis-70e59593a3.testnet';

const PRIMARY =
  'https://rpc.testnet.fastnear.com';

const SECONDARY =
  'https://near-testnet.drpc.org';

const YOCTO = 10n ** 24n;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function digest(bytes) {
  return crypto.createHash('sha256')
    .update(bytes)
    .digest('hex');
}

async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    })
  });

  assert(response.ok, `RPC HTTP ${response.status}`);

  const body = await response.json();

  if (body.error) {
    throw new Error(JSON.stringify(body.error));
  }

  return body.result;
}

async function query(url, request) {
  return rpc(url, 'query', {
    ...request,
    finality: 'final'
  });
}

async function verifyCode(url, wasm) {
  const result = await query(url, {
    request_type: 'view_code',
    account_id: ACCOUNT
  });

  const deployed = Buffer.from(
    result.code_base64, 'base64'
  );

  assert(
    deployed.equals(wasm),
    'deployed bytecode differs from local WASM'
  );

  assert.equal(
    digest(deployed),
    EXPECTED,
    'deployed SHA-256 mismatch'
  );

  console.log('RPC:', url);
  console.log('DEPLOYED_BYTES:', deployed.length);
  console.log('DEPLOYED_SHA256:', digest(deployed));
  console.log('ON_CHAIN_CODE_HASH:', result.hash);
  console.log('VERIFIED_BLOCK:', result.block_height);

  return result;
}

async function main() {
  console.log('=== VERIFY LOCAL IDENTITY ===');

  const credentialStat = fs.lstatSync(CREDENTIALS);

  assert(credentialStat.isFile());
  assert(!credentialStat.isSymbolicLink());
  assert.equal(
    credentialStat.mode & 0o077,
    0,
    'credential file has unsafe permissions'
  );

  const credentials = JSON.parse(
    fs.readFileSync(CREDENTIALS, 'utf8')
  );

  assert.equal(credentials.network_id, 'testnet');
  assert.equal(credentials.account_id, ACCOUNT);

  const keyPair = near.KeyPair.fromString(
    credentials.private_key
  );

  assert.equal(
    keyPair.getPublicKey().toString(),
    credentials.public_key
  );

  console.log('ACCOUNT:', ACCOUNT);
  console.log('PRIVATE_KEY: NOT EXPORTED');

  const wasm = fs.readFileSync(WASM);

  assert.equal(wasm.length, 539608);
  assert.equal(digest(wasm), EXPECTED);

  console.log('LOCAL_WASM_SHA256:', EXPECTED);

  const network = await rpc(PRIMARY, 'status', []);
  assert.equal(network.chain_id, 'testnet');

  const accountState = await query(PRIMARY, {
    request_type: 'view_account',
    account_id: ACCOUNT
  });

  const balance = BigInt(accountState.amount);

  console.log(
    'ACCOUNT_BALANCE:',
    (balance / YOCTO).toString(),
    'whole testNEAR'
  );

  console.log(
    'CURRENT_CODE_HASH:',
    accountState.code_hash
  );

  const EMPTY_HASH = '11111111111111111111111111111111';

  const alreadyDeployed =
    accountState.code_hash !== EMPTY_HASH;

  if (alreadyDeployed) {
    console.log('EXISTING CONTRACT DETECTED');
    console.log('REDEPLOYMENT: DISABLED');
  } else {
    assert(
      balance >= 7n * YOCTO,
      'insufficient deployment funding'
    );

    console.log('=== SIGN TESTNET DEPLOYMENT ===');

    const keyStore =
      new near.keyStores.InMemoryKeyStore();

    await keyStore.setKey(
      'testnet', ACCOUNT, keyPair
    );

    const connection = await near.connect({
      networkId: 'testnet',
      nodeUrl: PRIMARY,
      keyStore,
      deps: {keyStore}
    });

    const account = await connection.account(ACCOUNT);

    assert.equal(
      typeof account.deployContract,
      'function',
      'SDK deployContract unavailable'
    );

    // Exactly one deployment attempt. If RPC errors
    // after broadcast, inspect chain state before retry.
    const outcome = await account.deployContract(wasm);

    assert.equal(
      outcome.transaction.signer_id,
      ACCOUNT
    );

    assert(
      outcome.status &&
      (
        Object.hasOwn(outcome.status, 'SuccessValue') ||
        Object.hasOwn(outcome.status, 'SuccessReceiptId')
      ),
      'deployment transaction failed'
    );

    console.log(
      'DEPLOYMENT_TX:',
      outcome.transaction.hash
    );

    console.log('DEPLOYMENT_RECEIPT: SUCCESS');
  }

  console.log('=== INDEPENDENT CODE VERIFICATION ===');

  for (const url of [PRIMARY, SECONDARY]) {
    let success = false;
    let lastError;

    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        await verifyCode(url, wasm);
        success = true;
        break;
      } catch (error) {
        lastError = error;

        // Never accept a different deployed contract.
        if (
          /differs|mismatch/.test(error.message)
        ) {
          throw error;
        }

        await sleep(2000);
      }
    }

    if (!success) {
      throw lastError;
    }
  }

  console.log('TWO RPC BYTECODE VERIFICATIONS: PASS');

  console.log('=== CONTRACT METHOD VERIFICATION ===');

  const view = await query(PRIMARY, {
    request_type: 'call_function',
    account_id: ACCOUNT,
    method_name: 'm3_storage_quote',
    args_base64: Buffer.from('{}').toString('base64')
  });

  const quote = JSON.parse(
    Buffer.from(view.result).toString('utf8')
  );

  assert(BigInt(quote.case_storage_cost) > 0n);
  assert(BigInt(quote.job_storage_cost) > 0n);
  assert(BigInt(quote.offer_storage_cost) > 0n);

  console.log('M3_STORAGE_QUOTE: PASS');
  console.log('TESTNET_ACCOUNT:', ACCOUNT);
  console.log('TESTNET_WASM_SHA256:', EXPECTED);

  console.log('=== M3-R6-03 RESULT: PASS ===');
}

main().catch(error => {
  console.error('=== M3-R6-03 RESULT: FAIL ===');
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
