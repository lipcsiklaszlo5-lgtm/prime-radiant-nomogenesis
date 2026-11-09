'use strict';

const assert = require('node:assert/strict');

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const TRANSIENT_HTTP = new Set([
  408, 425, 429, 500, 502, 503, 504
]);

function transientReadError(error) {
  const status = Number(
    error?.status ??
    error?.statusCode ??
    error?.response?.status
  );

  if (TRANSIENT_HTTP.has(status)) return true;

  if ([
    'AbortError',
    'TimeoutError'
  ].includes(error?.name)) {
    return true;
  }

  const message = String(error?.message || '');

  return (
    /\b(?:HTTP\s*)?(?:408|425|429|500|502|503|504)\b/i.test(message) ||
    /rate.limit|too many requests|timeout|timed out/i.test(message) ||
    /fetch failed|socket hang up|ECONNRESET|ETIMEDOUT/i.test(message) ||
    /RPC broker failure|queue deadline expired/i.test(message) ||
    /read total deadline expired|upstream unavailable/i.test(message)
  );
}

async function readWithRetry(
  operation,
  {
    label = 'read',
    maxAttempts = 5,
    baseDelayMs = 550,
    maxElapsedMs = 45000
  } = {}
) {
  assert.equal(typeof operation, 'function');

  assert(
    Number.isInteger(maxAttempts) &&
    maxAttempts >= 1 && maxAttempts <= 10
  );

  assert(
    Number.isInteger(baseDelayMs) &&
    baseDelayMs >= 0 && baseDelayMs <= 10000
  );

  assert(
    Number.isInteger(maxElapsedMs) &&
    maxElapsedMs > 0
  );

  const start = Date.now();

  for (let n = 1; n <= maxAttempts; n++) {
    try {
      return await operation();

    } catch (error) {
      if (
        !transientReadError(error) ||
        n === maxAttempts
      ) {
        throw error;
      }

      const delay = Math.min(
        3000,
        baseDelayMs + (n - 1) * 550
      );

      if (Date.now() - start + delay >= maxElapsedMs) {
        throw error;
      }

      console.warn(
        'TRANSIENT_READ_RETRY:',
        label,
        n + '/' + maxAttempts,
        String(error.message || error).slice(0, 120)
      );

      await sleep(delay);
    }
  }

  throw Error('Read retry exhausted');
}

module.exports = {
  readWithRetry,
  transientReadError
};
