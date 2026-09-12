'use strict';

const fs = require('fs');
const { login: loginWithConfig } = require('../bot/login/login');
const { createLogger } = require('./logger');
const { loadLanguage } = require('./localization');
const { Store } = require('./store');
const { loadCommands, loadEventCommands } = require('./command-loader');
const { CommandRouter, createGlobalFunctions } = require('./command-router');
const { createGlobalUtils, ensureGlobalUtils } = require('./global-utils');
const { createHandlerAction } = require('../bot/handler/handlerAction');
const { createHandlerEvents } = require('../bot/handler/handlerEvents');
const { retryUntilReady, isRetryableStartupError, sleep } = require('./retry');

class InstagramBot {
  constructor(config) {
    this.config = config;
    this.logger = createLogger(config.botName, config.logLevel);
    this.language = loadLanguage(config.languagesPath, config.language, this.logger);
    this.store = new Store(config.stateFile, this.logger, config.maxHistory, config);
    this.api = null;
    this.router = null;
    this.user = null;
    this.stopping = false;
    this.sessionExpired = false;
    this.accountRestricted = false;
    this.started = false;
    this.commands = new Map();
    this.eventCommands = new Map();
    this.handlerEvents = null;
    this.globalRegistry = null;
    this.commandWatchers = [];
    this.reloadTimer = null;
    this.reloadPromise = null;
    this.reloadQueued = false;
    this.stopPromise = null;
    this.realtimeConnected = false;
    this.recoveryTimer = null;
    this.recoveryPromise = null;
    this.recoveryLevel = 0;
    this.recoveryFailures = 0;
    this.rebuildPromise = null;
    this.watchdogTimer = null;
    this.lastConnectedAt = null;
    this.lastDisconnectedAt = null;
    this.sessionGeneration = 0;
    this.eventHandler = null;
    this.globalUtils = ensureGlobalUtils();
  }

  async authenticate() {
    return loginWithConfig({ config: this.config, logger: this.logger });
  }

  async start() {
    if (this.started) return this;
    this.stopping = false;
    this.sessionExpired = false;
    this.accountRestricted = false;
    await fs.promises.mkdir(this.config.dataDir, { recursive: true });
    await this.store.init();

    const loaded = loadCommands(this.config.commandsPath, this.logger, {}, {
      excludedFiles: this.config.commandUnload
    });
    const loadedEvents = loadEventCommands(this.config.eventsPath, this.logger, {}, {
      excludedFiles: this.config.eventCommandUnload
    });
    this.commands = loaded.commands;
    this.eventCommands = loadedEvents.commands;
    await retryUntilReady({
      operation: () => this.startSession(loaded, loadedEvents),
      initialDelayMs: this.config.chatApi.retryDelayMs,
      maxDelayMs: this.config.chatApi.maxRetryDelayMs,
      shouldRetry: (error) => !this.stopping && isRetryableStartupError(error),
      onRetry: (error, { attempt, delayMs }) => {
        this.logger.warn(`Chat API is unavailable (${error.message}). Retry ${attempt} in ${delayMs}ms.`);
      }
    });
    return this;
  }

  async startSession(loaded, loadedEvents) {
    await this.waitForChatApi();
    ++this.sessionGeneration;
    try {
      this.api = await this.authenticate();
      this.user = await this.api.getCurrentUserID();
      this.router = new CommandRouter({
        api: this.api,
        config: this.config,
        store: this.store,
        commands: loaded.commands,
        aliases: loaded.aliases,
        eventCommands: loadedEvents.commands,
        logger: this.logger,
        language: this.language
      });
      this.handlerEvents = createHandlerEvents(this.commands, this.eventCommands);
      this.router.setHandlerEvents(this.handlerEvents);
      this.globals = createGlobalFunctions({
        api: this.api,
        config: this.config,
        store: this.store,
        logger: this.logger,
        language: this.language,
        getCommands: () => this.router?.commands || this.commands,
        getCommandEntries: () => this.router?.commandEntries() || [],
        getEventCommands: () => this.router?.eventCommands || this.eventCommands,
        reloadCommands: () => this.reloadCommands()
      });
      this.router.globals = this.globals;
      this.installGlobalRegistry();
      this.bindApiEvents();
      await this.runCommandLifecycle('onLoad');
      this.watchCommandFiles();
      this.eventHandler = createHandlerAction(this);
      await this.api.listen(this.eventHandler);

      this.logger.info(`Logged in as ${this.user?.username || this.user?.userID || 'Instagram user'}.`);
      this.logger.info(`Loaded ${loaded.commands.size} commands. Use ${this.config.prefix}help in a chat.`);
      this.started = true;
      return this;
    } catch (error) {
      await this.clearSession(true);
      throw error;
    }
  }

  async waitForChatApi() {
    if (!this.config.chatApi.url) {
      const error = new Error('Chat API URL is missing. Set CHAT_API_URL.');
      error.code = 'CONFIG_ERROR';
      throw error;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.chatApi.timeoutMs);
    try {
      const healthUrl = new URL('/healthz', `${this.config.chatApi.url}/`).toString();
      const response = await fetch(healthUrl, { signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`Chat API health check failed (${response.status}).`);
        error.code = `HTTP_${response.status}`;
        throw error;
      }
    } catch (error) {
      if (error.name === 'AbortError') error.code = 'CHAT_API_TIMEOUT';
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  bindApiEvents() {
    this.api.on('connected', ({ method, reused } = {}) => {
      const wasDown = !this.realtimeConnected;
      this.realtimeConnected = true;
      this.lastConnectedAt = Date.now();
      this.recoveryLevel = 0;
      this.recoveryFailures = 0;
      this.clearRecoveryTimer();
      if (wasDown) {
        this.logger.info(`Instagram realtime connected via ${method || 'MQTT'}${reused ? ' (reused server session)' : ''}.`);
      }
    });
    this.api.on('disconnected', ({ code, reason } = {}) => {
      this.realtimeConnected = false;
      this.lastDisconnectedAt = Date.now();
      // The client owns reconnection: it backs off, re-authenticates when the
      // server rejects the handshake, and keeps the Instagram session alive on
      // the server. Tearing the session down here is what used to kill the bot
      // for good, so we only watch and escalate if the client cannot recover.
      this.logger.warn(`Instagram realtime disconnected (${code || 'no code'}${reason ? `: ${reason}` : ''}); the client is reconnecting.`);
      this.scheduleSessionRecovery();
    });
    this.api.on('reconnecting', ({ attempt, delayMs } = {}) => {
      this.logger.info(`Instagram realtime reconnecting${attempt ? ` (attempt ${attempt}` : ''}${delayMs ? `, in ${delayMs}ms)` : attempt ? ')' : ''}.`);
    });
    this.api.on('reconnectFailed', ({ error, attempt } = {}) => {
      this.logger.warn(`Reconnect attempt ${attempt || '?'} failed: ${error || 'unknown error'}.`);
      this.scheduleSessionRecovery();
    });
    this.api.on('stale', ({ silentForMs } = {}) => {
      this.logger.warn(`No traffic from the Chat API for ${Math.round((silentForMs || 0) / 1000)}s; the socket was dropped and will reconnect.`);
    });
    this.api.on('sessionInvalidated', ({ reason } = {}) => {
      this.logger.warn(`Chat API session invalidated (${reason || 'unknown'}); the client will re-authenticate.`);
      this.scheduleSessionRecovery();
    });
    this.api.on('authFailed', ({ error, fatal } = {}) => {
      this.logger.warn(`Chat API authentication failed${fatal ? ' fatally' : ''}: ${error || 'unknown error'}.`);
      if (fatal) this.scheduleSessionRecovery({ level: 2 });
    });
    this.api.on('serverShutdown', ({ retryAfterMs } = {}) => {
      this.realtimeConnected = false;
      this.logger.warn(`Chat API is restarting; reconnecting in ${retryAfterMs || 2000}ms.`);
      this.scheduleSessionRecovery({ delayMs: Math.max(1000, Number(retryAfterMs) || 2000), level: 1 });
    });
    this.api.on('listenerRestarted', ({ attempt } = {}) => {
      this.logger.warn(`Chat API restarted the Instagram listener${attempt ? ` (attempt ${attempt})` : ''}; messages should resume.`);
    });
    this.api.on('sessionUnrecoverable', ({ reason } = {}) => {
      this.logger.error(`Chat API gave up on this Instagram session (${reason || 'unknown'}); rebuilding it from the account file.`);
      this.scheduleSessionRecovery({ level: 3, delayMs: 1000 });
    });
    this.api.on('sessionExpired', () => {
      // Cookies may simply have been rotated on disk. Rebuild the session from
      // the account file instead of ending the process, and only give up if the
      // rebuild keeps failing.
      this.sessionExpired = true;
      this.logger.error('Instagram session expired. Rebuilding from the account file; refresh account.txt if this repeats.');
      this.scheduleSessionRecovery({ level: 3, delayMs: 1000 });
    });
    this.api.on('accountRestricted', () => {
      this.accountRestricted = true;
      this.logger.error('Instagram flagged this account for automated behavior. Automation stopped; review the account manually before restarting.');
      void this.stop().catch((error) => {
        this.logger.error('Could not stop safely after account enforcement:', error.message);
      });
    });
    this.api.on('error', (error) => this.logger.error('Instagram API error:', error?.message || error));
    this.startWatchdog();
  }

  /**
   * Periodic liveness check. The client reconnects on its own, but a socket can
   * look open while the server has forgotten the session, so we verify and
   * escalate on our own clock instead of trusting a single event.
   */
  startWatchdog() {
    this.stopWatchdog();
    const intervalMs = Math.max(15000, Number(this.config.chatApi.watchdogIntervalMs) || 60000);
    this.watchdogTimer = setInterval(() => {
      if (this.stopping || !this.api) return;
      const connected = typeof this.api.isConnected === 'function' ? this.api.isConnected() : this.realtimeConnected;
      if (connected) {
        this.realtimeConnected = true;
        return;
      }
      const downForMs = Date.now() - (this.lastDisconnectedAt || Date.now());
      this.logger.warn(`Watchdog: realtime has been down for ${Math.round(downForMs / 1000)}s.`);
      this.scheduleSessionRecovery({ delayMs: 500 });
    }, intervalMs);
    this.watchdogTimer.unref?.();
  }

  stopWatchdog() {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  clearRecoveryTimer() {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
  }

  /**
   * Recovery ladder. Each escalation is more disruptive than the last, so we
   * only climb it when the cheaper step did not bring the stream back:
   *   1 reopen the socket (keeps the Instagram session on the server)
   *   2 drop the local session ID and re-authenticate (server reuses the
   *     Instagram session for the same cookies, so no new login)
   *   3 rebuild the whole bot session from the account file
   */
  scheduleSessionRecovery({ delayMs, level } = {}) {
    if (this.stopping || this.accountRestricted) return;
    if (typeof level === 'number') this.recoveryLevel = Math.max(this.recoveryLevel, level);
    if (this.recoveryTimer || this.recoveryPromise) return;
    const base = Math.max(1000, this.config.chatApi.reconnectDelayMs || 2000);
    const wait = Math.max(500, Number(delayMs) || base);
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      const recoveryPromise = this.recoverSession()
        .catch((error) => this.logger.error('Automatic Chat API recovery failed:', error.message));
      this.recoveryPromise = recoveryPromise;
      recoveryPromise.finally(() => {
        if (this.recoveryPromise === recoveryPromise) this.recoveryPromise = null;
        if (!this.stopping && !this.realtimeConnected && !this.accountRestricted) {
          this.scheduleSessionRecovery({ delayMs: Math.min(60000, wait * 2) });
        }
      }).catch(() => {});
    }, wait);
    this.recoveryTimer.unref?.();
  }

  async recoverSession() {
    if (this.stopping) return this;
    const generation = this.sessionGeneration;
    const api = this.api;
    const eventHandler = this.eventHandler;
    if (!api || !eventHandler) return this;

    const stale = () => this.stopping || generation !== this.sessionGeneration || api !== this.api;
    const connected = () => (typeof api.isConnected === 'function' ? api.isConnected() : this.realtimeConnected);
    if (connected()) {
      this.realtimeConnected = true;
      this.recoveryLevel = 0;
      return this;
    }

    const level = Math.min(3, Math.max(1, this.recoveryLevel || 1));
    try {
      await this.waitForChatApi();
      if (stale()) return this;

      if (level >= 3) {
        this.logger.warn('Recovery step 3: rebuilding the Instagram session from the account file.');
        await this.rebuildSession();
        return this;
      }

      if (level === 2) {
        this.logger.warn('Recovery step 2: re-authenticating with the Chat API.');
        api.resetSession?.();
      } else {
        this.logger.info('Recovery step 1: reopening the Chat API event stream.');
      }

      if (typeof api.reconnect === 'function' && level === 1) await api.reconnect('bot-recovery');
      else await api.listen(eventHandler);

      if (stale()) return this;
      if (typeof api.waitUntilConnected === 'function') {
        await api.waitUntilConnected(this.config.chatApi.timeoutMs);
      }
      if (!connected()) throw new Error('Chat API realtime connection did not become ready.');
      this.realtimeConnected = true;
      this.recoveryLevel = 0;
      this.recoveryFailures = 0;
      this.logger.info('Chat API realtime connection restored.');
      return this;
    } catch (error) {
      if (stale()) return this;
      this.recoveryFailures += 1;
      const escalateAfter = Math.max(1, Number(this.config.chatApi.escalateAfterFailures) || 3);
      if (this.recoveryFailures % escalateAfter === 0 && this.recoveryLevel < 3) {
        this.recoveryLevel = Math.min(3, (this.recoveryLevel || 1) + 1);
        this.logger.warn(`Recovery escalating to step ${this.recoveryLevel} after ${this.recoveryFailures} failed attempts.`);
      }
      if (!isRetryableStartupError(error)) {
        this.logger.warn(`Recovery hit a non-transient error (${error.message}); rebuilding the session next.`);
        this.recoveryLevel = 3;
      }
      throw error;
    }
  }

  /**
   * Last resort: tear the session down and build a fresh one, reloading the
   * cookies from disk so rotated credentials are picked up without a restart.
   */
  async rebuildSession() {
    if (this.stopping || this.rebuildPromise) return this.rebuildPromise || this;
    this.rebuildPromise = (async () => {
      const loaded = { commands: this.commands, aliases: this.router?.aliases || new Map() };
      const loadedEvents = { commands: this.eventCommands };
      await this.clearSession(true);
      this.started = false;
      await retryUntilReady({
        operation: async () => {
          if (this.stopping) return this;
          await this.startSession(loaded, loadedEvents);
          this.sessionExpired = false;
          this.recoveryLevel = 0;
          this.recoveryFailures = 0;
          this.logger.info('Instagram session rebuilt successfully.');
          return this;
        },
        initialDelayMs: this.config.chatApi.retryDelayMs,
        maxDelayMs: this.config.chatApi.maxRetryDelayMs,
        shouldRetry: (error) => !this.stopping && isRetryableStartupError(error),
        onRetry: (error, { attempt, delayMs }) => {
          this.logger.warn(`Session rebuild failed (${error.message}). Retry ${attempt} in ${delayMs}ms.`);
        },
        sleep
      });
      return this;
    })();
    try {
      return await this.rebuildPromise;
    } finally {
      this.rebuildPromise = null;
    }
  }

  async clearSession(unload = false) {
    this.sessionGeneration += 1;
    this.clearRecoveryTimer();
    this.stopWatchdog();
    this.realtimeConnected = false;
    this.closeCommandWatchers();
    if (unload && this.router) await this.runCommandLifecycle('onUnload');
    if (this.api) {
      this.api.stopListening();
      if (this.api.destroy) {
        await this.api.destroy().catch((error) => {
          this.logger.warn('Could not destroy Chat API client:', error.message);
        });
      }
    }
    if (global.NkxBot === this.globalRegistry) delete global.NkxBot;
    if (global.InstaBot === this.globalRegistry) delete global.InstaBot;
    if (global.GoatBot === this.globalRegistry) delete global.GoatBot;
    if (global.utils === this.globalUtils) {
      this.globalUtils = createGlobalUtils();
      global.utils = this.globalUtils;
    }
    this.api = null;
    this.router = null;
    this.user = null;
    this.handlerEvents = null;
    this.globalRegistry = null;
    this.eventHandler = null;
  }

  installGlobalRegistry() {
    this.globalRegistry = {
      ...this.globals,
      bot: this,
      router: this.router,
      startTime: Date.now(),
      reloadCommands: () => this.reloadCommands(),
      commandEntries: () => this.router.commandEntries()
    };
    Object.defineProperty(this.globalRegistry, 'commands', {
      enumerable: true,
      get: () => this.router.commands
    });
    Object.defineProperties(this.globalRegistry, {
      eventCommands: { enumerable: true, get: () => this.router.eventCommands },
      aliases: { enumerable: true, get: () => this.router.aliases },
      onReply: { enumerable: true, get: () => this.router.replyHandlers },
      onReaction: { enumerable: true, get: () => this.router.reactionHandlers },
      onChat: { enumerable: true, get: () => this.handlerEvents?.onChat || [] },
      onFirstChat: { enumerable: true, get: () => this.handlerEvents?.onFirstChat || [] },
      onEvent: { enumerable: true, get: () => this.handlerEvents?.onEvent || [] },
      onAnyEvent: { enumerable: true, get: () => this.handlerEvents?.onAnyEvent || [] }
    });
    global.NkxBot = this.globalRegistry;
    global.InstaBot = this.globalRegistry;
    global.GoatBot = this.globalRegistry;
    this.globalUtils = createGlobalUtils(this.globalRegistry);
    global.utils = this.globalUtils;
  }

  watchCommandFiles() {
    this.closeCommandWatchers();
    const directories = [
      this.config.watchCommands !== false ? this.config.commandsPath : null,
      this.config.watchEvents !== false ? this.config.eventsPath : null
    ].filter(Boolean);
    for (const directory of directories) {
      try {
        const watcher = fs.watch(directory, { persistent: false }, (_eventType, filename) => {
          if (!filename || String(filename).endsWith('.js')) this.scheduleReload();
        });
        this.commandWatchers.push(watcher);
      } catch (error) {
        this.logger.warn(`Could not watch command directory ${directory}:`, error.message);
      }
    }
  }

  scheduleReload() {
    if (this.stopping) return;
    clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      this.reloadCommands().catch((error) => this.logger.error('Automatic command reload failed:', error));
    }, 300);
  }

  closeCommandWatchers() {
    clearTimeout(this.reloadTimer);
    this.reloadTimer = null;
    for (const watcher of this.commandWatchers) watcher.close();
    this.commandWatchers = [];
  }

  allModules() {
    return [...this.commands.values(), ...this.eventCommands.values()];
  }

  async runCommandLifecycle(hook) {
    for (const command of this.allModules()) {
      if (typeof command[hook] !== 'function') continue;
      try {
        await command[hook]({
          api: this.api,
          config: this.config,
          store: this.store,
          commands: this.commands,
          eventCommands: this.eventCommands,
          logger: this.logger,
          functions: this.globals,
          globals: this.globals,
          bot: this,
          command
        });
      } catch (error) {
        this.logger.error(`Command ${command.config.name} ${hook} failed:`, error);
      }
    }
  }

  async reloadCommands() {
    if (!this.router) throw new Error('Bot has not started.');
    if (this.reloadPromise) {
      this.reloadQueued = true;
      return this.reloadPromise;
    }
    this.reloadPromise = (async () => {
      await this.runCommandLifecycle('onUnload');
      const loaded = loadCommands(this.config.commandsPath, this.logger, {}, {
        excludedFiles: this.config.commandUnload
      });
      const loadedEvents = loadEventCommands(this.config.eventsPath, this.logger, {}, {
        excludedFiles: this.config.eventCommandUnload
      });
      this.commands = loaded.commands;
      this.eventCommands = loadedEvents.commands;
      this.handlerEvents = createHandlerEvents(this.commands, this.eventCommands);
      this.router.setCommands(loaded);
      this.router.setEventCommands(this.eventCommands, this.handlerEvents);
      this.installGlobalRegistry();
      await this.runCommandLifecycle('onLoad');
      return this.commands;
    })();
    try {
      return await this.reloadPromise;
    } finally {
      this.reloadPromise = null;
      if (this.reloadQueued) {
        this.reloadQueued = false;
        this.scheduleReload();
      }
    }
  }

  async handleEvent(error, event) {
    if (this.stopping) return;
    if (error) {
      this.logger.error('Listen error:', error.message);
      return;
    }
    if (!event) return;
    if (!this.router) {
      // A rebuild is in flight; drop the event instead of crashing the listener.
      this.logger.debug('Ignoring realtime event while the session is rebuilding.');
      return;
    }

    this.logger.debug('Dispatching realtime event:', {
      type: event.type,
      threadID: event.threadID,
      messageID: event.messageID,
      senderID: event.senderID,
      body: event.body
    });

    if (event.type === 'message') {
      this.store.recordMessage(event);
      const sender = String(event.senderID || '');
      const currentUserID = String(this.user?.userID || this.user?.userId || '');
      if (sender && currentUserID && sender === currentUserID) return;
      await this.router.handle(event);
      return;
    }

    if (event.type === 'message_reaction') {
      await this.router.handle(event);
      return;
    }

    if (event.type === 'event') {
      await this.router.handle(event);
      return;
    }

    this.logger.debug(`Ignored Instagram event: ${event.type || 'unknown'}`);
  }

  stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = (async () => {
      this.stopping = true;
      this.sessionGeneration += 1;
      this.clearRecoveryTimer();
      this.stopWatchdog();
      this.realtimeConnected = false;
      this.closeCommandWatchers();
      this.logger.info('Stopping bot...');
      if (this.api) {
        this.api.stopListening();
        await this.runCommandLifecycle('onUnload');
        if (this.api.destroy) {
          await this.api.destroy().catch((error) => {
            this.logger.warn('Could not destroy Instagram client:', error.message);
          });
        }
      }
      await this.store.close();
      if (global.NkxBot === this.globalRegistry) delete global.NkxBot;
      if (global.InstaBot === this.globalRegistry) delete global.InstaBot;
      if (global.GoatBot === this.globalRegistry) delete global.GoatBot;
      if (global.utils === this.globalUtils) {
        this.globalUtils = createGlobalUtils();
        global.utils = this.globalUtils;
      }
      this.started = false;
    })();
    return this.stopPromise.finally(() => {
      this.stopPromise = null;
    });
  }
}

module.exports = { InstagramBot };
