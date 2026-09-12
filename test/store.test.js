'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Store } = require('../src/store');

const logger = { warn() {} };

test('store persists state and bounds inactive users and threads', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'insta-store-'));
  const file = path.join(root, 'state.json');
  const store = new Store(file, logger, 2, { maxUsers: 2, maxThreads: 1 });
  await store.init();
  store.recordMessage({ threadID: 'one', senderID: 'one', body: 'a' });
  store.recordMessage({ threadID: 'two', senderID: 'two', body: 'b' });
  await store.close();

  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(Object.keys(saved.threads).length, 1);
  assert.equal(Object.keys(saved.users).length, 2);
  assert.equal(saved.metrics.messages, 2);
  assert.equal(saved.threads.two.history[0].itemType, 'text');
});

test('stores welcome and leave settings per thread', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'insta-store-settings-'));
  const store = new Store(path.join(root, 'state.json'), logger);
  await store.init();

  assert.equal(store.getWelcome('thread-1'), true);
  assert.equal(store.getLeave('thread-1'), true);
  store.setWelcome('thread-1', false);
  store.setLeave('thread-1', false);
  assert.equal(store.getWelcome('thread-1'), false);
  assert.equal(store.getLeave('thread-1'), false);
  assert.equal(store.getWelcome('thread-2'), true);
  assert.equal(store.getLeave('thread-2'), true);
});
