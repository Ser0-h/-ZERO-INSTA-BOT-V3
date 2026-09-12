'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
global.utils = require('../src/global-utils').ensureGlobalUtils();
const effectCommand = require('../scripts/cmds/effect');
const musicCommand = require('../scripts/cmds/stickermusic');
const singCommand = require('../scripts/cmds/sing');
const alldlCommand = require('../scripts/cmds/alldl');
const cmdCommand = require('../scripts/cmds/cmd');
const uptimeCommand = require('../scripts/cmds/uptime');
const pfpCommand = require('../scripts/cmds/pfp');
const changeNameCommand = require('../scripts/cmds/changename');
const setProfileCommand = require('../scripts/cmds/setprofile');

test('effect command sends the selected effect and reports success', async () => {
  const calls = [];
  const replies = [];
  await effectCommand.onStart({
    api: { sendEffects: async (...args) => { calls.push(args); return { effect: 'gift' }; } },
    args: ['gift', 'hello'],
    message: { reply: async (text) => replies.push(text) },
    threadID: '123456789'
  });

  assert.deepEqual(calls, [['123456789', 'hello', 'gift']]);
  assert.deepEqual(replies, ['✅ Effect sent: gift.']);
});

test('stickermusic command uses the query and exposes the sm alias', async () => {
  const calls = [];
  const replies = [];
  await musicCommand.onStart({
    api: { stickerMusic: async (...args) => { calls.push(args); return { track: { title: 'Song', artist: 'Artist' } }; } },
    args: ['some', 'song'],
    message: { reply: async (text) => replies.push(text) },
    threadID: '123456789'
  });

  assert.deepEqual(musicCommand.config.aliases, ['sm']);
  assert.deepEqual(calls, [['123456789', 'some song']]);
  assert.deepEqual(replies, ['✅ Music sticker sent: Song by Artist.']);
});

test('sing searches Instagram music and sends its direct audio URL', async () => {
  const calls = [];
  const replies = [];
  await singCommand.onStart({
    api: {
      stickerMusic: async (...args) => {
        calls.push(['search', ...args]);
        return { track: { title: 'Song', audioURL: 'https://i.instagram.com/audio/full.m4a' } };
      },
      sendVoiceFromUrl: async (...args) => calls.push(['voice', ...args])
    },
    args: ['some', 'song'],
    event: { messageID: 'message-1' },
    message: { reply: async (text) => replies.push(text) },
    threadID: '123456789'
  });

  assert.deepEqual(calls, [
    ['search', '123456789', 'some song', { send: false, initialize: false }],
    ['voice', '123456789', 'https://i.instagram.com/audio/full.m4a', {
      title: 'Song',
      replyTo: 'message-1'
    }]
  ]);
  assert.deepEqual(replies, []);
});

test('alldl prefers an MP4 video and exposes download aliases', () => {
  const selected = alldlCommand.selectDownload([
    { url: 'https://cdn.example/audio.mp3', ext: 'mp3', label: 'audio' },
    { url: 'https://cdn.example/video-720.mp4', ext: 'mp4', label: '720p' }
  ]);

  assert.equal(alldlCommand.config.name, 'alldl');
  assert.deepEqual(alldlCommand.config.aliases, ['dl', 'download']);
  assert.equal(selected.url, 'https://cdn.example/video-720.mp4');
  assert.equal(alldlCommand.mediaKind(selected), 'video');
  assert.equal(
    alldlCommand.extractUrl([], '!alldl https://www.youtube.com/watch?v=demo.'),
    'https://www.youtube.com/watch?v=demo'
  );
});

test('alldl supports audio-only results from the downloader API', () => {
  const selected = alldlCommand.selectDownload([
    { url: 'https://cdn.example/audio.m4a', ext: 'm4a', mime: 'audio/mp4' }
  ]);

  assert.equal(selected.url, 'https://cdn.example/audio.m4a');
  assert.equal(alldlCommand.mediaKind(selected), 'audio');
});

test('alldl uses the API media type when download labels are generic', () => {
  const selected = alldlCommand.selectDownload([
    { url: 'https://cdn.example/video-720', label: '720p' }
  ], 'video');

  assert.equal(alldlCommand.mediaKind(selected, 'video'), 'video');
});

test('uptime command reports the reference system fields', () => {
  const report = uptimeCommand.buildReport({ timestamp: Date.now() }, { getHealth: () => ({ connected: true }) });
  assert.match(report, /SYSTEM UPTIME/);
  assert.match(report, /RAM Usage:/);
  assert.match(report, /CPU Load:/);
  assert.match(report, /Node\.js:/);
  assert.match(report, /Status: online/);
});

test('cmd installer validates file names and normalizes source URLs', () => {
  assert.equal(cmdCommand.normalizeFileName('hello.js'), 'hello.js');
  assert.equal(cmdCommand.normalizeFileName('../hello.js'), null);
  assert.equal(
    cmdCommand.normalizeURL('https://github.com/example/project/blob/main/scripts/test.js'),
    'https://raw.githubusercontent.com/example/project/main/scripts/test.js'
  );
  assert.equal(
    cmdCommand.extractInlineCode('!cmd install sample.js module.exports = { config: { name: "sample" }, onStart() {} };', 'sample.js'),
    'module.exports = { config: { name: "sample" }, onStart() {} };'
  );
});

test('pfp sends a profile picture selected by user ID', async () => {
  const calls = [];
  await pfpCommand.onStart({
    api: {
      getUserInfo: async () => ({ userID: '42', username: 'alice', profilePicUrl: 'https://cdn.example/alice.jpg' }),
      sendPhotoFromUrl: async (...args) => calls.push(args)
    },
    args: ['42'],
    event: { messageID: 'command-1' },
    message: { reply: async () => { throw new Error('unexpected reply'); } },
    senderID: 'sender-1',
    threadID: 'thread-1'
  });

  assert.deepEqual(calls, [[
    'thread-1',
    'https://cdn.example/alice.jpg',
    { replyTo: 'command-1' }
  ]]);
});

test('pfp resolves a username mention and a replied message owner', async () => {
  const calls = [];
  const api = {
    getUserInfoByUsername: async (username) => ({ userID: '43', username, profilePicUrl: 'https://cdn.example/bob.jpg' }),
    getMessagesAround: async () => [{ messageID: 'quoted-1', sender: { pk: '44', username: 'carol' } }],
    getUserInfo: async (userID) => ({ userID, username: 'carol', profilePicUrl: 'https://cdn.example/carol.jpg' }),
    sendPhotoFromUrl: async (...args) => calls.push(args)
  };

  await pfpCommand.onStart({
    api,
    args: [],
    event: { mentions: { bob: [0, 4] }, messageID: 'command-2' },
    message: { reply: async () => { throw new Error('unexpected reply'); } },
    senderID: 'sender-1',
    threadID: 'thread-1'
  });
  await pfpCommand.onStart({
    api,
    args: [],
    event: { replyTo: 'quoted-1', messageID: 'command-3' },
    message: { reply: async () => { throw new Error('unexpected reply'); } },
    senderID: 'sender-1',
    threadID: 'thread-1'
  });

  assert.deepEqual(calls, [
    ['thread-1', 'https://cdn.example/bob.jpg', { replyTo: 'command-2' }],
    ['thread-1', 'https://cdn.example/carol.jpg', { replyTo: 'command-3' }]
  ]);
});

test('changename updates the current group title', async () => {
  const calls = [];
  const replies = [];
  await changeNameCommand.onStart({
    api: { changeThreadTitle: async (...args) => { calls.push(args); return { success: true }; } },
    args: ['Nerds', 'United'],
    message: { reply: async (text) => replies.push(text) },
    threadID: 'thread-1'
  });

  assert.deepEqual(calls, [['thread-1', 'Nerds United']]);
  assert.deepEqual(replies, ['Group name changed to "Nerds United".']);
});

test('setprofile updates the bot profile from a URL or a replied image', async () => {
  const calls = [];
  const replies = [];
  const api = {
    setProfilePicture: async (url) => { calls.push(url); return { success: true }; },
    getMessagesAround: async () => [{ messageID: 'image-1', attachments: [{ type: 'photo', url: 'https://cdn.example/reply.jpg' }] }]
  };

  await setProfileCommand.onStart({
    api,
    args: ['https://cdn.example/url.jpg'],
    event: { messageID: 'command-1' },
    message: { reply: async (text) => replies.push(text) },
    threadID: 'thread-1'
  });
  await setProfileCommand.onStart({
    api,
    args: [],
    event: { replyTo: 'image-1', messageID: 'command-2' },
    message: { reply: async (text) => replies.push(text) },
    threadID: 'thread-1'
  });

  assert.deepEqual(calls, ['https://cdn.example/url.jpg', 'https://cdn.example/reply.jpg']);
  assert.deepEqual(replies, ['Profile picture updated.', 'Profile picture updated.']);
});
