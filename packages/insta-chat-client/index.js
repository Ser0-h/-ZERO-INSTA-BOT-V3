'use strict';

const { EventEmitter } = require('node:events');
const WebSocket = require('ws');

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RECONNECT_DELAY_MS = 3000;

class RemoteChatClient extends EventEmitter {
  constructor(options = {}) {
    super();
    if (!options.baseUrl) throw new Error('A chat API baseUrl is required.');
    if (!options.token) throw new Error('A chat API token is required.');

    this.baseUrl = String(options.baseUrl).replace(/\/+$/, '');
    this.token = String(options.token);
    if (!options.cookies) throw new Error('Instagram cookies are required.');
    this.cookies = options.cookies;
    this.timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
    this.reconnectDelayMs = Number(options.reconnectDelayMs) || DEFAULT_RECONNECT_DELAY_MS;
    this.ws = null;
    this.listener = null;
    this.listening = false;
    this.connectPromise = null;
    this.reconnectTimer = null;
    this.sessionId = null;
    this.authPromise = null;
  }

  async connect() {
    await this.authenticate();
    if (this.ws?.readyState === WebSocket.OPEN) return this;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise((resolve, reject) => {
      const url = `${this.baseUrl.replace(/^http/i, 'ws')}/v1/events`;
      const socket = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'X-Chat-Session': this.sessionId
        }
      });
      let settled = false;

      const fail = (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
        this.emitSafe('error', error);
      };

      socket.once('open', () => {
        settled = true;
        this.ws = socket;
        this.emitSafe('connected', { method: 'remote' });
        resolve(this);
      });
      socket.on('message', (payload) => this.handleSocketMessage(payload));
      socket.on('error', fail);
      socket.once('close', () => {
        if (this.ws === socket) this.ws = null;
        this.emitSafe('disconnected');
        if (this.listening) this.scheduleReconnect();
      });
    }).finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  async listen(callback) {
    this.listener = typeof callback === 'function' ? callback : null;
    this.listening = true;
    return this.connect();
  }

  stopListening() {
    this.listening = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      socket.close();
    }
  }

  async call(operation, args = []) {
    await this.authenticate();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/v1/call`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'X-Chat-Session': this.sessionId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ operation, args }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || `Chat API request failed (${response.status}).`);
        error.code = payload.code || `HTTP_${response.status}`;
        throw error;
      }
      return payload.data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async authenticate() {
    if (this.sessionId) return this;
    if (this.authPromise) return this.authPromise;
    this.authPromise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(`${this.baseUrl}/v1/auth`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ cookies: this.cookies }),
          signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(payload.error || `Chat API authentication failed (${response.status}).`);
          error.code = payload.code || `HTTP_${response.status}`;
          throw error;
        }
        const sessionId = payload.data?.sessionId;
        if (!sessionId) throw new Error('Chat API did not return an authenticated session.');
        this.sessionId = String(sessionId);
        return this;
      } finally {
        clearTimeout(timeout);
      }
    })().finally(() => {
      this.authPromise = null;
    });
    return this.authPromise;
  }

  async getCurrentUserID() { return this.call('getCurrentUserID'); }
  async getHealth() { return this.call('getHealth'); }

  sendMessage(message, threadID) { return this.call('sendMessage', [message, threadID]); }
  sendEffects(threadID, text, effect) { return this.call('sendEffects', [threadID, text, effect]); }
  stickerMusic(threadID, queryOrTrack, options) { return this.call('stickerMusic', [threadID, queryOrTrack, options]); }
  sendPhotoFromUrl(threadID, imageUrl, options) { return this.call('sendPhotoFromUrl', [threadID, imageUrl, options]); }
  sendVoiceFromUrl(threadID, audioUrl, options) { return this.call('sendVoiceFromUrl', [threadID, audioUrl, options]); }
  sendGIF(threadID, gifUrl, options) { return this.call('sendGIF', [threadID, gifUrl, options]); }
  sendDirectMessage(userID, message) { return this.call('sendDirectMessage', [userID, message]); }
  replyToMessage(threadID, message, messageID) { return this.call('replyToMessage', [threadID, message, messageID]); }
  unsendMessage(messageID, threadID) { return this.call('unsendMessage', [messageID, threadID]); }
  unsendMessageFast(messageID, threadID) { return this.call('unsendMessageFast', [messageID, threadID]); }
  sendReaction(reaction, messageID, threadID) { return this.call('sendReaction', [reaction, messageID, threadID]); }
  removeReaction(messageID, threadID) { return this.call('removeReaction', [messageID, threadID]); }
  toggleReaction(reaction, messageID, threadID) { return this.call('toggleReaction', [reaction, messageID, threadID]); }
  getThreadInfo(threadID) { return this.call('getThreadInfo', [threadID]); }
  getThreadHistory(threadID, amount) { return this.call('getThreadHistory', [threadID, amount]); }
  getNewerMessages(threadID, timestamp) { return this.call('getNewerMessages', [threadID, timestamp]); }
  getMessagesAround(threadID, messageID, limit) { return this.call('getMessagesAround', [threadID, messageID, limit]); }
  getInbox(options) { return this.call('getInbox', [options]); }
  getPendingRequests(options) { return this.call('getPendingRequests', [options]); }
  searchThreads(query, options) { return this.call('searchThreads', [query, options]); }
  sendTypingIndicator(threadID) { return this.call('sendTypingIndicator', [threadID]); }
  stopTypingIndicator(threadID) { return this.call('stopTypingIndicator', [threadID]); }
  changeThreadTitle(threadID, title) { return this.call('changeThreadTitle', [threadID, title]); }
  addUsersToThread(threadID, userIDs) { return this.call('addUsersToThread', [threadID, userIDs]); }
  removeUsersFromThread(threadID, userIDs) { return this.call('removeUsersFromThread', [threadID, userIDs]); }
  leaveThread(threadID) { return this.call('leaveThread', [threadID]); }
  muteThread(threadID) { return this.call('muteThread', [threadID]); }
  unmuteThread(threadID) { return this.call('unmuteThread', [threadID]); }
  getUserInfo(userID) { return this.call('getUserInfo', [userID]); }
  getUserInfoByUsername(username) { return this.call('getUserInfoByUsername', [username]); }
  searchUsers(query, options) { return this.call('searchUsers', [query, options]); }
  getMultipleUserInfo(userIDs) { return this.call('getMultipleUserInfo', [userIDs]); }
  getFollowers(userID, options) { return this.call('getFollowers', [userID, options]); }

  saveSession() {
    return Promise.resolve({ managedByServer: true });
  }

  async logout() {
    const result = await this.call('logout');
    this.sessionId = null;
    this.stopListening();
    return result;
  }

  async destroy() {
    this.stopListening();
  }

  handleSocketMessage(payload) {
    let message;
    try {
      message = JSON.parse(String(payload));
    } catch {
      return;
    }
    if (message.type === 'event' && message.event) {
      this.listener?.(null, message.event);
      this.emitSafe('event', message.event);
      return;
    }
    if (message.type === 'error') {
      const error = new Error(message.error || 'Remote chat API error.');
      error.code = message.code;
      this.listener?.(error);
      this.emitSafe('error', error);
      return;
    }
    if (message.type && message.type !== 'event') this.emitSafe(message.type, message.data);
  }

  scheduleReconnect() {
    if (this.reconnectTimer || !this.listening) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        this.emitSafe('reconnecting', { error: error.message });
        this.scheduleReconnect();
      });
    }, this.reconnectDelayMs);
    this.reconnectTimer.unref?.();
    this.emitSafe('reconnecting', { delayMs: this.reconnectDelayMs });
  }

  emitSafe(event, ...args) {
    if (event === 'error' && this.listenerCount('error') === 0) return;
    this.emit(event, ...args);
  }
}

function createClient(options) {
  return new RemoteChatClient(options);
}

module.exports = { RemoteChatClient, createClient };
