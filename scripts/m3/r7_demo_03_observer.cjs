'use strict';

const assert = require('node:assert/strict');

if (!process.send) {
  throw Error('observer requires isolated IPC process');
}

process.send({
  kind: 'observer-ready',
  pid: process.pid
});

process.on('message', async request => {
  if (request.kind !== 'probe') return;

  assert.match(
    request.endpoint,
    /^http:\/\/127\.0\.0\.1:\d+$/
  );
  assert(
    ['/quantities', '/prices'].includes(request.resource)
  );

  const observedAt = process.hrtime.bigint();

  const result = {
    kind: 'probe-result',
    id: request.id,
    observerPid: process.pid,
    resource: request.resource,
    monotonicNs: observedAt.toString()
  };

  try {
    const response = await fetch(
      request.endpoint + request.resource,
      {signal: AbortSignal.timeout(2500)}
    );

    const body = await response.text();

    result.httpStatus = response.status;
    result.csvValid = (
      response.status === 200 &&
      body.startsWith('item_id,')
    );
  } catch (error) {
    result.networkError =
      error.cause?.code || error.code || error.name;
  }

  process.send(result);
});
