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
    this.saveIntervalMs = Math.max(200, Number(limits.stateSaveIntervalMs) || 3000);
    this.saveMaxDelayMs = Math.max(this.saveIntervalMs, Number(limits.stateSaveMaxDelayMs) || 30000);
    this.maxAgeMs = Math.max(0, Number(limits.stateMaxAgeMs) || 0);
    this.state = blankState();
    this.startedAt = Date.now();
    this.saveTimer = null;
    this.savePromise = Promise.resolve();
    this.dirty = false;
    this.saving = false;
    this.firstDirtyAt = null;
    this.lastSavedAt = 0;
    this.closed = false;
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
    this.pruneStale();
  }

  /**
   * Drop threads and users nobody has touched for a long time. Without this the
   * state file grows forever and every save gets slower.
   */
  pruneStale(now = Date.now()) {
    if (!this.maxAgeMs) return 0;
    let removed = 0;
    for (const collection of ['threads', 'users']) {
      for (const [key, entry] of Object.entries(this.state[collection])) {
        const seen = Number(entry?.lastSeenAt) || 0;
        if (seen && now - seen > this.maxAgeMs) {
          delete this.state[collection][key];
          removed += 1;
        }
      }
    }
    if (removed) {
      this.dirty = true;
      this.logger?.debug?.(`Pruned ${removed} stale state entries.`);
    }
    return removed;
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

  /**
   * Coalesce writes: a burst of messages produces one save per interval instead
   * of one serialization of the whole state per message.
   */
  saveSoon() {
    if (this.closed) return;
    this.dirty = true;
    if (this.firstDirtyAt === null) this.firstDirtyAt = Date.now();
    if (this.saveTimer) return;
    const waited = Date.now() - this.firstDirtyAt;
    const delay = Math.max(0, Math.min(this.saveIntervalMs, this.saveMaxDelayMs - waited));
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save().catch((error) => this.logger.warn('Could not save state:', error.message));
    }, delay);
    this.saveTimer.unref?.();
  }

  async save({ force = false } = {}) {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!force && !this.dirty) return this.savePromise;
    this.dirty = false;
    this.firstDirtyAt = null;
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    this.savePromise = this.savePromise.catch(() => {}).then(async () => {
      this.saving = true;
      try {
        await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.promises.writeFile(temporary, JSON.stringify(this.state), { mode: 0o600 });
        await fs.promises.rename(temporary, this.filePath);
        this.lastSavedAt = Date.now();
      } catch (error) {
        // Keep the change queued so the next tick retries, and never leave a
        // half-written temporary file behind.
        this.dirty = true;
        await fs.promises.rm(temporary, { force: true }).catch(() => {});
        throw error;
      } finally {
        this.saving = false;
      }
    });
    return this.savePromise;
  }

  async close() {
    this.closed = true;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.pruneStale();
    return this.save({ force: true }).catch((error) => {
      this.logger.warn('Could not save state on shutdown:', error.message);
    });
  }
}

module.exports = { Store };
