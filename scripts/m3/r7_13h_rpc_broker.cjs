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
  sendUpstream = null,
  finalityUpstreams = null,
  minGapMs = 350,
  timeoutMs = 15000,
  maxQueued = 180,
  maxReadQueueWaitMs = 5000,
  maxSendQueueWaitMs = 7000,
  maxReadTotalMs = 12000,
  maxConcurrentReads = 1,
  retryPauseMs = 350,
  expectedChainId = 'testnet',
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


  const signedEndpoint = sendUpstream ?? upstreams[0];

  assert(
    typeof signedEndpoint === 'string' &&
    (
      /^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(signedEndpoint) ||
      /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(signedEndpoint)
    ),
    'Invalid signed transaction endpoint'
  );

  assert(Number.isInteger(minGapMs) && minGapMs >= 0);
  assert(Number.isInteger(timeoutMs) && timeoutMs > 0);
  assert(Number.isInteger(maxQueued) && maxQueued > 0);
  assert(Number.isInteger(maxReadQueueWaitMs) && maxReadQueueWaitMs > 0);
  assert(Number.isInteger(maxSendQueueWaitMs) && maxSendQueueWaitMs > 0);
  assert(Number.isInteger(maxReadTotalMs) && maxReadTotalMs > 0);
  assert(Number.isInteger(maxConcurrentReads) && maxConcurrentReads >= 1 && maxConcurrentReads <= 8);
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

  const finalityQueue = [];
  let activeFinality = 0;
  let finalityNextSlot = 0;

  assert(
    finalityUpstreams === null ||
    (
      Array.isArray(finalityUpstreams) &&
      finalityUpstreams.length > 0 &&
      finalityUpstreams.every(url =>
        /^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(url) ||
        /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(url)
      )
    ),
    'Invalid finality endpoints'
  );

  function drainFinality() {
    while (activeFinality < 2 && finalityQueue.length) {
      const job = finalityQueue.shift();

      const start = Math.max(Date.now(), finalityNextSlot);
      finalityNextSlot = start + 300;
      activeFinality++;

      void (async () => {
        await sleep(Math.max(0, start - Date.now()));
        return job.operation();
      })().then(job.resolve, job.reject).finally(() => {
        activeFinality--;
        drainFinality();
      });
    }
  }

  function scheduleFinality(operation) {
    if (finalityQueue.length + activeFinality >= 24) {
      return Promise.reject(
        Error('Finality queue capacity exceeded')
      );
    }

    return new Promise((resolve, reject) => {
      finalityQueue.push({operation, resolve, reject});
      drainFinality();
    });
  }

  let activeReads = 0;
  let activeSend = false;

  async function drain() {
    if (draining) return;
    draining = true;

    try {
      while (writes.length || reads.length) {
        // No new read may start during a signed send.
        if (activeSend) break;

        // Preserve historical strictly serial semantics
        // when concurrency is not explicitly enabled.
        if (
          maxConcurrentReads === 1 &&
          writes.length &&
          activeReads > 0
        ) {
          break;
        }

        if (
          !writes.length &&
          activeReads >= maxConcurrentReads
        ) {
          break;
        }

        await sleep(Math.max(0, nextSlot - Date.now()));

        // Re-evaluate priority AFTER spacing.
        // A newly queued send goes before pending reads.
        if (activeSend) break;

        if (
          maxConcurrentReads === 1 &&
          writes.length &&
          activeReads > 0
        ) {
          break;
        }

        if (
          !writes.length &&
          activeReads >= maxConcurrentReads
        ) {
          break;
        }

        const isSend = writes.length > 0;
        const job = isSend
          ? writes.shift()
          : reads.shift();

        if (Date.now() - job.entered > job.limit) {
          job.reject(Error('RPC queue deadline expired'));
          queued--;
          continue;
        }

        nextSlot = Date.now() + minGapMs;
        requestsUpstream++;

        if (isSend) {
          activeSend = true;
        } else {
          activeReads++;
        }

        // Parallel READ operations are bounded.
        // Signed SEND operations remain serialized
        // and are never retried or failed over.
        void (async () => {
          try {
            job.resolve(await job.operation());
          } catch (error) {
            job.reject(error);
          } finally {
            if (isSend) {
              activeSend = false;
            } else {
              activeReads--;
            }

            queued--;
            void drain();
          }
        })();
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

  async function upstream(
    url, message, requestTimeoutMs = timeoutMs
  ) {
    let response;

    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(
          Math.max(1, requestTimeoutMs)
        )
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
      parsed.result.chain_id !== expectedChainId
    ) {
      throw Error('wrong network chain_id');
    }

    return Object.hasOwn(parsed, 'error')
      ? {error: parsed.error}
      : {result: parsed.result};
  }

  async function forwardFinality(message) {
    let lastError;
    const deadline = Date.now() + 12000;

    for (const endpoint of finalityUpstreams) {
      try {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;

        const reply = await scheduleFinality(() =>
          upstream(
            endpoint,
            message,
            Math.min(timeoutMs, 5000, Math.max(1, deadline - Date.now()))
          )
        );
        // A node may not yet know the hash or track its shard. Another read
        // endpoint can already have the finalized execution; no resend occurs.
        const reason = reply.error?.cause?.name;
        if (['UNKNOWN_TRANSACTION', 'TIMEOUT_ERROR', 'DOES_NOT_TRACK_SHARD']
          .includes(reason)) {
          lastError = transport('finality ' + reason);
          continue;
        }
        return reply;

      } catch (error) {
        lastError = error;
        if (!error.transport) throw error;
      }
    }

    throw lastError || Error('Finality deadline exhausted');
  }

  async function forward(message, send) {
    if (
      !send &&
      finalityUpstreams !== null &&
      (
        message.method === 'tx' ||
        message.method === 'EXPERIMENTAL_tx_status'
      )
    ) {
      return forwardFinality(message);
    }

    if (send) {
      // NEVER retry or fail over a broadcast.
      return scheduled(
        () => upstream(signedEndpoint, message),
        true
      );
    }

    let lastError;
    const deadline = Date.now() + maxReadTotalMs;

    for (const endpoint of upstreams) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (Date.now() >= deadline) {
            throw Error('RPC read total deadline expired');
          }

          return await scheduled(() => {
            const remaining = deadline - Date.now();

            if (remaining <= 0) {
              throw Error('RPC read total deadline expired');
            }

            return upstream(
              endpoint,
              message,
              Math.min(timeoutMs, remaining)
            );
          });

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
        active_reads: activeReads,
        active_finality: activeFinality,
        queued_finality: finalityQueue.length,
        finality_lane_enabled: finalityUpstreams !== null,
        active_send: activeSend,
        queued_writes: writes.length,
        pending: inflight.size,
        distinct_signed_payloads: sent.size,
        send_channel_isolated:
          !upstreams.includes(signedEndpoint)
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
