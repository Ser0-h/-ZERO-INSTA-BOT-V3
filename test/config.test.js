'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { loadConfig } = require('../src/config');

test('loads bot settings from config.json', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'insta-bot-config-'));
  fs.writeFileSync(path.join(rootDir, 'config.json'), JSON.stringify({
    botName: 'Test Bot',
    prefix: '?',
    adminIds: ['123', '456'],
    ownerId: '789',
    autoReply: true,
    accountFile: './cookies.txt',
    sessionFile: './data/custom-session.json'
  }));

  const config = loadConfig(rootDir);

  assert.equal(config.botName, 'Test Bot');
  assert.equal(config.prefix, '?');
  assert.deepEqual([...config.adminIds], ['123', '456']);
  assert.equal(config.ownerId, '789');
  assert.equal(config.autoReply, true);
  assert.equal(config.accountFile, path.join(rootDir, 'cookies.txt'));
  assert.equal(config.sessionFile, path.join(rootDir, 'data/custom-session.json'));
  assert.equal(config.allowThreadAdmins, true);
  assert.equal(config.maxHandlerEntries, 2000);
  assert.equal(config.commandsPath, path.join(rootDir, 'scripts/cmds'));
  assert.equal(config.eventsPath, path.join(rootDir, 'scripts/events'));
});

test('requires config.json', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'insta-bot-config-'));
  assert.throws(() => loadConfig(rootDir), /Missing config\.json/);
});
