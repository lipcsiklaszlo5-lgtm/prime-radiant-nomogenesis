'use strict';

// Runs the existing coordinator and agents unchanged across the local NEAR
// Sandbox and public Testnet. Signing keys stay in the existing actor files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {createRpcBroker} = require('./r7_13h_rpc_broker.cjs');
const {ROSTER} = require('./r7_06_swarm.cjs');

const ROOT = path.resolve(__dirname, '../..');
const SHA = '2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e';
const UNIT = 10n ** 21n;
const roles = [...ROSTER, 'worker0', 'worker1', 'keeper'];
const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert(['--check', '--live', '--sandbox'].includes(mode));
const local = mode === '--sandbox';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function rpc(url, method, params) {
  const response = await fetch(url, {method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 'closure', method, params}),
    signal: AbortSignal.timeout(20000)});
  assert(response.ok, 'RPC HTTP ' + response.status);
  const body = await response.json();
  assert(!body.error, JSON.stringify(body.error));
  return body.result;
}

async function view(url, contract, method, args = {}) {
  const value = await rpc(url, 'query', {request_type: 'call_function',
    account_id: contract, method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    finality: 'final'});
  return JSON.parse(Buffer.from(value.result).toString());
}

function save(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag: 'wx', mode: 0o600});
}

async function run(program, args, env, onOutput = () => {}) {
  const child = spawn(program, args, {cwd: ROOT, env,
    detached: true, stdio: ['ignore', 'pipe', 'pipe']});
  for (const [source, dest] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    source.on('data', bytes => {dest.write(bytes); onOutput(bytes.toString());});
  }
  const stop = () => {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  const timer = setTimeout(stop, local ? 240000 : 35 * 60 * 1000);
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => code === 0 ? resolve() :
        reject(Error('Child stopped: ' + code + '/' + signal)));
    });
  } finally {
    clearTimeout(timer);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

async function main() {
  let worker, broker;
  let keyRoot = path.join(os.homedir(), '.nomogenesis-r7-13');
  let parent = 'nmg-r713-8d99c17cced1.testnet';
  let contract = 'nmg-r7v2-0b9a0eff20.testnet';
  let network = 'testnet';
  let chainId = 'testnet';
  let upstream = 'https://rpc.testnet.fastnear.com';
  let manifest;
  let config;
  let faultInjected = false;
  try {
    if (local) {
      const {Worker} = require('near-workspaces');
      const wasm = process.env.NOMOGENESIS_V2_WASM ||
        path.join(ROOT, 'target/nomogenesis_v2_compatible.wasm');
      if (!fs.existsSync(wasm) && !process.env.NOMOGENESIS_V2_WASM) {
        const deployed = await rpc('https://rpc.testnet.fastnear.com', 'query', {
          request_type: 'view_code', account_id: contract, finality: 'final'});
        const bytes = Buffer.from(deployed.code_base64, 'base64');
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), SHA);
        fs.mkdirSync(path.dirname(wasm), {recursive: true});
        fs.writeFileSync(wasm, bytes, {flag: 'wx'});
      }
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(wasm)).digest('hex'), SHA);
      worker = await Worker.init();
      parent = worker.rootAccount.accountId;
      const deployed = await worker.rootAccount.devDeploy(wasm);
      contract = deployed.accountId;
      upstream = worker.config.rpcAddr.replace(/\/$/, '');
      chainId = (await rpc(upstream, 'status', [])).chain_id;
      assert.match(chainId, /^(test-chain-|sandbox$|localnet$)/);
      network = 'sandbox';
      keyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomogenesis-closure-'));
      fs.mkdirSync(path.join(keyRoot, 'actors'), {mode: 0o700});
      const rootKey = await worker.rootAccount.getKey();
      save(path.join(keyRoot, 'bootstrap.json'), {network, account_id: parent,
        public_key: rootKey.getPublicKey().toString(), private_key: rootKey.toString()});
      const actors = [];
      for (const role of roles) {
        const account = await worker.rootAccount.createSubAccount(role);
        const key = await account.getKey();
        const value = {role, account_id: account.accountId,
          public_key: key.getPublicKey().toString()};
        actors.push(value);
        save(path.join(keyRoot, 'actors', role + '.json'),
          {...value, network, private_key: key.toString()});
      }
      manifest = {network: 'near-sandbox', controller: parent, actors};
      console.log('EXACT_PUBLIC_WASM_IN_LOCAL_SANDBOX: PASS');
    }

    broker = createRpcBroker({
      upstreams: local ? [upstream] : [upstream, 'https://archival-rpc.testnet.fastnear.com'],
      sendUpstream: local ? upstream : 'https://rpc.testnet.near.org',
      finalityUpstreams: local ? [upstream] :
        [upstream, 'https://archival-rpc.testnet.fastnear.com', 'https://rpc.testnet.near.org'],
      expectedChainId: chainId, minGapMs: local ? 20 : 250,
      maxConcurrentReads: 4, timeoutMs: 12000,
      fetchImpl: async (url, options) => {
        const message = JSON.parse(options.body);
        if (mode === '--check') {
          assert(['status', 'block', 'query'].includes(message.method));
        }
        const response = await fetch(url, options);
        if (local && message.method === 'send_tx' && !faultInjected) {
          // Lose the acknowledgement after actual inclusion. The same runtime
          // must reconcile the hash and complete without a second send.
          await response.text();
          faultInjected = true;
          throw Error('deliberately lost post-inclusion acknowledgement');
        }
        return response;
      }
    });
    const url = await broker.listen();
    assert.equal((await rpc(url, 'status', [])).chain_id, chainId);
    const code = await rpc(url, 'query', {request_type: 'view_code',
      account_id: contract, finality: 'final'});
    assert.equal(crypto.createHash('sha256').update(
      Buffer.from(code.code_base64, 'base64')).digest('hex'), SHA);
    const totals = await view(url, contract, 'm3_totals');
    assert.equal(BigInt(totals.rescue_escrow), 0n, 'Existing rescue escrow; reconcile first');
    const payouts = await view(url, contract, 'payout_totals');
    assert.equal(BigInt(payouts[1]), 0n, 'Existing pending withdrawal');
    const runRoot = path.join(keyRoot, 'technical-closure');
    const intent = path.join(keyRoot, 'technical-closure-launch-intent.json');
    assert(!fs.existsSync(runRoot) && !fs.existsSync(intent), 'Run already exists; inspect its journals');

    if (!local) {
      const stat = fs.lstatSync(keyRoot);
      assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid());
      assert.equal(stat.mode & 0o077, 0);
      manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/evidence/R7-13-public-actors.json')));
      for (const role of ['bootstrap', ...roles]) {
        const file = role === 'bootstrap' ? path.join(keyRoot, 'bootstrap.json') :
          path.join(keyRoot, 'actors', role + '.json');
        const stat = fs.lstatSync(file);
        assert(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid());
        assert.equal(stat.mode & 0o077, 0);
        const value = JSON.parse(fs.readFileSync(file));
        assert.equal(value.network, 'testnet');
        assert.equal(value.account_id, role === 'bootstrap' ? parent : role + '.' + parent);
        const account = await rpc(url, 'query', {request_type: 'view_account',
          account_id: value.account_id, finality: 'final'});
        assert(BigInt(account.amount) >= 50n * UNIT, 'Insufficient balance: ' + role);
        const access = await rpc(url, 'query', {request_type: 'view_access_key',
          account_id: value.account_id, public_key: value.public_key, finality: 'final'});
        assert.equal(access.permission, 'FullAccess');
      }
    }
    console.log('CONTRACT_AND_SIGNERS_READY: PASS');
    if (mode === '--check') {
      console.log('READ_ONLY_CHECK: PASS; BROADCASTS=0');
      return;
    }
    const env = {...process.env, NMG_R7_13H_RPC_URL: url,
      NMG_R7_13H_RUN_ID: 'technical-closure',
      NMG_R7_13_ENABLE_LIVE: 'YES_PUBLIC_TESTNET',
      NMG_R7_13H_LIVE_APPROVAL: 'YES_NEW_V2_TESTNET_RUN',
      NMG_TECHNICAL_CLOSURE_APPROVAL: 'YES_AUTHORIZE_19_TESTNET_TX'};
    if (local) {
      config = path.join(keyRoot, 'sandbox.json');
      save(config, {network, parent, contract, chainId, keyRoot, manifest, rpcUrl: url});
      env.NMG_LOCAL_SANDBOX_CONFIG = config;
    } else {
      assert(!env.NMG_LOCAL_SANDBOX_CONFIG, 'Sandbox configuration in public run');
      save(intent, {run: 'technical-closure', network, contract, restart_allowed: false});
    }

    let advanceTask = Promise.resolve();
    let advancing = false;
    let consentReadyResolve;
    const consentReady = local
      ? new Promise(resolve => {
        consentReadyResolve = resolve;
      })
      : null;
    await run(process.execPath, ['scripts/m3/r7_13_public_coordinator.cjs', '--live'], env,
      output => {
        if (local && output.includes('ALL_BUYERS_CONSENT_WAITING: PASS')) {
          consentReadyResolve();
        }
        if (local && !advancing && output.includes('REAL_PROCESS_OUTAGE_DETECTED: PASS')) {
          advancing = true;
          advanceTask = (async () => {
            await Promise.race([
              consentReady,
              (async () => {
                await pause(120000);
                throw Error('Buyers did not reach consent wait state');
              })()
            ]);
            const runInfo = JSON.parse(fs.readFileSync(path.join(runRoot, 'run.json')));
            for (let i = 0; i < 160; i++) {
              const state = await view(url, contract, 'get_rescue_case', {case_id: runInfo.case_id});
              const jobs = await Promise.all(state.job_ids.map(job_id =>
                view(url, contract, 'get_rescue_job', {job_id})));
              if (state.offer_ids.length === 3 && jobs.length === 2 &&
                  jobs.every(job => job.phase === 'Accepted')) {
                // Only the local chain clock is accelerated; all decisions,
                // signatures, broadcasts and settlement use the public runtime.
                for (let k = 0; k < 20; k++) {
                  const block = await rpc(upstream, 'block', {finality: 'final'});
                  const now = BigInt(block.header.timestamp_nanosec);
                  if (now >= BigInt(state.bid_close)) return;
                  const left = (BigInt(state.bid_close) - now) / 500000000n + 2n;
                  await worker.provider.fastForward(Number(left > 100n ? 100n : left));
                }
                throw Error('Sandbox clock did not reach bid close');
              }
              await pause(500);
            }
            throw Error('Sandbox funding/acceptance did not finish');
          })();
          // The child may still be running when this task fails.
          advanceTask.catch(error => console.error('SANDBOX_CLOCK_ERROR:', error.message));
        }
      });
    await advanceTask;
    const evidence = path.join(runRoot, 'evidence.json');
    await run('python3', ['sdk/python/examples/audit_run.py', evidence, '--rpc', url], env);
    const health = await (await fetch(url + 'health')).json();
    assert.equal(health.distinct_signed_payloads, 19);
    if (local) assert(faultInjected);
    console.log('ONE_SEND_PER_ECONOMIC_STEP: 19/19');
    console.log(local ? 'LOCAL_TECHNICAL_CLOSURE: PASS' : 'PUBLIC_TECHNICAL_CLOSURE: PASS');
    console.log('EVIDENCE=' + evidence);
  } finally {
    if (broker) await broker.close();
    if (worker) await worker.tearDown();
  }
}

main().catch(error => {
  console.error('TECHNICAL_CLOSURE_STOP:', error.stack || error);
  console.error('Inspect the existing journals before any further live action.');
  process.exitCode = 1;
});
