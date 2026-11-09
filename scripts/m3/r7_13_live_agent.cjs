'use strict';

const {
  providerDeliver
} = require('./r7_13_live_completion.cjs');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const near = require('near-api-js');
const {callSignedOnce} = require('./r7_13_tx_guard.cjs');

const {
  RecoveryIntent
} = require('../../sdk/recovery_intent.cjs');

const {
  validatePolicy,
  decision
} = require('./r7_06_protocol.cjs');

const UNIT = 10n ** 21n;
const GAS = 200000000000000n;

function shieldDecision(p, payment) {
  const bridge = path.resolve(
    __dirname,
    '../../sdk/python/examples/r7_10_policy_bridge.py'
  );
  const result = spawnSync('python3', [
    '-B', bridge,
    JSON.stringify({
      policy: p,
      payment_yocto: payment.toString()
    })
  ], {
    encoding: 'utf8',
    timeout: 10000,
    env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}
  });

  assert.equal(result.status, 0,
    result.stderr || String(result.error));
  const verdict = JSON.parse(result.stdout);
  assert.equal(BigInt(verdict.payment_yocto), payment);
  return verdict;
}

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const policy = validatePolicy(
  JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
);

const url = process.argv[3];
const rpcUrl = process.argv[4];

assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(
  rpcUrl,
  process.env.NMG_R7_13H_RPC_URL ||
    'https://rpc.testnet.fastnear.com'
);
assert(process.send);


function readPersistentSigner(role) {
  const filename = path.join(
    os.homedir(),
    '.nomogenesis-r7-13',
    'actors',
    role + '.json'
  );

  const stat = fs.lstatSync(filename);

  assert(stat.isFile() && !stat.isSymbolicLink());
  assert.equal(stat.uid, process.getuid());
  assert.equal(stat.mode & 0o077, 0);

  const item = JSON.parse(
    fs.readFileSync(filename, 'utf8')
  );

  assert.equal(item.network, 'testnet');
  assert.equal(item.role, role);
  assert.equal(
    item.account_id,
    `${role}.nmg-r713-8d99c17cced1.testnet`
  );

  return item;
}

assert(
  typeof process.env.NMG_R7_13_RUN_DIR === 'string'
);

const credential = readPersistentSigner(policy.actor_id);
const accountId = credential.account_id;

const keyPair = near.KeyPair.fromString(
  credential.private_key
);

const publicKey = keyPair.getPublicKey().toString();

assert.equal(publicKey, credential.public_key);


const {readWithRetry} = require('./r7_13_read_resilience.cjs');

async function view(account, contractId, method, args = {}) {
  return readWithRetry(
    () => account.viewFunction({
      contractId,
      methodName: method,
      args
    }),
    {label: 'agent-view-' + method}
  );
}

async function signedCall(
  account, contractId, method, args, attachedDeposit
) {
  const result = await callSignedOnce({
    dir: process.env.NMG_R7_13_RUN_DIR,
    role: policy.actor_id,
    step: method,
    account,
    contractId,
    method,
    args,
    deposit: attachedDeposit
  });

  return {
    id: result.value,
    txHash: result.tx
  };
}

async function blockTimestamp(rpcUrl) {
  return readWithRetry(async () => {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'block',
        params: {finality: 'optimistic'}
      })
    });

    if (!response.ok) {
      const error = Error(
        'Block read HTTP ' + response.status
      );
      error.status = response.status;
      throw error;
    }

    const data = await response.json();

    if (data.error) {
      throw Error(
        'Block read RPC: ' +
        JSON.stringify(data.error)
      );
    }

    return BigInt(
      data.result.header.timestamp_nanosec ??
      data.result.header.timestamp
    );

  }, {label: 'agent-block-time'});
}

async function autonomouslyConsent(
  account, rpcUrl, contractId, caseId,
  funded, policy
) {
  for (let attempt = 0; attempt < 1400; attempt++) {
    const rescueCase = await view(
      account,
      contractId,
      'get_rescue_case',
      {case_id: caseId}
    );

    assert.equal(rescueCase.phase, 'Open');

    const now = await blockTimestamp(rpcUrl);

    if (now < BigInt(rescueCase.bid_close)) {
      await sleep(1800);
      continue;
    }

    assert(
      now < BigInt(rescueCase.award_close),
      'authorization window expired'
    );

    const jobs = await Promise.all(
      rescueCase.job_ids.map(id =>
        view(
          account,
          contractId,
          'get_rescue_job',
          {job_id: id}
        )
      )
    );

    const selected = jobs
      .filter(job => job.phase === 'Accepted')
      .map(job => Number(job.id))
      .sort((a, b) => a - b);

    assert(selected.includes(funded.jobId));

    // The market plan is calculated by the
    // deployed contract, not by the controller.
    const plan = await view(
      account,
      contractId,
      'preview_r7_v2_coalition',
      {
        case_id: caseId,
        selected_job_ids: selected
      }
    );

    assert.deepEqual(
      plan.selected_job_ids,
      selected
    );

    const mine = plan.payments.find(
      row => Number(row.job_id) === funded.jobId
    );

    assert(mine, 'own funded job not in plan');

    const exact = BigInt(mine.amount);

    const sdkConsent = shieldDecision(policy, exact);
    assert.equal(sdkConsent.approved, true,
      'AgentShield rejected an uneconomic consent');
    console.log('AGENTSHIELD_CONSENT_POLICY: PASS');

    const cap = BigInt(policy.cap) * UNIT;
    const personalBenefit = BigInt(
      policy.value - policy.outside_option
    ) * UNIT;

    assert(exact > 0n);
    assert(exact <= cap);
    assert(exact <= personalBenefit);

    const ownJob = jobs.find(
      job => Number(job.id) === funded.jobId
    );

    assert.equal(
      ownJob.buyer,
      accountId
    );

    const quote = await view(
      account,
      contractId,
      'quote_r7_v2_consent_storage'
    );

    const nonce = funded.jobId + 101;

    const signed = await signedCall(
      account,
      contractId,
      'register_r7_v2_consent',
      {
        input: {
          case_id: caseId,
          contract: contractId,
          domain:
            'NOMOGENESIS/R7-06E/SUBSET/V1',
          job_id: funded.jobId,
          buyer: accountId,
          nonce,
          plan_hash: plan.plan_hash,
          max_payment: cap.toString(),
          exact_payment: exact.toString(),
          expires_at: Number(
            rescueCase.award_close
          )
        }
      },
      BigInt(quote)
    );

    console.log(
      'AUTONOMOUS_BUYER_V2_CONSENT:',
      policy.actor_id,
      'JOB=' + funded.jobId,
      'PAYMENT=' + exact,
      'TX=' + signed.txHash
    );

    return;
  }

  throw Error('buyer authorization timed out');
}

async function main() {
  process.send({
    kind: 'ready',
    actor: policy.actor_id,
    accountId,
    publicKey,
    pid: process.pid
  });

  const connected = await new Promise(resolve =>
    process.once('message', resolve)
  );

  assert.equal(connected.kind, 'connect');

  const store =
    new near.keyStores.InMemoryKeyStore();

  await store.setKey(
    'testnet',
    accountId,
    keyPair
  );

  const connection = await near.connect({
    networkId: 'testnet',
    nodeUrl: rpcUrl,
    keyStore: store,
    deps: {keyStore: store}
  });

  const account =
    await connection.account(accountId);

  process.send({
    kind: 'connected',
    actor: policy.actor_id
  });

  let event;

  for (let attempt = 0; attempt < 400; attempt++) {
    const response = await fetch(url + '/state', {
      signal: AbortSignal.timeout(5000)
    });

    assert.equal(response.status, 200);

    const state = await response.json();

    if (state.outage) {
      event = state;
      break;
    }

    await sleep(500);
  }

  assert(event, 'outage event not observed');

  const {
    caseId,
    contractId,
    finalDeadlineNs
  } = event;

  assert.equal(caseId.length, 32);

  const rescueCase = await view(
    account,
    contractId,
    'get_rescue_case',
    {case_id: caseId}
  );

  assert(rescueCase, 'unknown rescue case');
  assert.equal(rescueCase.phase, 'Open');

  const verdict = decision(policy);

  if (policy.role === 'buyer') {
    const maximum = BigInt(Math.min(
      policy.cap,
      Math.max(0, policy.value - policy.outside_option)
    )) * UNIT;
    const sdk = shieldDecision(policy, maximum);
    assert.equal(sdk.approved, verdict.willing);
    console.log('AGENTSHIELD_AUTONOMOUS_DECISION:',
      policy.actor_id,
      sdk.approved ? 'ACCEPT' : 'REJECT',
      'MAX_YOCTO=' + maximum);
  }

  // The provider's declared readiness is part of
  // its local policy, not assigned by the controller.
  const willing = verdict.willing && (
    policy.role === 'buyer' ||
    policy.ready_at <= 2
  );

  if (!willing) {
    console.log(
      'AUTONOMOUS_POLICY_REFUSAL:',
      policy.actor_id
    );
    return;
  }

  if (policy.role === 'buyer') {
    const cap = Math.min(
      policy.cap,
      policy.value - policy.outside_option
    );

    assert(cap > 0 && cap <= 7);

    const worker =
      `worker${policy.job_id - 1}.nmg-r713-8d99c17cced1.testnet`;

    const threshold = (
      400 + 100 * policy.job_id
    ).toString();

    const intent = new RecoveryIntent({
      caseId,
      worker,
      workerRewardYocto: UNIT.toString(),
      rescueCapYocto: (
        BigInt(cap) * UNIT
      ).toString(),
      threshold,
      finalDeadlineNs
    });

    const adapter = {
      accountId: contractId,
      view: (method, args = {}) =>
        view(account, contractId, method, args)
    };

    const signer = {
      async call(target, method, args, options) {
        const outcome = await signedCall(
          account,
          target.accountId,
          method,
          args,
          BigInt(options.attachedDeposit)
        );

        return {
          jobId: outcome.id,
          txHash: outcome.txHash
        };
      }
    };

    const funded = await intent.fund({
      buyer: signer,
      contract: adapter
    });

    assert(Number.isInteger(funded.jobId));

    console.log(
      'AUTONOMOUS_BUYER_FUNDED:',
      policy.actor_id,
      'JOB=' + funded.jobId,
      'TX=' + funded.txHash
    );

    await autonomouslyConsent(
      account,
      rpcUrl,
      contractId,
      caseId,
      funded,
      policy
    );

    return;
  }

  assert.equal(policy.role, 'provider');

  const quote = await view(
    account,
    contractId,
    'm3_storage_quote'
  );

  const bond =
    BigInt(policy.bond) * UNIT;

  const fee =
    BigInt(policy.fee) * UNIT;

  assert(fee > 0n);
  assert(bond >= fee);
  assert(policy.fee >= policy.cost_floor);

  const result = await signedCall(
    account,
    contractId,
    'post_rescue_offer',
    {
      input: {
        case_id: caseId,
        component_index: policy.component,
        slot_id: policy.slot,
        fee: fee.toString(),
        bond_capacity: bond.toString()
      }
    },
    bond + BigInt(quote.offer_storage_cost)
  );

  assert(Number.isInteger(result.id));

  console.log(
    'AUTONOMOUS_PROVIDER_OFFER:',
    policy.actor_id,
    'OFFER=' + result.id,
    'TX=' + result.txHash
  );

  await providerDeliver({
    url,
    account,
    contractId,
    caseId,
    policy,
    offerId: result.id,
    accountId,
    view,
    signedCall
  });
}

main().catch(error => {
  console.error(
    'AUTONOMOUS_AGENT_FAILED:',
    policy.actor_id,
    error.stack || error
  );
  process.exitCode = 1;
});
