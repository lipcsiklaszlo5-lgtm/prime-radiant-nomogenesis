'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {fork} = require('node:child_process');

const near = require('near-api-js');
const {PublicKey} = require('@near-js/crypto');
const {Worker} = require('near-workspaces');

const {
  ROSTER
} = require('../scripts/m3/r7_06_swarm.cjs');

const {
  componentFromCsv
} = require('../scripts/m3/r5_data_envelope.cjs');

const WASM = process.env.NOMOGENESIS_V2_WASM;
const UNIT = 10n ** 21n;
const SECOND = 1000000000n;

const ROOT = path.resolve(__dirname, '..');
const AGENT = path.join(
  ROOT, 'scripts/m3/r7_auto05b_agent.cjs'
);

function connected(child, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error('agent handshake timeout')),
      30000
    );

    child.once('message', reply => {
      clearTimeout(timer);
      resolve(reply);
    });

    child.once('error', reject);
    child.send(message);
  });
}

function ready(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error('agent readiness timeout')),
      30000
    );

    child.once('message', reply => {
      clearTimeout(timer);
      resolve(reply);
    });

    child.once('error', reject);
    child.once('exit', code =>
      reject(Error('agent exited early: ' + code))
    );
  });
}

function completed(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error('agent execution timeout')),
      120000
    );

    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(Error(
        `agent exited ${code}/${signal}`
      ));
    });

    child.once('error', reject);
  });
}

async function timestamp(rpcUrl) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'block',
      params: {finality: 'optimistic'}
    }),
    signal: AbortSignal.timeout(10000)
  });

  assert(response.ok);

  const result = await response.json();
  assert(!result.error);

  return BigInt(
    result.result.header.timestamp_nanosec ??
    result.result.header.timestamp
  );
}

async function main() {
  assert(WASM && fs.statSync(WASM).size > 0);

  let worker;
  let server;
  const children = [];

  try {
    worker = await Worker.init();

    const root = worker.rootAccount;
    const contract = await root.devDeploy(WASM);

    const creator =
      await root.createSubAccount('creator');

    const source =
      await root.createSubAccount('source');

    for (let i = 0; i < 3; i++) {
      await root.createSubAccount(`worker${i}`);
    }

    const rpcUrl = worker.config.rpcAddr;
    const started =
      await timestamp(rpcUrl) / SECOND * SECOND;

    const deadlines = [
      started + 180n * SECOND,
      started + 240n * SECOND,
      started + 600n * SECOND,
      started + 900n * SECOND
    ];

    const finalDeadline =
      started + 1200n * SECOND;

    for (const value of [
      ...deadlines,
      finalDeadline
    ]) {
      assert.equal(
        BigInt(Number(value)),
        value,
        'unsafe timestamp representation'
      );
    }

    const data = [
      'quantities.csv',
      'prices.csv'
    ].map((name, index) =>
      componentFromCsv(
        path.join(ROOT, 'demo/data', name),
        index
      )
    );

    const quote = await contract.view(
      'm3_storage_quote'
    );

    const caseBond =
      BigInt(quote.case_storage_cost);

    const jobBond =
      BigInt(quote.job_storage_cost);

    const offerBond =
      BigInt(quote.offer_storage_cost);

    const caseId = await creator.call(
      contract,
      'create_rescue_case',
      {
        descriptor: {
          descriptor_version: 1,
          original_provider: source.accountId,
          component_commitments:
            data.map(x => Array.from(x.root)),
          dependency_deadline: Number(deadlines[0]),
          bid_close: Number(deadlines[1]),
          award_close: Number(deadlines[2]),
          recovery_deadline: Number(deadlines[3])
        }
      },
      {
        attachedDeposit: caseBond.toString()
      }
    );

    assert.equal(caseId.length, 32);

    let outage = false;

    server = http.createServer((request, response) => {
      if (
        request.method !== 'GET' ||
        request.url !== '/state'
      ) {
        response.writeHead(404).end();
        return;
      }

      response.writeHead(200, {
        'content-type': 'application/json'
      });

      response.end(JSON.stringify({
        outage,
        caseId,
        contractId: contract.accountId,
        finalDeadlineNs: finalDeadline.toString()
      }));
    });

    await new Promise(resolve =>
      server.listen(0, '127.0.0.1', resolve)
    );

    const url =
      `http://127.0.0.1:${server.address().port}`;

    const agents = ROSTER.map(name => {
      const child = fork(
        AGENT,
        [
          path.join(
            ROOT,
            'demo/policies/r7-06b',
            name + '.json'
          ),
          url,
          rpcUrl
        ],
        {
          stdio: [
            'ignore', 'inherit', 'inherit', 'ipc'
          ]
        }
      );

      children.push(child);

      return {name, child};
    });

    const announcements = await Promise.all(
      agents.map(async item => ({
        name: item.name,
        child: item.child,
        message: await ready(item.child)
      }))
    );

    assert.equal(announcements.length, 7);
    assert.equal(
      new Set(announcements.map(x => x.message.pid)).size,
      7
    );

    const rootKey = await root.getKey();
    assert(rootKey);

    const store =
      new near.keyStores.InMemoryKeyStore();

    await store.setKey(
      'sandbox',
      root.accountId,
      rootKey
    );

    const connection = await near.connect({
      networkId: 'sandbox',
      nodeUrl: rpcUrl,
      keyStore: store,
      deps: {keyStore: store}
    });

    const admin = await connection.account(
      root.accountId
    );

    // The parent receives public keys only.
    for (const item of announcements) {
      const {message} = item;

      assert.equal(message.kind, 'ready');
      assert.equal(message.actor, item.name);
      assert.equal(message.pid, item.child.pid);
      assert.equal(
        message.accountId,
        `${item.name}.test.near`
      );

      await admin.createAccount(
        message.accountId,
        PublicKey.fromString(message.publicKey),
        10n ** 25n
      );

      assert.equal(
        await store.getKey(
          'sandbox',
          message.accountId
        ),
        null
      );
    }

    const handshakes = await Promise.all(
      agents.map(item =>
        connected(item.child, {kind: 'connect'})
      )
    );

    assert(handshakes.every(
      x => x.kind === 'connected'
    ));

    const before = await contract.view(
      'get_rescue_case',
      {case_id: caseId}
    );

    assert.equal(before.job_ids.length, 0);
    assert.equal(before.offer_ids.length, 0);

    const initial = await contract.view(
      'm3_totals'
    );

    assert.equal(
      BigInt(initial.rescue_escrow),
      0n
    );

    console.log(
      'SEVEN_ONCHAIN_SIGNERS_ISOLATED: PASS'
    );
    console.log(
      'NO_PRE_OUTAGE_FUNDING_OR_OFFERS: PASS'
    );

    const exits = children.map(completed);

    // Only an environment event is published.
    // No fund/offer instruction is sent to agents.
    outage = true;

    console.log(
      'OUTAGE_EVENT_RELEASED_TO_AGENTS: PASS'
    );

    await Promise.all(exits);

    const state = await contract.view(
      'get_rescue_case',
      {case_id: caseId}
    );

    assert.equal(state.job_ids.length, 2);
    assert.equal(state.offer_ids.length, 3);

    const jobs = await Promise.all(
      state.job_ids.map(job_id =>
        contract.view(
          'get_rescue_job',
          {job_id}
        )
      )
    );

    assert.deepEqual(
      jobs.map(x => x.buyer).sort(),
      [
        'buyer-1.test.near',
        'buyer-2.test.near'
      ]
    );

    assert(jobs.every(x =>
      x.phase === 'Funded'
    ));

    const offers = await Promise.all(
      state.offer_ids.map(offer_id =>
        contract.view(
          'get_rescue_offer',
          {offer_id}
        )
      )
    );

    assert.deepEqual(
      offers.map(x => x.provider).sort(),
      [
        'provider-alpha.test.near',
        'provider-beta.test.near',
        'provider-gamma.test.near'
      ]
    );

    assert(offers.every(x =>
      x.phase === 'Open' &&
      BigInt(x.held_bond) === 12n * UNIT
    ));

    console.log(
      'AUTONOMOUS_TWO_BUYER_FUNDS: PASS'
    );
    console.log(
      'AUTONOMOUS_THREE_PROVIDER_BIDS: PASS'
    );
    console.log(
      'AUTONOMOUS_TWO_POLICY_REFUSALS: PASS'
    );

    const pairs = [];

    for (const a of offers.filter(
      x => x.component_index === 0
    )) {
      for (const b of offers.filter(
        x => x.component_index === 1
      )) {
        const price =
          BigInt(a.fee) + BigInt(b.fee);

        if (
          a.provider !== b.provider &&
          BigInt(a.held_bond) >= price &&
          BigInt(b.held_bond) >= price
        ) {
          pairs.push({
            offers: [a.id, b.id],
            providers: [a.provider, b.provider],
            price
          });
        }
      }
    }

    pairs.sort((a, b) =>
      a.price < b.price ? -1 :
      a.price > b.price ? 1 :
      a.offers[0] - b.offers[0]
    );

    assert.equal(pairs.length, 2);

    assert.equal(
      pairs[0].price,
      11n * UNIT
    );

    assert.deepEqual(
      pairs[0].providers,
      [
        'provider-gamma.test.near',
        'provider-beta.test.near'
      ]
    );

    assert.equal(
      pairs[1].price,
      12n * UNIT
    );

    console.log(
      'ONCHAIN_OFFERS_COMPETITIVE_PRICE: PASS'
    );

    const totals = await contract.view(
      'm3_totals'
    );

    assert.equal(
      BigInt(totals.rescue_escrow),
      52n * UNIT
    );

    assert.equal(
      BigInt(totals.storage_reserves),
      caseBond + 2n * jobBond + 3n * offerBond
    );

    assert.equal(
      Number(totals.next_rescue_job_id),
      2
    );

    console.log(
      'ONCHAIN_FUNDS_AND_BONDS_CONSERVED: PASS'
    );

    console.log(
      'R7-AUTO-05B/01 AGENT-DRIVEN ONCHAIN MARKET: PASS'
    );

    console.log(
      'LIMIT: workers not yet accepted; no award or settlement'
    );

    console.log(
      'LIMIT: local event relay and same-host agent processes'
    );

  } finally {
    for (const child of children) {
      if (
        child.exitCode === null &&
        child.signalCode === null
      ) {
        child.kill('SIGTERM');
      }
    }

    if (server) {
      await new Promise(resolve => server.close(resolve));
    }

    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error(
    'R7-AUTO-05B/01 AGENT-DRIVEN ONCHAIN MARKET: FAIL'
  );
  console.error(error.stack || error);
  process.exitCode = 1;
});
