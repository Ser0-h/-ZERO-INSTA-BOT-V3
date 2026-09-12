'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const prefixCommand = require('../scripts/cmds/prefix');
const statsCommand = require('../scripts/cmds/stats');
const helpCommand = require('../scripts/cmds/help');

function replyContext(replies) {
  return {
    api: { sendEffects: async () => { throw new Error('effect endpoint should not be used'); } },
    message: { reply: async (content) => replies.push(content) },
    threadID: 'thread-1'
  };
}

test('prefix, stats, and help responses remain replies to the triggering message', async () => {
  const replies = [];
  const context = replyContext(replies);

  await prefixCommand.onStart({
    ...context,
    args: [],
    config: { prefix: '!', configPath: null },
    role: 0,
    store: { getPrefix: () => '!' }
  });
  await statsCommand.onStart({
    ...context,
    config: { botName: 'Test Bot' },
    store: { stats: () => ({ uptimeMs: 1000, messages: 2, commands: 1, users: 1, threads: 1 }) }
  });
  await helpCommand.onStart({
    ...context,
    args: [],
    config: { botName: 'Test Bot', prefix: '!' },
    commandEntries: () => [{ name: 'ping', aliases: [], category: 'system', description: 'Check status.' }],
    prefix: '!'
  });

  assert.equal(replies.length, 3);
  assert.ok(replies[0].includes('🌐') && replies[0].includes('📬'));
  assert.ok(replies[1].includes('❏') && replies[1].includes('➥'));
  assert.ok(replies[2].includes('☠️ 𝗡𝗲𝗼𝗞𝗘𝗫 𝗔𝗜') && replies[2].includes('× ping'));
});

test('effect response falls back to a normal reply when effects are unavailable', async () => {
  const replies = [];
  await statsCommand.onStart({
    api: {},
    config: { botName: 'Test Bot' },
    message: { reply: async (content) => replies.push(content) },
    store: { stats: () => ({ uptimeMs: 0, messages: 0, commands: 0, users: 0, threads: 0 }) },
    threadID: 'thread-1'
  });

  assert.equal(replies.length, 1);
  assert.match(replies[0], /Test Bot statistics/);
});
