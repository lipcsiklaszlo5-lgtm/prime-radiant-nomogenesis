'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');

const script = path.join(
  __dirname, 'r7_13v_run04_launcher.cjs'
);

function refused(name, mode, changes, pattern) {
  test(name, () => {
    const env = {...process.env};

    for (const key of [
      'NMG_R7_13_ENABLE_LIVE',
      'NMG_R7_13H_LIVE_APPROVAL',
      'NMG_R7_13V_LIVE_APPROVAL'
    ]) {
      delete env[key];
    }

    Object.assign(env, changes);

    const child = spawnSync(
      process.execPath, [script, mode],
      {env, encoding: 'utf8', timeout: 10000}
    );

    assert.equal(child.error, undefined);
    assert.notEqual(child.status, 0);

    const out =
      child.stdout + child.stderr;

    assert.match(out, pattern);
    assert.doesNotMatch(
      out, /RUN04_DURABLE_LAUNCH_INTENT: WRITTEN/
    );
  });
}

refused(
  'live mode without approvals refused',
  '--live', {},
  /YES_PUBLIC_TESTNET/
);

refused(
  'missing independent approval refused',
  '--live', {
    NMG_R7_13_ENABLE_LIVE: 'YES_PUBLIC_TESTNET',
    NMG_R7_13H_LIVE_APPROVAL:
      'YES_NEW_V2_TESTNET_RUN'
  },
  /YES_AUTHORIZE_RUN04_17_TESTNET_TX/
);

refused(
  'read-only mode refuses live approval flags',
  '--check', {
    NMG_R7_13_ENABLE_LIVE: 'YES_PUBLIC_TESTNET'
  },
  /Check mode forbids live approval flags/
);

refused(
  'unknown launcher mode refused',
  '--restart', {},
  /Use --check or --live/
);
