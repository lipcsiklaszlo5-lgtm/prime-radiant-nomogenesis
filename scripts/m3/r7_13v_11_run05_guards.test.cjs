'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');

const launcher = path.join(
  __dirname, 'r7_13v_run05_launcher.cjs'
);

const coordinator = path.join(
  __dirname, 'r7_13_public_coordinator.cjs'
);

function refused(name, program, mode, changes, pattern) {
  test(name, () => {
    const env = {...process.env};

    for (const key of [
      'NMG_R7_13_ENABLE_LIVE',
      'NMG_R7_13H_LIVE_APPROVAL',
      'NMG_R7_13V_05_LIVE_APPROVAL',
      'NMG_R7_13H_RPC_URL'
    ]) {
      delete env[key];
    }

    Object.assign(env, changes);

    const child = spawnSync(
      process.execPath,
      [program, mode],
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
      /RUN05_DURABLE_LAUNCH_INTENT: WRITTEN/
    );
  });
}

refused(
  'RUN05 without live approval is rejected',
  launcher,
  '--live',
  {},
  /YES_PUBLIC_TESTNET/
);

refused(
  'RUN05 without specific approval is rejected',
  launcher,
  '--live',
  {
    NMG_R7_13_ENABLE_LIVE: 'YES_PUBLIC_TESTNET',
    NMG_R7_13H_LIVE_APPROVAL:
      'YES_NEW_V2_TESTNET_RUN'
  },
  /YES_AUTHORIZE_RUN05_17_TESTNET_TX/
);

refused(
  'RUN05 check refuses live approval',
  launcher,
  '--check',
  {
    NMG_R7_13_ENABLE_LIVE: 'YES_PUBLIC_TESTNET'
  },
  /Check mode forbids live approval flags/
);

refused(
  'RUN04 cannot be restarted',
  coordinator,
  '--live',
  {
    NMG_R7_13_ENABLE_LIVE: 'YES_PUBLIC_TESTNET',
    NMG_R7_13H_LIVE_APPROVAL:
      'YES_NEW_V2_TESTNET_RUN',
    NMG_R7_13V_05_LIVE_APPROVAL:
      'YES_AUTHORIZE_RUN05_17_TESTNET_TX',
    NMG_R7_13H_RUN_ID: 'live-v2-once-04',
    NMG_R7_13H_RPC_URL: 'http://127.0.0.1:9/'
  },
  /fresh run identity required/
);

refused(
  'Direct RUN05 coordinator bypass rejected',
  coordinator,
  '--live',
  {
    NMG_R7_13_ENABLE_LIVE: 'YES_PUBLIC_TESTNET',
    NMG_R7_13H_LIVE_APPROVAL:
      'YES_NEW_V2_TESTNET_RUN',
    NMG_R7_13V_05_LIVE_APPROVAL:
      'YES_AUTHORIZE_RUN05_17_TESTNET_TX',
    NMG_R7_13H_RUN_ID: 'live-v2-once-05',
    NMG_R7_13H_RPC_URL: 'http://127.0.0.1:9/'
  },
  /RUN05 guarded launcher intent required/
);
