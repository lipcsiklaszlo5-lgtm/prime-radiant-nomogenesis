'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const coordinator = path.join(
  __dirname, 'r7_13_public_coordinator.cjs'
);

const launcher = path.join(
  __dirname, 'r7_13v_run08_live_launcher.cjs'
);

function refuses(name, changes, pattern) {
  test(name, () => {
    const env = {...process.env};

    for (const key of [
      'NMG_R7_13_ENABLE_LIVE',
      'NMG_R7_13H_LIVE_APPROVAL',
      'NMG_R7_13V_07_LIVE_APPROVAL',
      'NMG_R7_13V_08_LIVE_APPROVAL',
      'NMG_R7_13H_RPC_URL'
    ]) delete env[key];

    Object.assign(env, {
      NMG_R7_13H_RUN_ID: 'live-v2-once-08',
      NMG_R7_13H_RPC_URL: 'http://127.0.0.1:9/'
    }, changes);

    const result = spawnSync(
      process.execPath, [coordinator, '--live'],
      {env, encoding: 'utf8', timeout: 10000}
    );

    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, pattern);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /LIVE_CASE_FINALIZED_ON_CHAIN/
    );
  });
}

refuses(
  'RUN08 refuses missing global approval',
  {},
  /Live execution requires explicit opt-in/
);

refuses(
  'RUN08 refuses missing new-run approval',
  {NMG_R7_13_ENABLE_LIVE: 'YES_PUBLIC_TESTNET'},
  /explicit new-run approval required/
);

refuses(
  'RUN08 refuses missing dedicated approval',
  {
    NMG_R7_13_ENABLE_LIVE: 'YES_PUBLIC_TESTNET',
    NMG_R7_13H_LIVE_APPROVAL: 'YES_NEW_V2_TESTNET_RUN'
  },
  /RUN08-specific approval required/
);

refuses(
  'RUN08 refuses non-loopback RPC',
  {
    NMG_R7_13_ENABLE_LIVE: 'YES_PUBLIC_TESTNET',
    NMG_R7_13H_LIVE_APPROVAL: 'YES_NEW_V2_TESTNET_RUN',
    NMG_R7_13V_08_LIVE_APPROVAL:
      'YES_AUTHORIZE_RUN08_17_TESTNET_TX',
    NMG_R7_13H_RPC_URL: 'https://rpc.testnet.near.org'
  },
  /Loopback RPC mandatory/
);

refuses(
  'RUN07 cannot use RUN08 authorization',
  {
    NMG_R7_13H_RUN_ID: 'live-v2-once-07',
    NMG_R7_13_ENABLE_LIVE: 'YES_PUBLIC_TESTNET',
    NMG_R7_13H_LIVE_APPROVAL: 'YES_NEW_V2_TESTNET_RUN',
    NMG_R7_13V_08_LIVE_APPROVAL:
      'YES_AUTHORIZE_RUN08_17_TESTNET_TX'
  },
  /RUN07-specific approval required/
);

refuses(
  'path traversal cannot select run ID',
  {NMG_R7_13H_RUN_ID: '../live-v2-once-07'},
  /Unapproved run ID/
);

test('RUN08 launcher retains its protected boundaries', () => {
  const src = fs.readFileSync(launcher, 'utf8');

  assert.match(src, /run07-recovery-once-01/);
  assert.match(src, /R7-13V-run07-recovery-live-proof\.json/);
  assert.match(src, /finalityUpstreams:/);
  assert.match(src, /finality_lane_enabled/);
  assert.match(src, /270n \* 10n \*\* 21n/);
  assert.match(src, /assert\(absent\(RUN\)/);
  assert.doesNotMatch(
    src,
    /YES_AUTHORIZE_RUN07_17_TESTNET_TX/
  );
});
