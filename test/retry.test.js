'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isRetryableStartupError, retryDelay, retryUntilReady } = require('../src/retry');

test('retries unavailable services with capped exponential delays', async () => {
  let attempts = 0;
  const delays = [];
  const result = await retryUntilReady({
    operation: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('fetch failed');
      return 'ready';
    },
    initialDelayMs: 10,
    maxDelayMs: 15,
    sleep: async (delayMs) => delays.push(delayMs)
  });

  assert.equal(result, 'ready');
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10, 15]);
});

test('does not retry local configuration errors', () => {
  assert.equal(isRetryableStartupError(new Error('Could not read Instagram cookie file')), false);
  assert.equal(isRetryableStartupError(Object.assign(new Error('Bad request'), { code: 'INVALID_REQUEST' })), false);
});

test('retries temporary API authentication and rate-limit failures', () => {
  assert.equal(isRetryableStartupError(Object.assign(new Error('auth failed'), { code: 'AUTH_FAILED' })), true);
  assert.equal(isRetryableStartupError(Object.assign(new Error('limited'), { code: 'RATE_LIMITED' })), true);
  assert.equal(retryDelay(4, 5000, 60000), 40000);
});
