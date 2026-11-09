"use strict";

// R7-13V/34: opt-in, offline RUN08 integration seam.
// No live sender import or network socket.

const BASELINE_UNITS = 270n;

const ROUTES = Object.freeze({
  read: Object.freeze({
    primary: 'FastNear',
    enabled: true
  }),
  send: Object.freeze({
    primary: 'dRPC',
    enabled: false
  }),
  finality: Object.freeze({
    primary: 'NEAR RPC',
    fallback: 'dRPC',
    enabled: true,
    maxConcurrency: 2,
    queueLimit: 24,
    minSpacingMs: 300,
    deadlineMs: 30000
  })
});

const READ_METHODS = new Set([
  'status', 'query', 'block', 'chunk',
  'gas_price', 'validators',
  'EXPERIMENTAL_protocol_config',
  'EXPERIMENTAL_changes',
  'EXPERIMENTAL_genesis_config'
]);

const FINALITY_METHODS = new Set([
  'tx', 'EXPERIMENTAL_tx_status'
]);

const WRITE_METHODS = new Set([
  'broadcast_tx_async',
  'broadcast_tx_commit',
  'send_tx',
  'sign_and_send_tx',
  'sendTransaction',
  'broadcast_tx'
]);

function classifyMethod(method) {
  if (FINALITY_METHODS.has(method)) return 'finality';
  if (READ_METHODS.has(method)) return 'read';
  if (WRITE_METHODS.has(method)) return 'send';
  return 'unknown';
}

function routeFor(method) {
  const channel = classifyMethod(method);

  if (channel === 'unknown') {
    throw new Error('RUN08_UNKNOWN_RPC_METHOD');
  }
  if (channel === 'send') {
    throw new Error('RUN08_LIVE_SEND_DISABLED');
  }

  return { channel, ...ROUTES[channel] };
}

async function dispatchReadOnly(method, params, adapters) {
  const route = routeFor(method);

  if (!Array.isArray(params)) {
    throw new Error('RUN08_PARAMS_MUST_BE_ARRAY');
  }

  const fn = route.channel === 'finality'
    ? adapters && adapters.finalityLaneRead
    : adapters && adapters.fastNearRead;

  if (typeof fn !== 'function') {
    throw new Error('RUN08_MISSING_READ_ADAPTER');
  }

  // The /33 broker owns finality queueing, 429 read failover,
  // rate limits and budgets. This seam must not bypass it.
  return fn(method, params);
}

function buildPlan() {
  return {
    phase: 'R7-13V/34',
    mode: 'OFFLINE_READ_ONLY',
    checkpoint:
      '4f80478c4f78ea9a34201eac77d37fa9aed0db2e',
    baseline: {
      units: BASELINE_UNITS.toString(),
      type: 'UNIT'
    },
    routes: ROUTES,
    existingFinalityBrokerRequired: true,
    run07Rerun: false,
    run08Started: false,
    signedTransactionRetries: 0,
    newTestnetTransactions: 0,
    broadcastEnabled: false
  };
}

function main(argv = process.argv.slice(2)) {
  if (
    !argv.includes('--run08-finality-plan') ||
    argv.some(arg =>
      !['--run08-finality-plan', '--json'].includes(arg)
    )
  ) {
    throw new Error('RUN08_PLAN_ONLY_NO_EXECUTION');
  }

  process.stdout.write(
    JSON.stringify(buildPlan(), null, 2) + '\n'
  );
}

module.exports = {
  BASELINE_UNITS,
  ROUTES,
  classifyMethod,
  routeFor,
  dispatchReadOnly,
  buildPlan,
  main
};

if (require.main === module) main();
