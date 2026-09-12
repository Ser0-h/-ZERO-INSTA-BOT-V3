'use strict';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt, initialDelayMs, maxDelayMs) {
  const initial = Math.max(1, Number(initialDelayMs) || 5000);
  const maximum = Math.max(initial, Number(maxDelayMs) || 60000);
  return Math.min(maximum, initial * (2 ** Math.max(0, attempt - 1)));
}

async function retryUntilReady({
  operation,
  onRetry,
  shouldRetry = () => true,
  initialDelayMs = 5000,
  maxDelayMs = 60000,
  sleep: pause = sleep
}) {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!shouldRetry(error)) throw error;
      attempt += 1;
      const delayMs = retryDelay(attempt, initialDelayMs, maxDelayMs);
      await onRetry?.(error, { attempt, delayMs });
      await pause(delayMs);
    }
  }
}

function isRetryableStartupError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();

  if (
    message.startsWith('could not read instagram cookie file')
    || message.startsWith('instagram cookie file is empty')
    || message.includes('chat api url is missing')
    || message.includes('chat api settings are missing')
    || message.includes('chat api token is required')
    || message.includes('instagram cookies are required')
  ) return false;

  if (code === 'CONFIG_ERROR' || code === 'INVALID_REQUEST' || code === 'COOKIES_REQUIRED') return false;
  if (code === 'REQUEST_TOO_LARGE') return false;
  if (code.startsWith('HTTP_4') && code !== 'HTTP_408' && code !== 'HTTP_429') return false;
  return true;
}

module.exports = { retryDelay, retryUntilReady, isRetryableStartupError, sleep };
