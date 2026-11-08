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
async function callSignedOnce({
  dir, role, step, account,
  contractId, method, args,
  deposit = 0n
}) {
  privateDir(dir);

  const filename = journalPath(dir, role, step);

  assert(!fs.existsSync(filename),
    'Transaction step already prepared or executed: ' +
    role + '/' + step);

  assert.equal(typeof account.signTransaction, 'function');
  assert.equal(
    typeof account.connection?.provider?.sendTransaction,
    'function'
  );

  assert.equal(typeof account.accountId, 'string');
  assert.match(contractId, /^[a-z0-9._-]+$/);
  assert.match(method, /^[a-z][a-z0-9_]+$/);

  const attached = BigInt(deposit);
  assert(attached >= 0n);

  const payload = JSON.stringify(args);

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

  // Durable marker before even signing.
  writeExclusive(filename, record);

  const action = near.transactions.functionCall(
    method,
    args,
    GAS,
    attached
  );

  // The v5 SDK caches access-key nonce state.
  // Force the next signature to read fresh chain state.
  account.accessKeyByPublicKeyCache = {};

  const [hash, signedTx] =
    await account.signTransaction(
      contractId, [action]
    );

  assert.equal(Buffer.from(hash).length, 32);

  record.tx = baseEncode(hash);
  record.state = 'signed_not_confirmed';

  // Persist the exact hash BEFORE broadcasting.
  atomicReplace(filename, record);

  // No SDK signAndSendTransaction retry loop.
  // Provider transport may retry the SAME signed bytes,
  // which keeps the same transaction hash.
  const outcome =
    await account.connection.provider.sendTransaction(
      signedTx
    );

  assert.equal(
    outcome.transaction?.hash,
    record.tx
  );
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
    'Transaction did not report successful execution'
  );

  assert(
    !(outcome.receipts_outcome || []).some(
      row => Object.hasOwn(
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
  atomicReplace(filename, record);

  return {
    tx: record.tx,
    value
  };
}

module.exports = {
  privateDir,
  readStep,
  callOnce,
  callSignedOnce
};
