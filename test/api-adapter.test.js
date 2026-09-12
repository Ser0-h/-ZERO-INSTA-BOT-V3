'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { adaptClient } = require('../src/api-adapter');

test('forwards bot-owned unsend and reactions through the client', async () => {
  let unsendCalls = 0;
  let reactionCalls = 0;
  const api = adaptClient({
    unsendMessage: async (...args) => { unsendCalls += 1; return args; },
    sendReaction: () => { reactionCalls += 1; return Promise.resolve(true); }
  });

  assert.deepEqual(await api.unsendMessage('message-1', 'thread-1'), ['message-1', 'thread-1']);
  assert.equal(await api.sendReaction('🌚', 'message-1', 'thread-1'), true);
  assert.equal(unsendCalls, 1);
  assert.equal(reactionCalls, 1);
});

test('wraps both the low-level client and login facade without exposing private escape hatches', async () => {
  const sent = [];
  const facade = {
    getCurrentUserID: () => 'user-1',
    sendMessage: async (message, threadID) => { sent.push({ message, threadID }); },
    stopListening() {},
    listen() {},
    on() {},
    sendPhotoFromUrl() {},
    sendVoiceFromUrl() {},
    sendGIF() {},
    sendDirectMessage() {},
    replyToMessage() {},
    getHealth: () => ({ authenticated: true }),
    saveSession: async () => {},
    logout: async () => {}
  };
  const api = adaptClient(facade);
  await api.sendMessage('hello', 'thread-1');
  assert.deepEqual(sent, [{ message: 'hello', threadID: 'thread-1' }]);
  assert.equal('_client' in api, false);
});

test('normalizes broken decorative text before sending it', async () => {
  const sent = [];
  const api = adaptClient({
    sendMessage: async (message, threadID) => sent.push({ message, threadID }),
    sendDirectMessage: async () => {},
    replyToMessage: async () => {}
  });

  await api.sendMessage('\u2751 Ready \u27A5 \u00E2\uFFFD\u00A5', 'thread-1');
  await api.sendMessage({ body: '\u00E2\uFFFD\uFFFD' }, 'thread-1');

  assert.deepEqual(sent, [
    { message: '❏ Ready ➥ ➥', threadID: 'thread-1' },
    { message: { body: '❏' }, threadID: 'thread-1' }
  ]);
});

test('keeps reaction removal and toggle methods available', async () => {
  const calls = [];
  const api = adaptClient({
    sendReaction() {},
    removeReaction: async (...args) => calls.push(['remove', ...args]),
    toggleReaction: async (...args) => calls.push(['toggle', ...args])
  });

  await api.removeReaction('message-1', 'thread-1');
  await api.toggleReaction('❤️', 'message-1', 'thread-1');
  assert.deepEqual(calls, [
    ['remove', 'message-1', 'thread-1'],
    ['toggle', '❤️', 'message-1', 'thread-1']
  ]);
});

test('forwards effects and music sticker methods with normalized thread IDs', async () => {
  const calls = [];
  const api = adaptClient({
    sendEffects: async (...args) => calls.push(['effect', ...args]),
    stickerMusic: async (...args) => calls.push(['music', ...args])
  });

  await api.sendEffects(123, '\u2751 hello', 'fire');
  await api.stickerMusic(456, 'song');
  assert.deepEqual(calls, [
    ['effect', '123', '❏ hello', 'fire'],
    ['music', '456', 'song', undefined]
  ]);
});

test('forwards group participant management methods', async () => {
  const calls = [];
  const api = adaptClient({
    addUsersToThread: async (...args) => calls.push(['add', ...args]),
    removeUsersFromThread: async (...args) => calls.push(['remove', ...args]),
    leaveThread: async (...args) => calls.push(['leave', ...args])
  });

  await api.addUsersToThread('thread-1', ['42']);
  await api.removeUsersFromThread('thread-1', ['42']);
  await api.leaveThread('thread-1');
  assert.deepEqual(calls, [
    ['add', 'thread-1', ['42']],
    ['remove', 'thread-1', ['42']],
    ['leave', 'thread-1']
  ]);
});
