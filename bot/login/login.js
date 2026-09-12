'use strict';

const fs = require('fs/promises');
const nkxica = require('@neoaz07/nkxica');
const { adaptClient } = require('../../src/api-adapter');

async function login({ config }) {
  let cookies;
  try {
    cookies = await fs.readFile(config.accountFile, 'utf8');
  } catch (error) {
    throw new Error(`Could not read Instagram cookie file ${config.accountFile}: ${error.message}`);
  }
  if (!cookies.trim()) throw new Error(`Instagram cookie file is empty: ${config.accountFile}`);

  const client = await nkxica(cookies, {
    sessionFile: config.sessionFile,
    autoSaveSession: true,
    logLevel: config.logLevel
  });
  return adaptClient(client);
}

module.exports = { login };
