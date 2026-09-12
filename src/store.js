'use strict';

const fs = require('fs');
const path = require('path');

function blankState() {
  return {
    version: 1,
    users: {},
    threads: {},
    metrics: { messages: 0, commands: 0, startedAt: Date.now() }
  };
}

class Store {
  constructor(filePath, logger, maxHistory = 50, limits = {}) {
    this.filePath = filePath;
    this.logger = logger;
    this.maxHistory = maxHistory;
    this.maxUsers = Math.max(1, Number(limits.maxUsers) || 10000);
    this.maxThreads = Math.max(1, Number(limits.maxThreads) || 5000);
    this.state = blankState();
    this.startedAt = Date.now();
    this.saveTimer = null;
    this.savePromise = Promise.resolve();
  }

  async init() {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const saved = JSON.parse(await fs.promises.readFile(this.filePath, 'utf8'));
      this.state = {
        ...blankState(),
        ...saved,
        metrics: { ...blankState().metrics, ...(saved.metrics || {}) }
      };
    } catch (error) {
      if (error.code !== 'ENOENT') this.logger.warn('Could not load state:', error.message);
    }
  }

  thread(threadID) {
    const key = String(threadID);
    if (!this.state.threads[key]) {
      this.state.threads[key] = {
        messages: 0,
        commands: 0,
        muted: false,
        prefix: null,
        welcome: true,
        leave: true,
        history: [],
        lastSeenAt: Date.now()
      };
    }
    this.state.threads[key].lastSeenAt = Date.now();
    this.trimEntries('threads', this.maxThreads, key);
    return this.state.threads[key];
  }

  user(userID) {
    const key = String(userID);
    if (!this.state.users[key]) {
      this.state.users[key] = { messages: 0, commands: 0, firstSeenAt: Date.now(), lastSeenAt: Date.now() };
    }
    this.state.users[key].lastSeenAt = Date.now();
    this.trimEntries('users', this.maxUsers, key);
    return this.state.users[key];
  }

  trimEntries(collection, limit, keepKey) {
    const entries = Object.entries(this.state[collection]);
    if (entries.length <= limit) return;
    entries
      .filter(([key]) => key !== keepKey)
      .sort(([, left], [, right]) => (left.lastSeenAt || 0) - (right.lastSeenAt || 0))
      .slice(0, entries.length - limit)
      .forEach(([key]) => delete this.state[collection][key]);
  }

  recordMessage(event) {
    const thread = this.thread(event.threadID);
    const user = this.user(event.senderID || 'unknown');
    const item = {
      messageID: event.messageID || null,
      senderID: event.senderID || null,
      body: String(event.body || '').slice(0, 1000),
      itemType: event.itemType || (event.attachments?.length ? 'media' : (event.body ? 'text' : null)),
      timestamp: event.timestamp || Date.now()
    };
    thread.messages += 1;
    user.messages += 1;
    this.state.metrics.messages += 1;
    thread.history.push(item);
    if (thread.history.length > this.maxHistory) thread.history.splice(0, thread.history.length - this.maxHistory);
    this.saveSoon();
  }

  recordCommand(threadID, userID) {
    this.thread(threadID).commands += 1;
    this.user(userID).commands += 1;
    this.state.metrics.commands += 1;
    this.saveSoon();
  }

  getHistory(threadID, limit = 10) {
    return this.thread(threadID).history.slice(-Math.max(1, Math.min(limit, this.maxHistory)));
  }

  isMuted(threadID) {
    return this.thread(threadID).muted === true;
  }

  setMuted(threadID, muted) {
    this.thread(threadID).muted = Boolean(muted);
    this.saveSoon();
  }

  setPrefix(threadID, prefix) {
    this.thread(threadID).prefix = prefix || null;
    this.saveSoon();
  }

  getPrefix(threadID, fallback) {
    return this.thread(threadID).prefix || fallback;
  }

  getWelcome(threadID, fallback = true) {
    const value = this.thread(threadID).welcome;
    return typeof value === 'boolean' ? value : Boolean(fallback);
  }

  setWelcome(threadID, enabled) {
    this.thread(threadID).welcome = Boolean(enabled);
    this.saveSoon();
  }

  getLeave(threadID, fallback = true) {
    const value = this.thread(threadID).leave;
    return typeof value === 'boolean' ? value : Boolean(fallback);
  }

  setLeave(threadID, enabled) {
    this.thread(threadID).leave = Boolean(enabled);
    this.saveSoon();
  }

  stats() {
    return {
      ...this.state.metrics,
      users: Object.keys(this.state.users).length,
      threads: Object.keys(this.state.threads).length,
      uptimeMs: Date.now() - this.startedAt
    };
  }

  saveSoon() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save().catch((error) => this.logger.warn('Could not save state:', error.message));
    }, 200);
  }

  async save() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    this.savePromise = this.savePromise.catch(() => {}).then(async () => {
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.promises.writeFile(temporary, JSON.stringify(this.state, null, 2), { mode: 0o600 });
      await fs.promises.rename(temporary, this.filePath);
    });
    return this.savePromise;
  }

  async close() {
    return this.save();
  }
}

module.exports = { Store };
