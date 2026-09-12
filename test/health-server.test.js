'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startHealthServer } = require('../src/health-server');

test('health server stays ready while the bot waits for the Chat API', async () => {
  const bot = { started: false, stopping: false };
  const health = await startHealthServer({ bot, port: 0 });
  try {
    let response = await fetch(`http://127.0.0.1:${health.port}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      service: 'insta-bot-v1',
      status: 'waiting-for-chat-api'
    });

    bot.started = true;
    response = await fetch(`http://127.0.0.1:${health.port}/`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ready');
  } finally {
    await health.close();
  }
});
