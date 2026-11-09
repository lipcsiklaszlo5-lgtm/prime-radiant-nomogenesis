"use strict";

const http = require('node:http');
const launcher = require('./r7_13v_run08_launcher.cjs');

// Only an explicitly supplied local broker may receive RPCs.
function localEndpoint(input) {
  if (typeof input !== 'string' || !input) {
    throw new Error('RUN08_EXPLICIT_LOOPBACK_URL_REQUIRED');
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('RUN08_INVALID_LOOPBACK_URL');
  }

  if (
    url.protocol !== 'http:' ||
    url.pathname !== '/' ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    !url.port ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  ) {
    throw new Error('RUN08_NON_LOOPBACK_OR_AMBIGUOUS_URL');
  }

  return url;
}

function createReadOnlyBridge(endpoint, opts = {}) {
  const url = localEndpoint(endpoint);

  const timeoutMs =
    opts.timeoutMs === undefined ? 5000 : opts.timeoutMs;

  const maxBytes =
    opts.maxBytes === undefined ? 262144 : opts.maxBytes;

  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 30000 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 128 ||
    maxBytes > 1048576
  ) {
    throw new Error('RUN08_INVALID_READ_BUDGET');
  }

  let seq = 0;

  function request(channel, method, params) {
    const route = launcher.routeFor(method);

    const validParams =
      Array.isArray(params) ||
      (
        params !== null &&
        typeof params === 'object' &&
        Object.getPrototypeOf(params) === Object.prototype
      );

    if (
      route.channel !== channel ||
      !validParams
    ) {
      throw new Error('RUN08_METHOD_OR_PARAMS_REJECTED');
    }

    const id = ++seq;

    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    });

    return new Promise((resolve, reject) => {
      const req = http.request(url, {
        method: 'POST',
        agent: false,
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'content-length': Buffer.byteLength(payload)
        }
      }, res => {

        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new Error('RUN08_BROKER_HTTP_' + res.statusCode)
          );
          return;
        }

        let bytes = 0;
        const parts = [];

        res.on('data', part => {
          bytes += part.length;

          if (bytes > maxBytes) {
            res.destroy();
            reject(
              new Error('RUN08_BROKER_RESPONSE_TOO_LARGE')
            );
            return;
          }

          parts.push(part);
        });

        res.on('end', () => {
          try {
            const data = JSON.parse(
              Buffer.concat(parts).toString('utf8')
            );

            if (
              data.jsonrpc !== '2.0' ||
              data.id !== id ||
              (
                !Object.hasOwn(data, 'result') &&
                !Object.hasOwn(data, 'error')
              )
            ) {
              throw new Error(
                'RUN08_BROKER_INVALID_RESPONSE'
              );
            }

            if (data.error) {
              throw new Error(
                'RUN08_BROKER_RPC_ERROR_' +
                (data.error.code ?? 'UNKNOWN')
              );
            }

            resolve(data.result);

          } catch (e) {
            reject(e);
          }
        });

        res.on('error', reject);
      });

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error('RUN08_BROKER_TIMEOUT'));
      });

      req.on('error', reject);
      req.end(payload);
    });
  }

  const adapters = Object.freeze({
    fastNearRead: (m, p) =>
      request('read', m, p),

    finalityLaneRead: (m, p) =>
      request('finality', m, p)
  });

  return Object.freeze({
    adapters,

    read: (method, params = []) =>
      launcher.dispatchReadOnly(
        method,
        params,
        adapters
      )
  });
}

module.exports = {
  localEndpoint,
  createReadOnlyBridge
};

if (require.main === module) {
  if (
    process.argv.length !== 3 ||
    process.argv[2] !== '--read-only-status'
  ) {
    console.error(
      'RUN08_NO_AUTOMATIC_NETWORK_OR_SEND'
    );
    process.exitCode = 2;

  } else {
    try {
      const bridge = createReadOnlyBridge(
        process.env.NOMOGENESIS_LOOPBACK_RPC_URL
      );

      bridge.read('status', []).then(
        result => {
          console.log(JSON.stringify({
            mode: 'READ_ONLY',
            status: result
          }, null, 2));
        },
        error => {
          console.error(error.message);
          process.exitCode = 1;
        }
      );

    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
