'use strict';

const fs = require('fs/promises');
const { createClient } = require('@lazyneoaz/insta-chat-client');
const { adaptClient } = require('../../src/api-adapter');

async function login({ config }) {
  let cookies;
  try {
    cookies = await fs.readFile(config.accountFile, 'utf8');
  } catch (error) {
    throw new Error(`Could not read Instagram cookie file ${config.accountFile}: ${error.message}`);
  }
  if (!cookies.trim()) throw new Error(`Instagram cookie file is empty: ${config.accountFile}`);

  if (!config.chatApi.url || !config.chatApi.token) {
    throw new Error('Chat API settings are missing. Set CHAT_API_URL and CHAT_API_TOKEN.');
  }
  return adaptClient(createClient({
    baseUrl: config.chatApi.url,
    token: config.chatApi.token,
    cookies,
    timeoutMs: config.chatApi.timeoutMs,
    reconnectDelayMs: config.chatApi.reconnectDelayMs,
    maxReconnectDelayMs: config.chatApi.maxRetryDelayMs,
    heartbeatIntervalMs: config.chatApi.heartbeatIntervalMs,
    heartbeatTimeoutMs: config.chatApi.heartbeatTimeoutMs
  }));
}

module.exports = { login };
