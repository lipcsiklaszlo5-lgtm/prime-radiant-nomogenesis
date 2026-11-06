'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {startServices} = require('./r7_demo_03_bridge.cjs');
const {
  startBackupProviders
} = require('./r7_demo_03_backup_bridge.cjs');

test('isolated backups deliver after actual source process exit',
  {timeout: 30000},
  async () => {
    let source;
    let backups;

    try {
      source = await startServices();
      backups = await startBackupProviders();

      assert.deepEqual(
        backups.commitments,
        source.sourceCommitments
      );

      assert.notEqual(backups.pids[0], backups.pids[1]);

      for (const pid of backups.pids) {
        assert.notEqual(pid, source.sourcePid);
        assert.notEqual(pid, source.observerPid);
      }

      console.log('BACKUP ROOT PARITY: PASS');

      for (const resource of ['/quantities', '/prices']) {
        const response = await source.probe(resource);
        assert.equal(response.httpStatus, 200);
        assert.equal(response.csvValid, true);
      }

      const exit = await source.stopSource();
      assert.equal(exit.signal, 'SIGTERM');

      for (const resource of ['/quantities', '/prices']) {
        const result = await source.probe(resource);
        assert.equal(result.networkError, 'ECONNREFUSED');
      }

      console.log('PRIMARY PROCESS EXIT VERIFIED: PASS');

      for (let index = 0; index < 2; index++) {
        const delivered = await backups.deliver(index);

        assert.deepEqual(
          delivered.root,
          source.sourceCommitments[index]
        );

        console.log('R7_EVENT ' + JSON.stringify({
          kind: 'BACKUP_COMPONENT_DELIVERED',
          providerIndex: index,
          providerPid: delivered.pid,
          afterSourceExit: true,
          payloadBytes: delivered.payload.length
        }));
      }

      console.log(
        'R7-DEMO-03/04A INDEPENDENT BACKUP DELIVERY: PASS'
      );
    } finally {
      if (backups) await backups.close();
      if (source) await source.close();
    }
  }
);
