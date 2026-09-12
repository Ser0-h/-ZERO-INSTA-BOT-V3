'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const globalFunctions = require('../func/global-functions');
const { createGlobalUtils } = require('../src/global-utils');
const { CommandRouter } = require('../src/command-router');
const { createHandlerEvents } = require('../bot/handler/handlerEvents');

test('getType reports the constructor name like Goatbot', () => {
  assert.equal(globalFunctions.getType([]), 'Array');
  assert.equal(globalFunctions.getType({}), 'Object');
  assert.equal(globalFunctions.getType('x'), 'String');
  assert.equal(globalFunctions.getType(1), 'Number');
  assert.equal(globalFunctions.getType(null), 'Null');
});

test('isNumber accepts numeric strings and rejects NaN', () => {
  assert.equal(globalFunctions.isNumber('3.5'), true);
  assert.equal(globalFunctions.isNumber(''), false);
  assert.equal(globalFunctions.isNumber('abc'), false);
});

test('random helpers stay inside their contracts', () => {
  assert.equal(globalFunctions.randomString(8).length, 8);
  assert.equal(globalFunctions.randomString(6, true, 'abc').length, 6);
  assert.match(globalFunctions.randomString(20), /^[A-Za-z0-9]+$/);
  assert.ok(globalFunctions.randomNumber(5) >= 0 && globalFunctions.randomNumber(5) <= 5);
  const bounded = globalFunctions.randomNumber(2, 4);
  assert.ok(bounded >= 2 && bounded <= 4);
});

test('convertTime formats durations with Goatbot replacements', () => {
  assert.equal(globalFunctions.convertTime(0), '0s');
  assert.equal(globalFunctions.convertTime(1000), '1s');
  assert.equal(globalFunctions.convertTime(3725000), '1h2m5s');
  assert.equal(globalFunctions.convertTime(90061000, 's', 'm', 'h', 'd'), '1d1h1m1s');
});

test('formatNumber localizes numbers and rejects non-numbers', () => {
  assert.equal(globalFunctions.formatNumber(1234567.89), '1,234,567.89');
  assert.throws(() => globalFunctions.formatNumber('abc'), /must be a number/);
});

test('extension helpers mirror Goatbot attachment and mime mapping', () => {
  assert.equal(globalFunctions.getExtFromAttachmentType('animated_image'), 'gif');
  assert.equal(globalFunctions.getExtFromAttachmentType('video'), 'mp4');
  assert.equal(globalFunctions.getExtFromAttachmentType('unknown'), 'txt');
  assert.equal(globalFunctions.getExtFromMimeType('image/gif; charset=utf-8'), 'gif');
  assert.equal(globalFunctions.getExtFromMimeType('application/x-nope'), 'unknow');
  assert.equal(globalFunctions.getExtFromUrl('https://cdn.example.com/a/photo.JPG?x=1'), 'jpg');
  assert.equal(globalFunctions.getExtFromUrl('https://example.com/noext'), 'noext');
  assert.throws(() => globalFunctions.getExtFromUrl(123), /must be a string/);
});

test('splitPage paginates like lodash chunk', () => {
  assert.deepEqual(globalFunctions.splitPage([1, 2, 3, 4, 5], 2), {
    totalPage: 3,
    allPage: [[1, 2], [3, 4], [5]]
  });
  assert.deepEqual(globalFunctions.splitPage([], 3), { totalPage: 0, allPage: [] });
});

test('getTime formats timestamps and defaults to now', () => {
  assert.equal(
    globalFunctions.getTime('2020-01-02T03:04:05Z', 'YYYY-MM-DD HH:mm:ss'),
    '2020-01-02 03:04:05'
  );
  assert.match(globalFunctions.getTime('2020-01-02T03:04:05Z'), /^2020-01-02T03:04:05/);
  assert.match(globalFunctions.getTime(), /^\d{4}-\d{2}-\d{2}T/);
});

test('isHexColor and colors.hex behave', () => {
  assert.equal(globalFunctions.isHexColor('#fff'), true);
  assert.equal(globalFunctions.isHexColor('#123456'), true);
  assert.equal(globalFunctions.isHexColor('red'), false);
  assert.equal(typeof globalFunctions.colors.hex('#00ff00'), 'function');
  assert.match(globalFunctions.colors.hex('#00ff00')('x'), /38;2;0;255;0/);
});

test('jsonStringifyColor renders nested values', () => {
  const rendered = globalFunctions.jsonStringifyColor({ a: 1, b: 'x' }, null, 2);
  assert.match(rendered, /"a"/);
  assert.match(rendered, /"b"/);
  assert.match(rendered, /\{/);
});

test('message() wires send/reply/unsend/reaction/err to the api', async () => {
  const calls = [];
  const api = {
    sendMessage: async (...args) => { calls.push(['sendMessage', ...args]); return { ok: true }; },
    unsendMessage: async (...args) => { calls.push(['unsendMessage', ...args]); },
    setMessageReaction: async (...args) => { calls.push(['setMessageReaction', ...args]); }
  };
  const botMessage = globalFunctions.message(api, { threadID: 't1', messageID: 'm1' });
  await botMessage.send('hi');
  await botMessage.reply('yo');
  await botMessage.unsend('m2');
  await botMessage.reaction('❤', 'm3');
  await botMessage.error(new Error('boom'));
  assert.deepEqual(calls[0], ['sendMessage', 'hi', 't1', undefined]);
  assert.deepEqual(calls[1], ['sendMessage', 'yo', 't1', undefined, 'm1']);
  assert.deepEqual(calls[2], ['unsendMessage', 'm2', undefined]);
  assert.deepEqual(calls[3], ['setMessageReaction', '❤', 'm3', undefined, true]);
  assert.equal(calls[4][0], 'sendMessage');
  assert.match(calls[4][1], /boom/);
});

test('getStreamFromURL returns a stream carrying a generated file name', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'image/gif');
    res.end(Buffer.from('GIF89a'));
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const stream = await globalFunctions.getStreamFromURL(`http://127.0.0.1:${port}/clip`);
    assert.equal(typeof stream._read, 'function');
    assert.match(stream.path, /\.gif$/);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), 'GIF89a');
  } finally {
    server.close();
  }
});

test('getStreamFromUrl is an alias of getStreamFromURL', () => {
  assert.equal(globalFunctions.getStreamFromUrl, globalFunctions.getStreamFromURL);
});

test('downloadFile writes bytes to disk', async () => {
  const server = http.createServer((req, res) => res.end(Buffer.from('hello world')));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'insta-dl-'));
  const target = path.join(dir, 'nested', 'file.txt');
  try {
    const written = await globalFunctions.downloadFile(`http://127.0.0.1:${port}/`, target);
    assert.equal(written, target);
    assert.equal(fs.readFileSync(target, 'utf8'), 'hello world');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('global.utils exposes the Goatbot global surface', () => {
  const utils = createGlobalUtils();
  for (const name of [
    'getStreamFromURL',
    'getStreamFromUrl',
    'getStreamsFromAttachment',
    'downloadFile',
    'getExtFromUrl',
    'getExtFromMimeType',
    'getExtFromAttachmentType',
    'getType',
    'isNumber',
    'isHexColor',
    'randomString',
    'randomNumber',
    'convertTime',
    'formatNumber',
    'splitPage',
    'getTime',
    'jsonStringifyColor',
    'removeHomeDir',
    'translate',
    'translateAPI',
    'shortenURL',
    'colors',
    'log',
    'message'
  ]) {
    assert.equal(typeof utils[name], typeof globalFunctions[name], `missing ${name}`);
  }
});

test('command and event contexts expose the Goatbot global functions', async () => {
  const captured = { command: null, event: null };
  const command = {
    config: { name: 'probe' },
    async onStart(context) { captured.command = context; },
    async onEvent(context) { captured.event = context; }
  };
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const store = {
    getPrefix: () => '!',
    isMuted: () => false,
    recordCommand() {},
    getHistory: () => []
  };
  const router = new CommandRouter({
    api: { sendMessage: async () => ({}), getCurrentUserID: async () => '1' },
    config: { ownerId: '1', adminIds: new Set(), allowThreadAdmins: true, prefix: '!', commandCooldownMs: 0, botName: 'Test', allowedThreads: new Set(), blockedThreads: new Set() },
    store,
    commands: new Map([['probe', command]]),
    aliases: new Map(),
    logger,
    language: null
  });
  router.setHandlerEvents(createHandlerEvents(router.commands, router.eventCommands));

  await router.handle({ type: 'message', threadID: 't1', senderID: 'u1', messageID: 'm1', body: '!probe' });
  assert.equal(typeof captured.command.functions.getStreamFromURL, 'function');
  assert.equal(typeof captured.command.functions.downloadFile, 'function');
  assert.equal(captured.command.utils, captured.command.functions);

  await router.handle({ type: 'event', threadID: 't1', senderID: 'u1', messageID: 'm2', isGroup: true });
  assert.equal(typeof captured.event.functions.getStreamFromURL, 'function');
  assert.equal(typeof captured.event.functions.colors.hex, 'function');
});

