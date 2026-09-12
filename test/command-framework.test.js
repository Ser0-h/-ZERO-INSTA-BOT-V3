'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { loadCommands, loadEventCommands } = require('../src/command-loader');
const { CommandRouter } = require('../src/command-router');
const { loadLanguage } = require('../src/localization');
const { createHandlerEvents } = require('../bot/handler/handlerEvents');
const { normalizeEvent } = require('../bot/handler/handlerCheckData');
const unsendCommand = require('../scripts/cmds/unsend');
const evalCommand = require('../scripts/cmds/eval');
const shellCommand = require('../scripts/cmds/shell');
const idCommand = require('../scripts/cmds/id');
const tidCommand = require('../scripts/cmds/tid');
const welcomeToggleCommand = require('../scripts/cmds/welcome');
const leaveToggleCommand = require('../scripts/cmds/leave');
const welcomeCommand = require('../scripts/events/welcome');
const addUserCommand = require('../scripts/cmds/adduser');
const removeUserCommand = require('../scripts/cmds/removeuser');
const { extractImageUrl, findReplyTarget } = require('../scripts/utils/reply');

const logger = { debug() {}, info() {}, warn() {}, error() {} };

function makeStore() {
  return {
    getPrefix: () => '!',
    isMuted: () => false,
    recordCommand() {},
    stats: () => ({})
  };
}

function makeConfig(overrides = {}) {
  return {
    ownerId: 'owner',
    adminIds: new Set(['admin']),
    allowThreadAdmins: true,
    allowedThreads: new Set(),
    blockedThreads: new Set(),
    prefix: '!',
    autoReply: false,
    botName: 'Test Bot',
    commandCooldownMs: 0,
    maxHandlerEntries: 20,
    maxCooldownEntries: 20,
    maxTrackedThreads: 20,
    ...overrides
  };
}

test('loader preserves authors, accepts event hooks, and rejects collisions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'insta-command-loader-'));
  fs.writeFileSync(path.join(root, 'custom.js'), `module.exports = {
    config: { name: 'custom', aliases: ['c'], author: 'Contributor' },
    onChat() {}
  };`);
  const loaded = loadCommands(root, logger, { author: 'Project Author' });
  assert.equal(loaded.commands.get('custom').config.author, 'Contributor');
  assert.equal(loaded.aliases.get('c'), 'custom');

  fs.writeFileSync(path.join(root, 'collision.js'), `module.exports = {
    config: { name: 'other', aliases: ['c'] },
    onStart() {}
  };`);
  assert.throws(() => loadCommands(root, logger), /Duplicate command alias/);
});

test('loader can persistently exclude unloaded command files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'insta-command-unload-'));
  fs.writeFileSync(path.join(root, 'kept.js'), `module.exports = { config: { name: 'kept' }, onStart() {} };`);
  fs.writeFileSync(path.join(root, 'hidden.js'), `module.exports = { config: { name: 'hidden' }, onStart() {} };`);
  const loaded = loadCommands(root, logger, {}, { excludedFiles: ['hidden.js'] });
  assert.equal(loaded.commands.has('kept'), true);
  assert.equal(loaded.commands.has('hidden'), false);
});

test('loader accepts roles from user through owner and rejects invalid values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'insta-command-roles-'));
  fs.writeFileSync(path.join(root, 'valid.js'), `module.exports = { config: { name: 'valid', role: 3 }, onStart() {} };`);
  assert.equal(loadCommands(root, logger).commands.get('valid').config.role, 3);

  fs.writeFileSync(path.join(root, 'invalid.js'), `module.exports = { config: { name: 'invalid', role: 4 }, onStart() {} };`);
  assert.throws(() => loadCommands(root, logger), /Invalid role/);
});

test('router dispatches commands with context-bound global functions and roles', async () => {
  const sent = [];
  const api = {
    sendMessage: async (content, threadID) => { sent.push({ content, threadID }); },
    replyToMessage: async () => {},
    getHealth: () => ({ connected: true }),
    getThreadInfo: async () => ({})
  };
  const commands = new Map([
    ['whoami', {
      config: { name: 'whoami', aliases: [], role: { onStart: 1 }, cooldown: 0, allowWhenMuted: false },
      async onStart(context) {
        assert.equal(context.roleName, 'bot admin');
        assert.equal(typeof context.functions.getHealth, 'function');
        await context.message.reply(`role=${context.roleName}`);
      }
    }]
  ]);
  const router = new CommandRouter({
    api,
    config: makeConfig(),
    store: makeStore(),
    commands,
    aliases: new Map(),
    logger
  });

  await router.handle({ type: 'message', threadID: 'thread', senderID: 'owner', body: '!whoami' });
  await router.handle({ type: 'message', threadID: 'thread', senderID: 'admin', body: '!whoami' });
  await router.handle({
    type: 'message',
    threadID: 'thread',
    senderID: 'group-admin',
    isGroup: true,
    threadAdminIDs: ['group-admin'],
    body: '!whoami'
  });
  assert.deepEqual(sent, [
    { content: 'role=owner', threadID: 'thread' },
    { content: 'role=bot admin', threadID: 'thread' },
    { content: 'role=group admin', threadID: 'thread' }
  ]);

  await router.handle({ type: 'message', threadID: 'thread', senderID: 'user', body: '!whoami' });
  assert.equal(sent.length, 4);
  assert.equal(sent[3].content, 'Only group administrators can use this command.');
});

test('owner eval supports the out helper and shell commands are owner-only', async () => {
  const sent = [];
  const router = new CommandRouter({
    api: { sendMessage: async (content) => sent.push(content) },
    config: makeConfig(),
    store: makeStore(),
    commands: new Map([
      ['eval', evalCommand],
      ['shell', shellCommand]
    ]),
    aliases: new Map([['sh', 'shell']]),
    logger
  });

  await router.handle({ type: 'message', threadID: 'thread', senderID: 'owner', body: '!eval out("hi")' });
  await router.handle({ type: 'message', threadID: 'thread', senderID: 'user', body: '!eval 3 + 4' });

  assert.deepEqual(sent, ['hi', 'Only the bot owner can use this command.']);
  assert.equal(shellCommand.config.role, 3);
});

test('router supports command onChat and onReply hooks', async () => {
  const sent = [];
  const api = {
    sendMessage: async (content, threadID) => { sent.push({ content, threadID }); },
    replyToMessage: async (threadID, content) => { sent.push({ content, threadID }); },
    getHealth: () => ({})
  };
  const commands = new Map([
    ['watch', {
      config: { name: 'watch', aliases: [], role: 0, cooldown: 0 },
      async onStart({ message }) { message.setReply(); return message.reply('send the next value'); },
      async onReply({ args, message }) { return message.reply(`value=${args[0]}`); },
      async onChat({ body, message }) { if (body === 'status?') return message.reply('ok'); }
    }]
  ]);
  const router = new CommandRouter({
    api,
    config: makeConfig(),
    store: makeStore(),
    commands,
    aliases: new Map(),
    logger
  });

  await router.handle({ type: 'message', threadID: 'thread', senderID: 'user', messageID: 'm1', body: '!watch' });
  await router.handle({ type: 'message', threadID: 'thread', senderID: 'user', replyTo: 'm1', messageID: 'm2', body: 'next' });
  await router.handle({ type: 'message', threadID: 'thread', senderID: 'user', body: 'status?' });
  assert.deepEqual(sent.map((item) => item.content), ['send the next value', 'value=next', 'ok']);
});

test('event loader accepts event modules', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'insta-event-loader-'));
  fs.writeFileSync(path.join(root, 'welcome.js'), `module.exports = {
    config: { name: 'welcome', author: 'Neoaz 🐊' },
    onStart() {}
  };`);
  const loaded = loadEventCommands(root, logger);
  assert.equal(loaded.commands.get('welcome').config.author, 'Neoaz 🐊');
});

test('router dispatches onAnyEvent and event commands', async () => {
  const sent = [];
  const api = { sendMessage: async (content) => sent.push(content), getHealth: () => ({}) };
  const commands = new Map([['audit', {
    config: { name: 'audit', aliases: [], role: 0, cooldown: 0 },
    async onAnyEvent({ logger }) { logger.debug('audit'); }
  }]]);
  const eventCommands = new Map([['welcome', {
    config: { name: 'welcome', aliases: [], role: 0 },
    async onStart({ message }) { await message.send('event handled'); }
  }]]);
  const router = new CommandRouter({
    api,
    config: makeConfig(),
    store: makeStore(),
    commands,
    aliases: new Map(),
    eventCommands,
    handlerEvents: createHandlerEvents(commands, eventCommands),
    logger
  });

  await router.handle({ type: 'event', threadID: 'thread', senderID: 'user' });
  assert.deepEqual(sent, ['event handled']);
});

test('normalizes reaction events to the message being reacted to', () => {
  const result = normalizeEvent(null, {
    type: 'message_reaction',
    threadID: 'thread',
    messageID: 'reaction-item',
    targetMessageID: 'target-message',
    reactionMessageID: 'reaction-item',
    reaction: '❤️',
    reactionStatus: 'created'
  });

  assert.equal(result.event.messageID, 'target-message');
  assert.equal(result.event.reactionMessageID, 'reaction-item');
  assert.equal(result.event.reactionStatus, 'created');
});

test('routes created reactions and ignores deleted reaction updates', async () => {
  let calls = 0;
  const command = {
    config: { name: 'watch', aliases: [], role: 0, cooldown: 0 },
    async onReaction() { calls += 1; }
  };
  const router = new CommandRouter({
    api: {},
    config: makeConfig(),
    store: makeStore(),
    commands: new Map([['watch', command]]),
    aliases: new Map(),
    logger
  });
  router.reactionHandlers.set('target-message', {
    commandName: 'watch',
    expiresAt: Date.now() + 60_000
  });

  await router.handle({
    type: 'message_reaction',
    threadID: 'thread',
    senderID: 'user',
    messageID: 'target-message',
    reaction: '❤️',
    reactionStatus: 'deleted'
  });
  await router.handle({
    type: 'message_reaction',
    threadID: 'thread',
    senderID: 'user',
    messageID: 'target-message',
    reaction: '❤️',
    reactionStatus: 'created'
  });

  assert.equal(calls, 1);
});

test('normalizes reply targets from realtime payload aliases', () => {
  const result = normalizeEvent(null, {
    type: 'message',
    thread_id: 'thread',
    itemID: 'message-current',
    replied_to_item_id: 'message-bot'
  });

  assert.equal(result.event.threadID, 'thread');
  assert.equal(result.event.messageID, 'message-current');
  assert.equal(result.event.replyTo, 'message-bot');
});

test('unsend command targets the message being replied to', async () => {
  let call;
  let confirmation;

  await unsendCommand.onStart({
    api: {
      unsendMessage: async (...args) => {
        call = args;
        return true;
      }
    },
    args: [],
    event: { replyTo: 'message-bot' },
    message: { send: async (content) => { confirmation = content; } },
    threadID: 'thread'
  });

  assert.deepEqual(call, ['message-bot', 'thread']);
  assert.equal(confirmation, undefined);
});

test('allows regular users to unsend by replying to a bot message', async () => {
  const removed = [];
  const replies = [];
  const router = new CommandRouter({
    api: {
      unsendMessage: async (...args) => removed.push(args),
      replyToMessage: async () => {},
      sendMessage: async (...args) => replies.push(args)
    },
    config: makeConfig(),
    store: makeStore(),
    commands: new Map([['unsend', unsendCommand]]),
    aliases: new Map(),
    logger
  });

  await router.handle({
    type: 'message',
    threadID: 'thread',
    senderID: 'user',
    messageID: 'command-message',
    replyTo: 'bot-message',
    body: '!unsend'
  });

  assert.deepEqual(removed, [['bot-message', 'thread']]);
  assert.deepEqual(replies, []);
});

test('admin anger reactions silently unsend cached bot text', async () => {
  const removed = [];
  const router = new CommandRouter({
    api: {
      getCurrentUserID: () => ({ userID: 'bot' }),
      unsendMessage: async () => { throw new Error('slow fallback should not run'); },
      unsendMessageFast: async (...args) => removed.push(args)
    },
    config: makeConfig(),
    store: {
      ...makeStore(),
      getHistory: () => [{ messageID: 'bot-message', senderID: 'bot', body: 'bad', itemType: 'text' }]
    },
    commands: new Map(),
    aliases: new Map(),
    logger
  });

  const handled = await router.handle({
    type: 'message_reaction',
    threadID: 'thread',
    senderID: 'admin',
    messageID: 'bot-message',
    targetMessageID: 'bot-message',
    reaction: '😠',
    reactionStatus: 'created'
  });

  assert.equal(handled, true);
  assert.deepEqual(removed, [['bot-message', 'thread']]);
});

test('anger reactions do not unsend non-admin messages', async () => {
  const removed = [];
  const router = new CommandRouter({
    api: {
      getCurrentUserID: () => 'bot',
      unsendMessage: async (...args) => removed.push(args)
    },
    config: makeConfig(),
    store: {
      ...makeStore(),
      getHistory: () => [{ messageID: 'bot-media', senderID: 'bot', body: '', itemType: 'media' }]
    },
    commands: new Map(),
    aliases: new Map(),
    logger
  });

  await router.handle({
    type: 'message_reaction',
    threadID: 'thread',
    senderID: 'user',
    messageID: 'bot-media',
    targetMessageID: 'bot-media',
    reaction: '😡',
    reactionStatus: 'created'
  });

  assert.deepEqual(removed, []);
});

test('admin anger reactions unsend cached bot media', async () => {
  const removed = [];
  const router = new CommandRouter({
    api: {
      getCurrentUserID: () => 'bot',
      unsendMessage: async (...args) => removed.push(args)
    },
    config: makeConfig(),
    store: {
      ...makeStore(),
      getHistory: () => [{ messageID: 'bot-media', senderID: 'bot', itemType: 'media' }]
    },
    commands: new Map(),
    aliases: new Map(),
    logger
  });

  await router.handle({
    type: 'message_reaction',
    threadID: 'thread',
    senderID: 'admin',
    messageID: 'bot-media',
    targetMessageID: 'bot-media',
    reaction: '😡',
    reactionStatus: 'created'
  });

  assert.deepEqual(removed, [['bot-media', 'thread']]);
});

test('explicit commands take priority over temporary reply handlers', async () => {
  let removed;
  const router = new CommandRouter({
    api: {
      unsendMessage: async (...args) => { removed = args; },
      replyToMessage: async () => {},
      sendMessage: async () => {}
    },
    config: makeConfig(),
    store: makeStore(),
    commands: new Map([['unsend', unsendCommand]]),
    aliases: new Map(),
    logger
  });
  router.replyHandlers.set('bot-message', {
    commandName: 'echo',
    handler: async () => { throw new Error('reply handler should not run'); },
    senderID: 'user',
    expiresAt: Date.now() + 60_000
  });

  await router.handle({
    type: 'message',
    threadID: 'thread',
    senderID: 'user',
    messageID: 'command-message',
    replyTo: 'bot-message',
    body: '!unsend'
  });

  assert.deepEqual(removed, ['bot-message', 'thread']);
});

test('commands marked prefixless can run without the configured prefix', async () => {
  const sent = [];
  const router = new CommandRouter({
    api: { sendMessage: async (content, threadID) => sent.push({ content, threadID }) },
    config: makeConfig(),
    store: makeStore(),
    commands: new Map([['prefix', {
      config: { name: 'prefix', aliases: [], prefixless: true, role: 0 },
      async onStart({ args, message }) { await message.send(`args=${args.join(',')}`); }
    }]]),
    aliases: new Map(),
    logger
  });

  await router.handle({ type: 'message', threadID: 'thread', senderID: 'user', body: 'prefix #' });
  assert.deepEqual(sent, [{ content: 'args=#', threadID: 'thread' }]);
});

test('id and tid return focused identifiers', async () => {
  const replies = [];
  const message = { reply: async (content) => replies.push(content) };
  await idCommand.onStart({ api: {}, args: [], event: {}, message, senderID: 'user-1', threadID: 'thread-1' });
  await tidCommand.onStart({ message, threadID: 'thread-1' });
  assert.deepEqual(replies, ['Your ID: user-1', 'Thread ID: thread-1']);
});

test('id resolves a mentioned user and a replied message owner', async () => {
  const replies = [];
  const message = { reply: async (content) => replies.push(content) };
  await idCommand.onStart({
    api: { getUserInfoByUsername: async () => ({ username: '__neo.nnn', userID: '42' }) },
    args: ['@__neo.nnn'],
    event: {},
    message,
    threadID: 'thread-1'
  });
  await idCommand.onStart({
    api: {
      getMessagesAround: async () => [{ messageID: 'target', senderID: '42' }],
      getUserInfo: async () => ({ username: '__neo.nnn', userID: '42' })
    },
    args: [],
    event: { replyTo: 'target' },
    message,
    threadID: 'thread-1'
  });
  assert.deepEqual(replies, [
    'User ID of __neo.nnn: 42',
    'User ID of __neo.nnn: 42'
  ]);
});

test('id resolves a reply target from nested sender data and history fallback', async () => {
  const replies = [];
  const message = { reply: async (content) => replies.push(content) };
  await idCommand.onStart({
    api: {
      getMessagesAround: async () => { throw new Error('target not in recent window'); },
      getThreadHistory: async () => ({ items: [{ item_id: 'target', sender: { pk: '42', username: 'alice' } }] })
    },
    args: [],
    event: { replyTo: 'target' },
    message,
    threadID: 'thread-1'
  });

  assert.deepEqual(replies, ['User ID of alice: 42']);
});

test('reply target resolver returns image attachments for image editing', async () => {
  const target = await findReplyTarget({
    getMessagesAround: async () => [{
      messageID: 'image-1',
      attachments: [{ type: 'photo', url: 'https://cdn.example/image.jpg' }]
    }]
  }, { replyTo: 'image-1' }, 'thread-1');

  assert.equal(extractImageUrl(target), 'https://cdn.example/image.jpg');
});

test('unknown commands suggest the closest command using the current prefix', async () => {
  const sent = [];
  const commands = new Map([
    ['id', { config: { name: 'id', aliases: [], role: 0 } }],
    ['stats', { config: { name: 'stats', aliases: [], role: 0 } }]
  ]);
  const router = new CommandRouter({
    api: { sendMessage: async (content) => sent.push(content) },
    config: makeConfig(),
    store: makeStore(),
    commands,
    aliases: new Map(),
    logger
  });
  await router.handle({ type: 'message', threadID: 'thread', senderID: 'user', body: '!od' });
  assert.match(sent[0], /Did you mean: !id\?/);
  assert.match(sent[0], /Use !help/);
});

test('welcome event announces joins and departures', async () => {
  const replies = [];
  const message = { send: async (content) => replies.push(content) };
  const context = {
    config: { welcomeMessages: true },
    message,
    event: { isGroup: true, updateType: 'add_users', addedParticipants: [{ username: 'new_user' }] }
  };
  await welcomeCommand.onStart(context);
  await welcomeCommand.onStart({
    ...context,
    event: { isGroup: true, updateType: 'remove_users', removedParticipants: [{ username: 'old_user' }] }
  });
  assert.deepEqual(replies, [
    'Welcome to the group, new_user.',
    'old_user left the group.'
  ]);
});

test('welcome and leave commands toggle their thread settings', async () => {
  const replies = [];
  const settings = { welcome: false, leave: false };
  const store = {
    getWelcome: () => settings.welcome,
    setWelcome: (_threadID, value) => { settings.welcome = value; },
    getLeave: () => settings.leave,
    setLeave: (_threadID, value) => { settings.leave = value; }
  };
  const message = { reply: async (content) => replies.push(content) };

  await welcomeToggleCommand.onStart({ args: ['on'], message, store, threadID: 'thread' });
  await leaveToggleCommand.onStart({ args: ['off'], message, store, threadID: 'thread' });
  assert.equal(settings.welcome, true);
  assert.equal(settings.leave, false);
  assert.deepEqual(replies, [
    'Welcome messages turned on for this group.',
    'Leave messages turned off for this group.'
  ]);
});

test('participant commands resolve usernames and forward user IDs', async () => {
  const replies = [];
  const added = [];
  const removed = [];
  const api = {
    getUserInfoByUsername: async (username) => ({ username, userID: username === 'alice' ? '42' : '84' }),
    addUsersToThread: async (threadID, userIDs) => added.push([threadID, userIDs]),
    removeUsersFromThread: async (threadID, userIDs) => removed.push([threadID, userIDs])
  };
  const message = { reply: async (content) => replies.push(content) };

  await addUserCommand.onStart({ api, args: ['@alice', '84'], message, threadID: 'thread' });
  await removeUserCommand.onStart({ api, args: ['@alice'], message, threadID: 'thread' });

  assert.deepEqual(added, [['thread', ['42', '84']]]);
  assert.deepEqual(removed, [['thread', ['42']]]);
  assert.deepEqual(replies, [
    'Added 2 users to the group.',
    'Removed 1 user from the group.'
  ]);
});

test('login module exposes the cookie-to-API login function', () => {
  const source = fs.readFileSync(path.join(__dirname, '../bot/login/login.js'), 'utf8');
  assert.match(source, /@lazyneoaz\/insta-chat-client/);
  assert.match(source, /config\.accountFile/);
});

test('language resources provide friendly fallback messages', () => {
  const getLang = loadLanguage(path.join(__dirname, '../scripts/langs'), 'en', logger);
  assert.equal(
    getLang('system.ready', 'fallback', { prefix: '!' }),
    'Ready. Use !help to see what I can do.'
  );
  assert.equal(getLang('missing.key', 'fallback'), 'fallback');
});

test('routes realtime event variants through the event pipeline', () => {
  const result = normalizeEvent(null, {
    type: 'typ',
    threadID: 'thread',
    from: 'user',
    isTyping: true
  });

  assert.equal(result.event.type, 'event');
  assert.equal(result.event.eventType, 'typ');
  assert.equal(result.event.senderID, 'user');
});

test('normalizes raw participant update aliases for welcome events', () => {
  const result = normalizeEvent(null, {
    type: 'thread_update',
    thread_id: 'group:thread',
    update_type: 'add_users',
    added_users: [{ pk: '42', username: 'alice' }]
  });

  assert.equal(result.event.type, 'event');
  assert.equal(result.event.isGroup, true);
  assert.equal(result.event.updateType, 'add_users');
  assert.deepEqual(result.event.addedParticipants, [{ pk: '42', username: 'alice' }]);
});

test('normalizes sanitized Instagram XMAT membership events', async () => {
  const result = normalizeEvent(null, {
    type: 'thread_update',
    eventType: 'thread_update',
    threadID: 'group-1',
    updateType: 'ADD_PARTICIPANT_XMAT',
    action: 'join',
    isGroup: true,
    addedParticipants: [{ username: 'mahin_abid_777' }]
  });
  const replies = [];

  assert.equal(result.event.type, 'event');
  assert.equal(result.event.eventType, 'thread_update');
  assert.equal(result.event.action, 'join');
  await welcomeCommand.onStart({
    config: { welcomeMessages: true },
    event: result.event,
    message: { send: async (content) => replies.push(content) }
  });
  assert.deepEqual(replies, ['Welcome to the group, mahin_abid_777.']);
});

test('does not run any-event hooks for blocked threads', async () => {
  let calls = 0;
  const commands = new Map([['audit', {
    config: { name: 'audit', aliases: [], role: 0, cooldown: 0 },
    async onAnyEvent() { calls += 1; }
  }]]);
  const config = makeConfig({ blockedThreads: new Set(['blocked']) });
  const router = new CommandRouter({
    api: { getHealth: () => ({}) },
    config,
    store: makeStore(),
    commands,
    aliases: new Map(),
    handlerEvents: createHandlerEvents(commands, new Map()),
    logger
  });

  await router.handle({ type: 'event', threadID: 'blocked', senderID: 'user' });
  assert.equal(calls, 0);
});
