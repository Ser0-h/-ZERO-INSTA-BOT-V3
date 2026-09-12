'use strict';

const fs = require('fs');
const { login: loginWithConfig } = require('../bot/login/login');
const { createLogger } = require('./logger');
const { loadLanguage } = require('./localization');
const { Store } = require('./store');
const { loadCommands, loadEventCommands } = require('./command-loader');
const { CommandRouter, createGlobalFunctions } = require('./command-router');
const { createHandlerAction } = require('../bot/handler/handlerAction');
const { createHandlerEvents } = require('../bot/handler/handlerEvents');

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
  }

  async authenticate() {
    return loginWithConfig({ config: this.config, logger: this.logger });
  }

  async start() {
    if (this.started) return;
    this.stopping = false;
    this.sessionExpired = false;
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
    await this.runCommandLifecycle('onLoad');
    this.watchCommandFiles();

    this.api.on('connected', ({ method } = {}) => this.logger.info(`Instagram realtime connected via ${method || 'MQTT'}.`));
    this.api.on('disconnected', () => this.logger.warn('Instagram realtime disconnected.'));
    this.api.on('reconnecting', () => this.logger.info('Instagram realtime reconnecting.'));
    this.api.on('reconnectPaused', ({ attempts } = {}) => {
      this.logger.error(`Instagram realtime reconnect paused after ${attempts || 'multiple'} attempts. Restart after checking the network.`);
    });
    this.api.on('sessionExpired', () => {
      this.sessionExpired = true;
      this.logger.error('Instagram session expired. Refresh account.txt and restart.');
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

    await this.api.listen(createHandlerAction(this));

    this.logger.info(`Logged in as ${this.user?.username || this.user?.userID || 'Instagram user'}.`);
    this.logger.info(`Loaded ${loaded.commands.size} commands. Use ${this.config.prefix}help in a chat.`);
    this.started = true;
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
      this.started = false;
    })();
    return this.stopPromise.finally(() => {
      this.stopPromise = null;
    });
  }
}

module.exports = { InstagramBot };
