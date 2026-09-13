'use strict';

const fs = require('fs/promises');
const { createClient } = require('@lazyneoaz/insta-chat-client');
const { adaptClient } = require('../../src/api-adapter');

// Cookies Instagram's private API actually needs. A file missing these is the
// usual cause of repeated failed logins, which is what gets accounts flagged, so
// we reject it here instead of forwarding bad credentials to the provider.
const REQUIRED_COOKIES = ['sessionid', 'ds_user_id', 'csrftoken'];

/**
 * Returns the names of required cookies missing from a cookie export. Accepts
 * Netscape cookies.txt, JSON (array or `{cookies: []}`), or `a=b; c=d` headers.
 */
function findMissingCookies(cookies) {
  const raw = String(cookies || '');
  const names = new Set();
  const add = (value) => {
    if (value === null || value === undefined) return;
    names.add(String(value).trim().toLowerCase());
  };

  // JSON: [{name|key, value}...] or {cookies: [...]}
  let parsed = null;
  if (raw.trim().startsWith('[') || raw.trim().startsWith('{')) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  if (parsed) {
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.cookies) ? parsed.cookies : [];
    for (const cookie of list) add(cookie?.name ?? cookie?.key);
    if (!list.length && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const key of Object.keys(parsed)) add(key);
    }
  } else {
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || (trimmed.startsWith('#') && !trimmed.startsWith('#HttpOnly_'))) continue;
      const cookieLine = trimmed.startsWith('#HttpOnly_') ? trimmed.slice('#HttpOnly_'.length) : trimmed;
      // Netscape cookies.txt: domain \t flag \t path \t secure \t expiry \t name \t value
      const tabParts = cookieLine.split('\t');
      if (tabParts.length >= 7) {
        add(tabParts[5]);
        continue;
      }
      // "name=value; name2=value2" header format
      for (const pair of cookieLine.split(';')) {
        const [name] = pair.split('=');
        if (name && pair.includes('=')) add(name);
      }
    }
  }

  return REQUIRED_COOKIES.filter((name) => !names.has(name));
}

async function login({ config }) {
  let cookies;
  try {
    cookies = await fs.readFile(config.accountFile, 'utf8');
  } catch (error) {
    throw new Error(`Could not read Instagram cookie file ${config.accountFile}: ${error.message}`);
  }
  if (!cookies.trim()) throw new Error(`Instagram cookie file is empty: ${config.accountFile}`);

  const missing = findMissingCookies(cookies);
  if (missing.length) {
    throw new Error(
      `Instagram cookie file ${config.accountFile} is missing required cookie(s): ${missing.join(', ')}. `
      + 'Export fresh cookies from a logged-in instagram.com session (sessionid, ds_user_id, csrftoken, ig_did).'
    );
  }

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

module.exports = { login, findMissingCookies, REQUIRED_COOKIES };

