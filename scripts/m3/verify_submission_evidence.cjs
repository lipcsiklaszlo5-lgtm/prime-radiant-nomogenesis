'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,
  '../../docs/evidence/technical-closure-testnet-2026-11-12');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const evidence = read('evidence.json');
const audit = read('sdk-audit.json');
const run = read('run.json');
const expectedCase = '5b8530acbd28c3e39a90259e41e50c19fc1792798ab9522249fb0b9d7ac6f815';
const expectedContract = 'nmg-r7v2-0b9a0eff20.testnet';
const caseHex = value => Array.isArray(value)
  ? Buffer.from(value).toString('hex') : String(value);

assert.equal(evidence.network, 'testnet');
assert.equal(caseHex(evidence.case_id), expectedCase);
assert.equal(caseHex(run.case_id), expectedCase);
assert.equal(evidence.contract, expectedContract);
assert.equal(audit.contract_id, expectedContract);
assert.equal(audit.network, 'testnet');
assert.equal(audit.passed, true);
assert.equal(audit.code_hash, '3dz93Y6r2ZxupsYrJokcD6PqubygQA9XYV5qbzCpd7AD');
for (const field of ['code_hash_verified', 'network_verified',
  'case_phase_verified', 'merkle_proofs_verified', 'jobs_completed',
  'result_verified', 'financial_expectations_verified',
  'rescue_escrow_verified']) {
  assert.equal(audit[field], true, field);
}
assert.equal(audit.case_phase, 'Closed');
assert.equal(String(audit.reconstructed_result), '632');
assert.equal(String(audit.global_rescue_escrow_yocto), '0');
assert.equal(String(audit.global_pending_yocto), '0');
assert.equal(evidence.transactions.length, 19);

const seen = new Set();
for (const row of evidence.transactions) {
  assert.match(row.role, /^[a-z0-9-]+$/);
  assert.match(row.step, /^[a-z0-9_]+$/);
  assert.match(row.tx, /^[1-9A-HJ-NP-Za-km-z]{40,50}$/);
  assert(!seen.has(row.tx), 'Duplicate transaction hash');
  seen.add(row.tx);
  const record = read(`${row.role}__${row.step}.json`);
  assert.equal(record.state, 'confirmed');
  assert.equal(record.tx, row.tx);
  assert.equal(record.outcome.final_execution_status, 'FINAL');
}

console.log('PUBLIC_EVIDENCE_OFFLINE: PASS 19/19');
console.log('Note: recorded receipts are checked here; independent RPC verification is separate.');
