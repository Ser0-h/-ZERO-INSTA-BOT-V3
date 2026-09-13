'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/global-utils');
const { CommandRouter } = require('../src/command-router');

const logger = { debug() {}, info() {}, warn() {}, error() {} };

function makeRouter(commands) {
  const store = {
    getPrefix: () => '!',
    isMuted: () => false,
    recordCommand() {},
    getHistory: () => []
  };
  const router = new CommandRouter({
    api: { sendMessage: async () => ({ messageID: 'sent' }), getCurrentUserID: async () => 'bot' },
    config: {
      ownerId: '1',
      adminIds: new Set(),
      allowThreadAdmins: true,
      prefix: '!',
      commandCooldownMs: 0,
      botName: 'Test',
      allowedThreads: new Set(),
      blockedThreads: new Set()
    },
    store,
    commands,
    aliases: new Map(),
    logger
  });
  global.NkxBot = { onReply: router.replyHandlers, commands: router.commands };
  return router;
}

test('Goatbot-style global.onReply.set data reaches the onReply hook as Reply', async () => {
  let seen = null;
  const command = {
    config: { name: 'choose' },
    onStart() {},
    async onReply({ Reply, event, api }) {
      seen = { result: Reply.result, type: Reply.type, author: Reply.author, messageID: Reply.messageID, body: event.body };
      assert.equal(api.sendMessage instanceof Function, true);
    }
  };
  const router = makeRouter(new Map([['choose', command]]));
  // Registration exactly like Goatbot commands do it.
  router.replyHandlers.set('BOTMSG1', {
    commandName: 'choose',
    messageID: 'BOTMSG1',
    author: 'u1',
    result: [10, 20, 30],
    type: 'video'
  });

  const handled = await router.handle({
    type: 'message', threadID: 't1', senderID: 'u1', messageID: 'm2', body: '2', replyTo: 'BOTMSG1'
  });

  assert.equal(handled, true);
  assert.deepEqual(seen, { result: [10, 20, 30], type: 'video', author: 'u1', messageID: 'BOTMSG1', body: '2' });
});

test('Reply.delete removes the entry', async () => {
  const command = {
    config: { name: 'once' },
    onStart() {},
    async onReply({ Reply }) { Reply.delete(); }
  };
  const router = makeRouter(new Map([['once', command]]));
  router.replyHandlers.set('BOTMSG2', { commandName: 'once', messageID: 'BOTMSG2', author: 'u1' });

  await router.handle({ type: 'message', threadID: 't1', senderID: 'u1', messageID: 'm2', body: 'x', replyTo: 'BOTMSG2' });
  assert.equal(router.replyHandlers.has('BOTMSG2'), false);
});

test('only the author can trigger a registered reply', async () => {
  let invoked = false;
  const command = {
    config: { name: 'locked' },
    onStart() {},
    async onReply() { invoked = true; }
  };
  const router = makeRouter(new Map([['locked', command]]));
  router.replyHandlers.set('BOTMSG3', { commandName: 'locked', messageID: 'BOTMSG3', author: 'u1' });

  const handled = await router.handle({
    type: 'message', threadID: 't1', senderID: 'other', messageID: 'm2', body: 'x', replyTo: 'BOTMSG3'
  });

  assert.equal(handled, false);
  assert.equal(invoked, false);
});

test('setReply(function) registers a handler for the sent message', async () => {
  let seen = null;
  const command = {
    config: { name: 'quiz' },
    onStart({ message, event }) {
      message.setReply(async ({ event: replyEvent }) => { seen = replyEvent.body; }, 60000, event.messageID);
    }
  };
  const router = makeRouter(new Map([['quiz', command]]));

  await router.handle({ type: 'message', threadID: 't1', senderID: 'u1', messageID: 'M0', body: '!quiz' });
  const entry = router.replyHandlers.get('M0');
  assert.equal(typeof entry.handler, 'function');
  assert.equal(entry.author, 'u1');

  await router.handle({ type: 'message', threadID: 't1', senderID: 'u1', messageID: 'M1', body: 'hello', replyTo: 'M0' });
  assert.equal(seen, 'hello');
});

test('setReply(data) stores custom fields and keeps the command onReply hook', async () => {
  let seen = null;
  const command = {
    config: { name: 'menu' },
    onStart({ message, event }) {
      message.setReply({ data: 'CUSTOM', ttlIgnored: true }, 60000, event.messageID);
    },
    async onReply({ Reply, event }) {
      seen = `${Reply.data}:${event.body}`;
    }
  };
  const router = makeRouter(new Map([['menu', command]]));

  await router.handle({ type: 'message', threadID: 't1', senderID: 'u1', messageID: 'M9', body: '!menu' });
  assert.equal(router.replyHandlers.get('M9').data, 'CUSTOM');

  await router.handle({ type: 'message', threadID: 't1', senderID: 'u1', messageID: 'M10', body: 'yo', replyTo: 'M9' });
  assert.equal(seen, 'CUSTOM:yo');
});

test('expired reply entries are pruned and ignored', async () => {
  let invoked = false;
  const command = {
    config: { name: 'stale' },
    onStart() {},
    async onReply() { invoked = true; }
  };
  const router = makeRouter(new Map([['stale', command]]));
  router.replyHandlers.set('BOTMSG4', {
    commandName: 'stale', messageID: 'BOTMSG4', author: 'u1', expiresAt: Date.now() - 1
  });

  const handled = await router.handle({
    type: 'message', threadID: 't1', senderID: 'u1', messageID: 'm2', body: 'x', replyTo: 'BOTMSG4'
  });

  assert.equal(handled, false);
  assert.equal(invoked, false);
  assert.equal(router.replyHandlers.has('BOTMSG4'), false);
});

test('a reply event typed message_reply (Goatbot style) still dispatches onReply', async () => {
  let seen = null;
  const command = {
    config: { name: 'quiz2' },
    onStart() {},
    async onReply({ event }) {
      if (event.type === 'message_reply') seen = event.body;
    }
  };
  const router = makeRouter(new Map([['quiz2', command]]));
  router.replyHandlers.set('BOTMSG5', { commandName: 'quiz2', messageID: 'BOTMSG5', author: 'u1' });

  const handled = await router.handle({
    type: 'message_reply', threadID: 't1', senderID: 'u1', messageID: 'm2', body: 'answer', replyTo: 'BOTMSG5'
  });

  assert.equal(handled, true);
  assert.equal(seen, 'answer');
});

test('Goatbot sendMessage(message, threadID, callback, replyTo) registers onReply via the callback', async () => {
  const { sendGoatbotMessage } = require('../src/api-adapter');
  const calls = [];
  const client = {
    async sendMessage(message, threadID) {
      calls.push(['sendMessage', message, threadID]);
      return { messageID: 'BOTMSG6', threadID };
    },
    async replyToMessage(threadID, message, replyTo) {
      calls.push(['replyToMessage', threadID, message, replyTo]);
      return { messageID: 'BOTMSG6', threadID, replyTo };
    }
  };
  const sendMessage = (message, threadID) => client.sendMessage(message, threadID);

  let info = null;
  const promise = sendGoatbotMessage(sendMessage, client, 'hello', 't1', (error, sent) => {
    if (error) throw error;
    info = sent;
  }, 'ANCHOR');

  const returned = await promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(returned.messageID, 'BOTMSG6');
  assert.equal(info.messageID, 'BOTMSG6');
  // A replyTo anchor must route through replyToMessage, not a plain send.
  assert.deepEqual(calls, [['replyToMessage', 't1', 'hello', 'ANCHOR']]);

  // Without a reply anchor it is a plain send.
  calls.length = 0;
  await sendGoatbotMessage(sendMessage, client, 'plain', 't1', () => {}, undefined);
  assert.deepEqual(calls, [['sendMessage', 'plain', 't1']]);
});

test('sendGoatbotMessage reports send failures to the callback without throwing', async () => {
  const { sendGoatbotMessage } = require('../src/api-adapter');
  const boom = new Error('nope');
  const client = { async sendMessage() { throw boom; } };
  const sendMessage = (message, threadID) => client.sendMessage(message, threadID);

  let reported = null;
  await assert.rejects(
    sendGoatbotMessage(sendMessage, client, 'x', 't1', (error) => { reported = error; }),
    boom
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reported, boom);
});

