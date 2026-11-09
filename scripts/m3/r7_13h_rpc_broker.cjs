'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');

const READ_METHODS = new Set([
  'status',
  'block',
  'query',
  'gas_price',
  'validators',
  'tx',
  'EXPERIMENTAL_tx_status',
  'EXPERIMENTAL_protocol_config'
]);

const SEND_METHODS = new Set([
  'broadcast_tx_commit',
  'broadcast_tx_async',
  'broadcast_tx',
  'send_tx'
]);

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function transport(message) {
  const error = new Error(message);
  error.transport = true;
  return error;
}

function createRpcBroker({
  upstreams,
  minGapMs = 350,
  timeoutMs = 15000,
  maxQueued = 180,
  maxReadQueueWaitMs = 5000,
  maxSendQueueWaitMs = 7000,
  retryPauseMs = 350,
  fetchImpl = globalThis.fetch
}) {
  assert(
    Array.isArray(upstreams) &&
    upstreams.length >= 1
  );

  assert(upstreams.every(url =>
    /^https:\/\//.test(url) ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(url)
  ));

  assert(Number.isInteger(minGapMs) && minGapMs >= 0);
  assert(Number.isInteger(timeoutMs) && timeoutMs > 0);
  assert(Number.isInteger(maxQueued) && maxQueued > 0);
  assert(Number.isInteger(maxReadQueueWaitMs) && maxReadQueueWaitMs > 0);
  assert(Number.isInteger(maxSendQueueWaitMs) && maxSendQueueWaitMs > 0);
  assert(Number.isInteger(retryPauseMs) && retryPauseMs >= 0);
  assert.equal(typeof fetchImpl, 'function');

  let nextSlot = 0;
  let queued = 0;
  let draining = false;
  let requestsUpstream = 0;
  let coalesced = 0;

  const inflight = new Map();
  const sent = new Set();
  const reads = [];
  const writes = [];

  async function drain() {
    if (draining) return;
    draining = true;

    try {
      while (writes.length || reads.length) {
        // Writes cannot interrupt an active read,
        // but precede all queued reads.
        const job = writes.length
          ? writes.shift() : reads.shift();

        try {
          if (Date.now() - job.entered > job.limit) {
            throw Error('RPC queue deadline expired');
          }

          await sleep(Math.max(0, nextSlot - Date.now()));

          // Expired requests never reach an upstream.
          if (Date.now() - job.entered > job.limit) {
            throw Error('RPC queue deadline expired');
          }

          nextSlot = Date.now() + minGapMs;
          requestsUpstream++;

          job.resolve(await job.operation());
        } catch (error) {
          job.reject(error);
        } finally {
          queued--;
        }
      }
    } finally {
      draining = false;
    }
  }

  function scheduled(operation, send = false) {
    if (queued >= maxQueued) {
      return Promise.reject(Error('broker queue full'));
    }

    queued++;

    return new Promise((resolve, reject) => {
      (send ? writes : reads).push({
        operation,
        resolve,
        reject,
        entered: Date.now(),
        limit: send
          ? maxSendQueueWaitMs
          : maxReadQueueWaitMs
      });

      void drain();
    });
  }

  async function upstream(url, message) {
    let response;

    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(timeoutMs)
      });

    } catch (error) {
      throw transport(
        'upstream unavailable: ' + error.name
      );
    }

    if (
      response.status === 429 ||
      response.status >= 500
    ) {
      throw transport(
        'upstream HTTP ' + response.status
      );
    }

    if (!response.ok) {
      throw Error(
        'upstream rejected HTTP ' + response.status
      );
    }

    const raw = await response.text();

    if (raw.length > 16 * 1024 * 1024) {
      throw Error('oversized RPC response');
    }

    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      throw transport('invalid upstream JSON');
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw transport('invalid RPC envelope');
    }

    if (
      parsed.id !== message.id ||
      parsed.jsonrpc !== '2.0'
    ) {
      throw transport('RPC request id mismatch');
    }

    if (
      !Object.hasOwn(parsed, 'result') &&
      !Object.hasOwn(parsed, 'error')
    ) {
      throw transport(
        'RPC response without result/error'
      );
    }

    if (
      message.method === 'status' &&
      parsed.result &&
      parsed.result.chain_id !== 'testnet'
    ) {
      throw Error('wrong network chain_id');
    }

    return Object.hasOwn(parsed, 'error')
      ? {error: parsed.error}
      : {result: parsed.result};
  }

  async function forward(message, send) {
    if (send) {
      // NEVER retry or fail over a broadcast.
      return scheduled(
        () => upstream(upstreams[0], message),
        true
      );
    }

    let lastError;

    for (const endpoint of upstreams) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await scheduled(() =>
            upstream(endpoint, message)
          );

        } catch (error) {
          lastError = error;

          if (!error.transport) {
            throw error;
          }

          if (attempt === 0) {
            await sleep(retryPauseMs);
          }
        }
      }
    }

    throw lastError ||
      transport('no healthy upstream');
  }

  function coalesceAllowed(message) {
    if (
      message.method === 'status' ||
      message.method === 'block'
    ) {
      return true;
    }

    if (message.method !== 'query') {
      return false;
    }

    const type = message.params?.request_type;

    return (
      type === 'call_function' ||
      type === 'view_code' ||
      type === 'view_account'
    );
  }

  const server = http.createServer((req, res) => {
    function reply(status, body) {
      if (res.writableEnded) return;

      res.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store'
      });

      res.end(JSON.stringify(body));
    }

    if (
      req.method === 'GET' &&
      req.url === '/health'
    ) {
      reply(200, {
        ok: true,
        upstream_requests: requestsUpstream,
        coalesced_requests: coalesced,
        queued,
        queued_reads: reads.length,
        queued_writes: writes.length,
        pending: inflight.size,
        distinct_signed_payloads: sent.size
      });

      return;
    }

    if (
      req.method !== 'POST' ||
      req.url !== '/'
    ) {
      reply(404, {error: 'not found'});
      return;
    }

    let total = 0;
    let body = '';

    req.on('data', chunk => {
      total += chunk.length;

      if (total > 1024 * 1024) {
        req.destroy();
        return;
      }

      body += chunk.toString('utf8');
    });

    req.on('end', () => {
      void (async () => {
        let message;

        try {
          message = JSON.parse(body);
        } catch {
          reply(400, {error: 'invalid JSON'});
          return;
        }

        if (
          !message ||
          Array.isArray(message) ||
          message.jsonrpc !== '2.0' ||
          !(
            typeof message.id === 'string' ||
            typeof message.id === 'number'
          ) ||
          typeof message.method !== 'string' ||
          (
            !Array.isArray(message.params) &&
            (
              !message.params ||
              typeof message.params !== 'object'
            )
          )
        ) {
          reply(400, {
            error: 'invalid RPC request'
          });

          return;
        }

        const isRead =
          READ_METHODS.has(message.method);

        const isSend =
          SEND_METHODS.has(message.method);

        if (!isRead && !isSend) {
          reply(403, {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32091,
              message: 'RPC method forbidden'
            }
          });

          return;
        }

        if (isSend) {
          const digest = crypto
            .createHash('sha256')
            .update(
              message.method + '\0' +
              JSON.stringify(message.params)
            )
            .digest('hex');

          if (sent.has(digest)) {
            reply(409, {
              jsonrpc: '2.0',
              id: message.id,
              error: {
                code: -32092,
                message:
                  'repeat signed submission blocked'
              }
            });

            return;
          }

          // Mark BEFORE network submission.
          sent.add(digest);
        }

        const share =
          isRead && coalesceAllowed(message);

        const key = share
          ? JSON.stringify([
              message.method,
              message.params
            ])
          : null;

        let pending;

        if (key && inflight.has(key)) {
          coalesced++;
          pending = inflight.get(key);

        } else {
          pending = forward(message, isSend);

          if (key) {
            inflight.set(key, pending);

            void pending.finally(() => {
              if (inflight.get(key) === pending) {
                inflight.delete(key);
              }
            }).catch(() => {});
          }
        }

        try {
          const result = await pending;

          reply(200, {
            jsonrpc: '2.0',
            id: message.id,
            ...result
          });

        } catch (error) {
          reply(503, {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32093,
              message:
                'RPC broker failure: ' +
                error.message
            }
          });
        }

      })().catch(() => {
        reply(500, {
          error: 'internal broker failure'
        });
      });
    });
  });

  return {
    server,

    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);

        server.listen(
          0,
          '127.0.0.1',
          resolve
        );
      });

      return (
        'http://127.0.0.1:' +
        server.address().port +
        '/'
      );
    },

    async close() {
      await new Promise((resolve, reject) =>
        server.close(
          error =>
            error ? reject(error) : resolve()
        )
      );
    }
  };
}

module.exports = {createRpcBroker};
