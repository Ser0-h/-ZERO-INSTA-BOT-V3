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
    this.api.on('connected', ({ method } = {}) => {
      this.realtimeConnected = true;
      this.logger.info(`Instagram realtime connected via ${method || 'MQTT'}.`);
    });
    this.api.on('disconnected', () => {
      this.realtimeConnected = false;
      this.logger.warn('Instagram realtime disconnected; waiting for the Chat API and re-authenticating automatically.');
      // A remote session may have been removed while the socket was down.
      // Clear the client session before recovery so it cannot reconnect forever
      // with a stale session ID.
      this.api.resetSession?.();
      this.scheduleSessionRecovery();
    });
    this.api.on('reconnecting', () => this.logger.info('Instagram realtime reconnecting.'));
    this.api.on('reconnectPaused', ({ attempts } = {}) => {
      this.logger.warn(`Instagram realtime reconnect paused after ${attempts || 'multiple'} attempts; automatic recovery remains active.`);
      this.scheduleSessionRecovery();
    });
    this.api.on('sessionExpired', () => {
      this.sessionExpired = true;
      this.logger.error('Private chat API session expired. Refresh account.txt and restart.');
      void this.stop().catch((error) => {
        this.logger.error('Could not stop safely after session expiry:', error.message);
      });
    });
    this.api.on('accountRestricted', () => {
      this.accountRestricted = true;
      this.logger.error('Instagram flagged this account for automated behavior. Automation stopped; review the account manually before restarting.');
      void this.stop().catch((error) => {
        this.logger.error('Could not stop safely after account enforcement:', error.message);
      });
    });
    this.api.on('error', (error) => this.logger.error('Instagram API error:', error.message));
  }

  scheduleSessionRecovery() {
    if (this.stopping || this.recoveryTimer || this.recoveryPromise) return;
    const delayMs = Math.max(1000, this.config.chatApi.reconnectDelayMs * 2);
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      const recoveryPromise = this.recoverSession()
        .catch((error) => this.logger.error('Automatic Chat API recovery stopped:', error.message))
      this.recoveryPromise = recoveryPromise;
      recoveryPromise.finally(() => {
        if (this.recoveryPromise === recoveryPromise) this.recoveryPromise = null;
      }).catch(() => {});
    }, delayMs);
  }

  async recoverSession() {
    const generation = this.sessionGeneration;
    const api = this.api;
    const eventHandler = this.eventHandler;
    if (!api || !eventHandler) return this;
    await retryUntilReady({
      operation: async () => {
        if (this.stopping || this.realtimeConnected || generation !== this.sessionGeneration || api !== this.api) return this;
        await this.waitForChatApi();
        // Re-open the event stream on the existing authenticated server
        // session. Clearing it here would create a second Instagram client
        // during a transient socket loss and needlessly repeat authentication.
        await api.listen(eventHandler);
        if (generation !== this.sessionGeneration || api !== this.api) return this;
        if (!this.realtimeConnected) throw new Error('Chat API realtime connection did not become ready.');
        return this;
      },
      initialDelayMs: this.config.chatApi.retryDelayMs,
      maxDelayMs: this.config.chatApi.maxRetryDelayMs,
      shouldRetry: (error) => generation === this.sessionGeneration
        && api === this.api
        && !this.stopping
        && !this.realtimeConnected
        && isRetryableStartupError(error),
      onRetry: (error, { attempt, delayMs }) => {
        this.logger.warn(`Automatic Chat API recovery is waiting (${error.message}). Retry ${attempt} in ${delayMs}ms.`);
      },
      sleep
    });
  }

  async clearSession(unload = false) {
    this.sessionGeneration += 1;
    clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
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
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
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
