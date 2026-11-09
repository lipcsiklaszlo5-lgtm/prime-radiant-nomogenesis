'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const configPath = process.env.NMG_LOCAL_SANDBOX_CONFIG;
let local = null;
if (configPath) {
  local = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(local.network, 'sandbox');
  assert.match(local.rpcUrl, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.match(local.chainId, /^(test-chain-|sandbox$|localnet$)/);
  assert.notEqual(local.chainId, 'testnet');
  assert.notEqual(local.chainId, 'mainnet');
  assert.equal(process.env.NMG_R7_13H_RPC_URL, local.rpcUrl);
  assert(path.isAbsolute(local.keyRoot));
}

const runtime = {
  local,
  network: local ? 'sandbox' : 'testnet',
  chainId: local?.chainId || 'testnet',
  parent: local?.parent || 'nmg-r713-8d99c17cced1.testnet',
  contract: local?.contract || 'nmg-r7v2-0b9a0eff20.testnet',
  keyRoot: local?.keyRoot || path.join(os.homedir(), '.nomogenesis-r7-13')
};

function credential(role) {
  const file = role === 'bootstrap'
    ? path.join(runtime.keyRoot, 'bootstrap.json')
    : path.join(runtime.keyRoot, 'actors', role + '.json');
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink());
  assert.equal(stat.uid, process.getuid());
  assert.equal(stat.mode & 0o077, 0);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(value.network, runtime.network);
  assert.equal(value.account_id, role === 'bootstrap'
    ? runtime.parent : `${role}.${runtime.parent}`);
  if (role !== 'bootstrap') assert.equal(value.role, role);
  return value;
}

module.exports = {...runtime, credential};
