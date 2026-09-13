'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { login, findMissingCookies, REQUIRED_COOKIES } = require('../bot/login/login');

function tmpCookieFile(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'instabot-cookie-'));
  const file = path.join(dir, 'account.txt');
  fs.writeFileSync(file, contents);
  return { file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const FULL_NETSCAPE = [
  '# Netscape HTTP Cookie File',
  '.instagram.com\tTRUE\t/\tTRUE\t9999999999\tsessionid\tABC',
  '.instagram.com\tTRUE\t/\tTRUE\t9999999999\tds_user_id\t123',
  '.instagram.com\tTRUE\t/\tTRUE\t9999999999\tcsrftoken\tXYZ',
  ''
].join('\n');

test('findMissingCookies accepts Netscape, header and JSON exports', () => {
  assert.deepEqual(findMissingCookies(FULL_NETSCAPE), []);
  assert.deepEqual(findMissingCookies('sessionid=A; ds_user_id=1; csrftoken=X'), []);
  assert.deepEqual(
    findMissingCookies(JSON.stringify([{ name: 'sessionid', value: 'A' }, { name: 'ds_user_id', value: '1' }, { name: 'csrftoken', value: 'X' }])),
    []
  );
  assert.deepEqual(findMissingCookies(JSON.stringify({ sessionid: 'A', ds_user_id: '1', csrftoken: 'X' })), []);
});

test('findMissingCookies reports the specific missing required cookies', () => {
  assert.deepEqual(findMissingCookies('csrftoken=X'), ['sessionid', 'ds_user_id']);
  assert.deepEqual(findMissingCookies('not a cookie file'), REQUIRED_COOKIES);
  assert.deepEqual(findMissingCookies('#HttpOnly_.instagram.com\tTRUE\t/\tTRUE\t9999999999\tsessionid\tA'), ['ds_user_id', 'csrftoken']);
});

test('login rejects a malformed cookie file before contacting the provider', async () => {
  const { file, cleanup } = tmpCookieFile('this is not a cookie file at all');
  try {
    await assert.rejects(
      login({ config: { accountFile: file, chatApi: { url: 'https://example.com', token: 'x'.repeat(40) } } }),
      /missing required cookie\(s\)/
    );
  } finally {
    cleanup();
  }
});

test('login rejects an empty cookie file with a clear message', async () => {
  const { file, cleanup } = tmpCookieFile('   \n');
  try {
    await assert.rejects(
      login({ config: { accountFile: file, chatApi: { url: 'https://example.com', token: 'x'.repeat(40) } } }),
      /empty/
    );
  } finally {
    cleanup();
  }
});

test('login reports a missing cookie file path', async () => {
  await assert.rejects(
    login({ config: { accountFile: '/nonexistent/account.txt', chatApi: { url: 'https://example.com', token: 'x'.repeat(40) } } }),
    /Could not read Instagram cookie file/
  );
});

test('login rejects incomplete Chat API settings before connecting', async () => {
  const { file, cleanup } = tmpCookieFile(FULL_NETSCAPE);
  try {
    await assert.rejects(
      login({ config: { accountFile: file, chatApi: { url: '', token: '' } } }),
      /Chat API settings are missing/
    );
  } finally {
    cleanup();
  }
});
