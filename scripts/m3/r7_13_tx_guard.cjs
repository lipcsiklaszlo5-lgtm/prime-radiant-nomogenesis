'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const near = require('near-api-js');
const {baseEncode} = require('@near-js/utils');

const GAS = 200000000000000n;

function privateDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {mode: 0o700});
  }

  const stat = fs.lstatSync(dir);
  assert(stat.isDirectory() && !stat.isSymbolicLink());
  assert.equal(stat.uid, process.getuid());
  assert.equal(stat.mode & 0o077, 0);
}

function writeExclusive(filename, value) {
  const fd = fs.openSync(filename, 'wx', 0o600);

  try {
    fs.writeFileSync(
      fd, JSON.stringify(value, null, 2) + '\n'
    );
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function atomicReplace(filename, value) {
  const tmp = filename + '.' +
    crypto.randomBytes(8).toString('hex') + '.tmp';

  writeExclusive(tmp, value);
  fs.renameSync(tmp, filename);
}

function readSecure(filename) {
  const stat = fs.lstatSync(filename);

  assert(stat.isFile() && !stat.isSymbolicLink());
  assert.equal(stat.uid, process.getuid());
  assert.equal(stat.mode & 0o077, 0);

  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function journalPath(dir, role, step) {
  assert.match(role, /^[a-z0-9-]{2,48}$/);
  assert.match(step, /^[a-z0-9_-]{2,64}$/);

  return path.join(dir, `${role}__${step}.json`);
}

function readStep(dir, role, step) {
  const filename = journalPath(dir, role, step);
  return fs.existsSync(filename)
    ? readSecure(filename)
    : null;
}

async function callOnce({
  dir, role, step, account,
  contractId, method, args,
  deposit = 0n
}) {
  privateDir(dir);

  const filename = journalPath(dir, role, step);

  assert.equal(
    fs.existsSync(filename),
    false,
    'Transaction step already prepared or executed: ' +
      role + '/' + step
  );

  assert(account && typeof account.functionCall === 'function');
  assert.equal(typeof account.accountId, 'string');
  assert.match(contractId, /^[a-z0-9._-]+$/);
  assert.match(method, /^[a-z][a-z0-9_]+$/);

  const attached = BigInt(deposit);
  assert(attached >= 0n);

  const payload = JSON.stringify(args);
  assert.equal(typeof payload, 'string');

  const record = {
    schema: 'nomogenesis.r7-13.signed-step.v1',
    role,
    step,
    signer: account.accountId,
    receiver: contractId,
    method,
    args_sha256: crypto.createHash('sha256')
      .update(payload).digest('hex'),
    attached_deposit: attached.toString(),
    state: 'prepared',
    tx: null
  };

  // Durable BEFORE the application invokes near-api-js.
  // Any failure after this point is uncertain and must
  // be reconciled, never automatically resubmitted.
  writeExclusive(filename, record);

  const outcome = await account.functionCall({
    contractId,
    methodName: method,
    args,
    gas: GAS,
    attachedDeposit: attached
  });

  assert.equal(
    outcome.transaction?.signer_id,
    account.accountId
  );
  assert.equal(
    outcome.transaction?.receiver_id,
    contractId
  );

  assert(
    outcome.status &&
    (
      Object.hasOwn(outcome.status, 'SuccessValue') ||
      Object.hasOwn(outcome.status, 'SuccessReceiptId')
    ),
    'No successful transaction status'
  );

  assert(
    !(outcome.receipts_outcome || []).some(
      row => Object.hasOwn(
        row.outcome?.status || {}, 'Failure'
      )
    ),
    'Failed execution receipt'
  );

  record.tx = outcome.transaction.hash;
  record.state = 'confirmed';

  atomicReplace(filename, record);

  const raw = outcome.status.SuccessValue;
  const decoded = typeof raw === 'string'
    ? Buffer.from(raw, 'base64').toString('utf8')
    : '';

  return {
    tx: record.tx,
    value: decoded ? JSON.parse(decoded) : null
  };
}


// Exactly one signed transaction hash per economic step.
// Unlike Account.functionCall(), this path does not invoke
// the SDK's signAndSendTransaction nonce retry loop.

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

// This is the ONLY real network path used by
// callSignedOnce. It must pass through the local
// shared RPC broker used by the ten-agent runner.
async function loopbackRpc(method, params) {
  const endpoint = process.env.NMG_R7_13H_RPC_URL;

  assert.match(
    endpoint || '',
    /^http:\/\/127\.0\.0\.1:\d+\/$/,
    'Signed agent traffic requires the loopback broker'
  );

  const id = 'nmg-r713-' +
    crypto.randomBytes(8).toString('hex');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    }),
    signal: AbortSignal.timeout(method === 'send_tx' ? 25000 : 16000)
  });

  let body;

  try {
    body = await response.json();
  } catch {
    throw Error(
      'RPC_NON_JSON HTTP=' + response.status
    );
  }

  if (!response.ok || body?.error) {
    throw Error(
      'RPC_ERROR HTTP=' + response.status +
      ' ' + JSON.stringify(
        body?.error ?? body
      ).slice(0, 350)
    );
  }

  assert.equal(body.jsonrpc, '2.0');
  assert.equal(body.id, id);
  assert(
    Object.hasOwn(body, 'result'),
    'RPC response missing result'
  );

  return body.result;
}

// Exactly one signed transaction hash per step.
// No Account.functionCall, SDK broadcast retries,
// automatic re-signing or write failover.
async function callSignedOnce({
  dir, role, step, account,
  contractId, method, args,
  deposit = 0n,
  rpcExchange
}) {
  privateDir(dir);

  const filename = journalPath(dir, role, step);

  assert(
    !fs.existsSync(filename),
    'Transaction step already prepared or executed: ' +
      role + '/' + step
  );

  assert.equal(typeof account?.signTransaction, 'function');
  assert.equal(typeof account.accountId, 'string');

  assert.match(contractId, /^[a-z0-9._-]+$/);
  assert.match(method, /^[a-z][a-z0-9_]+$/);

  const attached = BigInt(deposit);
  assert(attached >= 0n);

  const payload = JSON.stringify(args);
  assert.equal(typeof payload, 'string');

  // rpcExchange is an injection point for offline
  // unit tests; production agents provide none.
  if (rpcExchange !== undefined) {
    assert.equal(typeof rpcExchange, 'function');
  } else {
    assert.match(
      process.env.NMG_R7_13H_RPC_URL || '',
      /^http:\/\/127\.0\.0\.1:\d+\/$/,
      'Production sends require the shared loopback broker'
    );
  }

  const exchange = rpcExchange ?? loopbackRpc;

  const record = {
    schema: 'nomogenesis.r7-13.single-signed-step.v1',
    role,
    step,
    signer: account.accountId,
    receiver: contractId,
    method,
    args_sha256: crypto.createHash('sha256')
      .update(payload).digest('hex'),
    attached_deposit: attached.toString(),
    state: 'prepared',
    tx: null
  };

  // Crash-safe one-time reservation before signing.
  writeExclusive(filename, record);

  const action = near.transactions.functionCall(
    method, args, GAS, attached
  );

  account.accessKeyByPublicKeyCache = {};

  const [rawHash, signedTx] =
    await account.signTransaction(
      contractId, [action]
    );

  const hash = Buffer.from(rawHash);

  assert.equal(hash.length, 32);

  assert.equal(
    typeof signedTx?.encode,
    'function'
  );

  assert.equal(
    typeof signedTx.transaction?.encode,
    'function'
  );

  // Prove the journaled hash matches the exact
  // signed transaction's serialized contents.
  const digest = crypto.createHash('sha256')
    .update(
      Buffer.from(signedTx.transaction.encode())
    )
    .digest();

  assert(digest.equals(hash), 'Signed transaction hash mismatch');

  const encoded = Buffer.from(
    signedTx.encode()
  ).toString('base64');

  assert(encoded.length > 100);

  record.tx = baseEncode(hash);
  record.state = 'signed_not_confirmed';

  // Durable BEFORE the only network submission.
  atomicReplace(filename, record);

  // NONE returns before validation. Wait for inclusion so invalid signatures,
  // nonces and reference blocks are observable instead of looking like a
  // successful broadcast followed by an endless finality timeout.
  let submissionError = null;
  try {
    await exchange('send_tx', {
      signed_tx_base64: encoded,
      wait_until: 'INCLUDED'
    });
  } catch (error) {
    submissionError = error;
    record.submission_error = String(error.message).slice(0, 2000);
    atomicReplace(filename, record);
    if (/INVALID_TRANSACTION/.test(record.submission_error)) {
      record.state = 'rejected';
      atomicReplace(filename, record);
      throw error;
    }
    // A transport timeout can follow a successful submission. Reconcile this
    // exact hash below without signing or sending another transaction.
  }

  // Only read RPCs may be retried.
  const deadline = Date.now() + 90000;
  let outcome = null;
  let lastReadError = null;

  while (Date.now() < deadline) {
    try {
      const candidate = await exchange(method === 'withdraw'
        ? 'EXPERIMENTAL_tx_status' : 'tx', {
        tx_hash: record.tx,
        sender_account_id: account.accountId,
        // Nonblocking reads avoid occupying the finality lane for a hash that
        // was never included. FINAL is still required in the returned status.
        wait_until: 'NONE'
      });

      if (candidate?.final_execution_status === 'FINAL') {
        outcome = candidate;
        break;
      }

    } catch (error) {
      lastReadError = error;
    }

    await sleep(1100);
  }

  if (!outcome) {
    throw Error(
      'FINALITY_UNCERTAIN HASH=' + record.tx +
      ' SUBMISSION=' + (submissionError?.message || 'accepted').slice(0, 400) +
      ' LAST_READ=' +
      (lastReadError?.message || 'no final status')
        .slice(0, 180)
    );
  }

  assert.equal(outcome.transaction?.hash, record.tx);
  assert.equal(
    outcome.transaction?.signer_id,
    account.accountId
  );
  assert.equal(
    outcome.transaction?.receiver_id,
    contractId
  );

  record.outcome = outcome;
  if (Object.hasOwn(outcome.status || {}, 'Failure') ||
      (outcome.receipts_outcome || []).some(row =>
        Object.hasOwn(row.outcome?.status || {}, 'Failure'))) {
    record.state = 'failed';
    atomicReplace(filename, record);
  }
  assert(
    !Object.hasOwn(outcome.status || {}, 'Failure'),
    'Final transaction execution failed'
  );

  assert(
    Object.hasOwn(outcome.status || {}, 'SuccessValue') ||
    Object.hasOwn(outcome.status || {}, 'SuccessReceiptId'),
    'Final transaction has no successful status'
  );

  assert(
    !(outcome.receipts_outcome || []).some(row =>
      Object.hasOwn(
        row.outcome?.status || {}, 'Failure'
      )
    ),
    'Failed execution receipt'
  );

  const raw = outcome.status.SuccessValue;

  const decoded = typeof raw === 'string'
    ? Buffer.from(raw, 'base64').toString('utf8')
    : '';

  const value = decoded ? JSON.parse(decoded) : null;

  record.state = 'confirmed';
  record.outcome = outcome;
  atomicReplace(filename, record);

  return {tx: record.tx, value, outcome};
}

module.exports = {
  privateDir,
  readStep,
  callOnce,
  callSignedOnce
};
