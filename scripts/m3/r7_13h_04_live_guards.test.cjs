'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');

const coordinator = path.join(
  __dirname,
  'r7_13_public_coordinator.cjs'
);

// Every test below MUST fail before main() can
// reach any RPC request or transaction signature.
const safeFlags = {
  NMG_R7_13_ENABLE_LIVE: 'YES_PUBLIC_TESTNET',
  NMG_R7_13H_RUN_ID: 'live-v2-once-06',
  NMG_R7_13H_LIVE_APPROVAL:
    'YES_NEW_V2_TESTNET_RUN',
  NMG_R7_13H_RPC_URL:
    'http://127.0.0.1:9/'
};

function mustRefuse(label, changes, pattern) {
  test(label, () => {
    const env = {...process.env, ...safeFlags};

    for (const [key, value] of Object.entries(changes)) {
      if (value === null) {
        delete env[key];
      } else {
        env[key] = value;
      }
    }

    const child = spawnSync(
      process.execPath,
      [coordinator, '--live'],
      {
        env,
        encoding: 'utf8',
        timeout: 10000
      }
    );

    assert.equal(child.error, undefined);
    assert.notEqual(child.status, 0);

    const output =
      (child.stdout || '') +
      (child.stderr || '');

    assert.match(output, pattern);
    assert.doesNotMatch(
      output,
      /LIVE_CASE_CREATED|LIVE_CASE_FINALIZED_ON_CHAIN/
    );
  });
}

mustRefuse(
  'old RUN03 cannot be restarted',
  {NMG_R7_13H_RUN_ID: 'live-v2-once-03'},
  /fresh run identity required/
);

mustRefuse(
  'path traversal cannot select a run directory',
  {NMG_R7_13H_RUN_ID: '../live-v2-once-04'},
  /Unapproved run ID/
);

mustRefuse(
  'missing loopback broker prevents live mode',
  {NMG_R7_13H_RPC_URL: null},
  /shared loopback broker is mandatory/
);

mustRefuse(
  'external RPC cannot replace loopback broker',
  {
    NMG_R7_13H_RPC_URL:
      'https://rpc.testnet.fastnear.com'
  },
  /Loopback RPC mandatory/
);

mustRefuse(
  'missing explicit run approval prevents live mode',
  {NMG_R7_13H_LIVE_APPROVAL: null},
  /explicit new-run approval required/
);

mustRefuse(
  'missing original live approval prevents live mode',
  {NMG_R7_13_ENABLE_LIVE: null},
  /Live execution requires explicit opt-in/
);
