'use strict';

const { createClient } = require('@lazyneoaz/insta-chat-client');

async function login({ config }) {
  if (!config.chatApi.url || !config.chatApi.token) {
    throw new Error('Chat API settings are missing. Set CHAT_API_URL and CHAT_API_TOKEN.');
  }
  return createClient({
    baseUrl: config.chatApi.url,
    token: config.chatApi.token,
    timeoutMs: config.chatApi.timeoutMs,
    reconnectDelayMs: config.chatApi.reconnectDelayMs
  });
}

module.exports = { login };
