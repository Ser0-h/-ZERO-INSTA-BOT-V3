'use strict';

const ROLES = Object.freeze({
  USER: 0,
  GROUP_ADMIN: 1,
  BOT_ADMIN: 2,
  OWNER: 3
});

const ROLE_NAMES = Object.freeze({
  [ROLES.USER]: 'user',
  [ROLES.GROUP_ADMIN]: 'group admin',
  [ROLES.BOT_ADMIN]: 'bot admin',
  [ROLES.OWNER]: 'owner'
});

function createGlobalFunctions({ api, config, store, logger, language, getCommands, getCommandEntries, getEventCommands, reloadCommands }) {
  return {
    api,
    config,
    store,
    logger,
    commands: getCommands,
    eventCommands: getEventCommands,
    commandEntries: getCommandEntries,
    reloadCommands,
    getLang: language || ((_key, fallback) => fallback || ''),
    sendMessage: (threadID, content) => api.sendMessage(content, String(threadID)),
    sendEffects: (threadID, text, effect) => api.sendEffects(String(threadID), text, effect),
    stickerMusic: (threadID, queryOrTrack, options) => api.stickerMusic(String(threadID), queryOrTrack, options),
    sendPhotoFromUrl: (threadID, url, options) => api.sendPhotoFromUrl(String(threadID), url, options),
    sendVoiceFromUrl: (threadID, url, options) => api.sendVoiceFromUrl(String(threadID), url, options),
    sendGIF: (threadID, url, options) => api.sendGIF(String(threadID), url, options),
    sendDirectMessage: (userID, content) => api.sendDirectMessage(String(userID), content),
    sendReaction: (threadID, messageID, reaction) => api.sendReaction(reaction, String(messageID), String(threadID)),
    removeReaction: (threadID, messageID) => api.removeReaction(String(messageID), String(threadID)),
    toggleReaction: (threadID, messageID, reaction) => api.toggleReaction(reaction, String(messageID), String(threadID)),
    getThreadInfo: (threadID) => api.getThreadInfo(String(threadID)),
    getThreadHistory: (threadID, amount) => api.getThreadHistory(String(threadID), amount),
    addUsersToThread: (threadID, userIDs) => api.addUsersToThread(String(threadID), userIDs),
    addUserToGroup: (threadID, userID) => api.addUserToGroup(String(threadID), userID),
    removeUsersFromThread: (threadID, userIDs) => api.removeUsersFromThread(String(threadID), userIDs),
    leaveThread: (threadID) => api.leaveThread(String(threadID)),
    getUserInfo: (userID) => api.getUserInfo(String(userID)),
    getProfilePicture: (userID) => api.getProfilePicture(String(userID)),
    getUserInfoByUsername: (username) => api.getUserInfoByUsername(username),
    getProfilePictureByUsername: (username) => api.getProfilePictureByUsername(username),
    searchUsers: (query, options) => api.searchUsers(query, options),
    searchThreads: (query, options) => api.searchThreads(query, options),
    getHealth: () => api.getHealth(),
    getStats: () => store.stats(),
    prefixFor: (threadID) => store.getPrefix(String(threadID), config.prefix)
  };
}

function createContextFunctions({ api, config, store, router, logger, language, event, message }) {
  const threadID = String(event.threadID);
  return {
    send: (content) => message.send(content),
    reply: (content) => message.reply(content),
    sendMessage: (content, targetThreadID = threadID) => api.sendMessage(content, String(targetThreadID)),
    sendEffects: (text, effect) => api.sendEffects(threadID, text, effect),
    stickerMusic: (queryOrTrack, options) => api.stickerMusic(threadID, queryOrTrack, options),
    sendPhotoFromUrl: (url, options) => api.sendPhotoFromUrl(threadID, url, options),
    sendVoiceFromUrl: (url, options) => api.sendVoiceFromUrl(threadID, url, options),
    sendGIF: (url, options) => api.sendGIF(threadID, url, options),
    sendDirectMessage: (userID, content) => api.sendDirectMessage(String(userID), content),
    getThreadInfo: (targetThreadID = threadID) => api.getThreadInfo(String(targetThreadID)),
    getThreadHistory: (targetThreadID = threadID, amount) => api.getThreadHistory(String(targetThreadID), amount),
    addUsersToThread: (userIDs, targetThreadID = threadID) => api.addUsersToThread(String(targetThreadID), userIDs),
    addUserToGroup: (userID, targetThreadID = threadID) => api.addUserToGroup(String(targetThreadID), userID),
    removeUsersFromThread: (userIDs, targetThreadID = threadID) => api.removeUsersFromThread(String(targetThreadID), userIDs),
    leaveThread: (targetThreadID = threadID) => api.leaveThread(String(targetThreadID)),
    getUserInfo: (userID = event.senderID) => api.getUserInfo(String(userID)),
    getProfilePicture: (userID = event.senderID) => api.getProfilePicture(String(userID)),
    getUserInfoByUsername: (username) => api.getUserInfoByUsername(username),
    getProfilePictureByUsername: (username) => api.getProfilePictureByUsername(username),
    searchUsers: (query, options) => api.searchUsers(query, options),
    searchThreads: (query, options) => api.searchThreads(query, options),
    sendTypingIndicator: () => api.sendTypingIndicator(threadID),
    stopTypingIndicator: () => api.stopTypingIndicator(threadID),
    sendReaction: (reaction, targetMessageID = event.messageID) => api.sendReaction(reaction, targetMessageID, threadID),
    removeReaction: (targetMessageID = event.messageID) => api.removeReaction(targetMessageID, threadID),
    toggleReaction: (reaction, targetMessageID = event.messageID) => api.toggleReaction(reaction, targetMessageID, threadID),
    setReply: message.setReply,
    setReactionHandler: message.setReactionHandler,
    commands: () => router.commands,
    commandEntries: () => router.commandEntries(),
    reloadCommands: () => router.globals?.reloadCommands?.(),
    getHealth: () => api.getHealth(),
    getStats: () => store.stats(),
    config,
    logger,
    getLang: language || ((_key, fallback) => fallback || '')
  };
}

function tokenize(input) {
  const tokens = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(input)) !== null) {
    tokens.push((match[1] ?? match[2] ?? match[3]).replace(/\\([\\"'])/g, '$1'));
  }
  return tokens;
}

function cleanText(value, max = 1500) {
  return String(value ?? '').trim().slice(0, max);
}

function asID(value) {
  if (value && typeof value === 'object') {
    return String(value.userID || value.userId || value.id || '');
  }
  return String(value || '');
}

function messageIDMatches(message, targetID) {
  const target = String(targetID || '');
  if (!target || !message) return false;
  return [
    message.messageID,
    message.messageId,
    message.itemID,
    message.itemId,
    message.legacyMessageID,
    message.legacy_item_id
  ].some((value) => value !== null && value !== undefined && String(value) === target);
}

function isBotMessage(message) {
  if (!message) return false;
  return Boolean(message.senderID || message.senderId || message.sender_id)
    && (message.type === 'message'
      || message.itemType
      || message.item_type
      || message.body !== undefined);
}

class CommandRouter {
  constructor({ api, config, store, commands, aliases, eventCommands = new Map(), handlerEvents = null, logger, language = null, globals = null }) {
    this.api = api;
    this.config = config;
    this.store = store;
    this.commands = commands;
    this.aliases = aliases;
    this.eventCommands = eventCommands;
    this.handlerEvents = handlerEvents;
    this.logger = logger;
    this.language = language || ((_key, fallback) => fallback || '');
    this.globals = globals;
    this.cooldowns = new Map();
    this.replyHandlers = new Map();
    this.reactionHandlers = new Map();
    this.firstChatThreads = new Set();
  }

  setCommands({ commands, aliases }) {
    this.commands = commands;
    this.aliases = aliases;
    this.replyHandlers.clear();
    this.reactionHandlers.clear();
    this.cooldowns.clear();
  }

  setEventCommands(eventCommands, handlerEvents = this.handlerEvents) {
    this.eventCommands = eventCommands;
    this.handlerEvents = handlerEvents;
  }

  setHandlerEvents(handlerEvents) {
    this.handlerEvents = handlerEvents;
  }

  commandEntries() {
    return [...this.commands.values()].map((command) => command.config);
  }

  resolveCommand(name) {
    const normalized = String(name || '').toLowerCase();
    return this.commands.get(normalized) || this.commands.get(this.aliases.get(normalized));
  }

  getRole(senderID, event = {}) {
    const id = String(senderID || '');
    if (id && id === String(this.config.ownerId || '')) return ROLES.OWNER;
    if (id && this.config.adminIds?.has(id)) return ROLES.BOT_ADMIN;
    if (this.config.allowThreadAdmins && event.isGroup) {
      const admins = event.threadAdminIDs || event.adminIDs || event.threadAdmins || event.admins || [];
      if (Array.isArray(admins) && admins.some((admin) => asID(admin) === id)) return ROLES.GROUP_ADMIN;
    }
    return ROLES.USER;
  }

  getRoleName(role, senderID = '') {
    if (String(senderID || '') === String(this.config.ownerId || '') && senderID) return ROLE_NAMES[ROLES.OWNER];
    return ROLE_NAMES[Number(role)] || ROLE_NAMES[ROLES.USER];
  }

  getRequiredRole(command, hook = 'onStart') {
    const role = command?.config?.role;
    if (role && typeof role === 'object' && !Array.isArray(role)) {
      return Number(role[hook] ?? role.onStart ?? 0) || 0;
    }
    return Number(role || 0) || 0;
  }

  isAllowedThread(threadID) {
    const id = String(threadID);
    if (this.config.blockedThreads.has(id)) return false;
    return this.config.allowedThreads.size === 0 || this.config.allowedThreads.has(id);
  }

  isCoolingDown(key, duration) {
    if (!duration) return false;
    const now = Date.now();
    const previous = this.cooldowns.get(key) || 0;
    if (now - previous < duration) return true;
    this.cooldowns.set(key, now);
    return false;
  }

  pruneState() {
    const now = Date.now();
    for (const [key, handler] of this.replyHandlers) {
      if (handler.expiresAt <= now) this.replyHandlers.delete(key);
    }
    for (const [key, handler] of this.reactionHandlers) {
      if (handler.expiresAt <= now) this.reactionHandlers.delete(key);
    }
    while (this.replyHandlers.size > this.config.maxHandlerEntries) {
      this.replyHandlers.delete(this.replyHandlers.keys().next().value);
    }
    while (this.reactionHandlers.size > this.config.maxHandlerEntries) {
      this.reactionHandlers.delete(this.reactionHandlers.keys().next().value);
    }
    while (this.cooldowns.size > this.config.maxCooldownEntries) {
      this.cooldowns.delete(this.cooldowns.keys().next().value);
    }
    while (this.firstChatThreads.size > this.config.maxTrackedThreads) {
      this.firstChatThreads.delete(this.firstChatThreads.values().next().value);
    }
  }

  async handle(event) {
    if (!event || !event.threadID) return false;
    this.logger.debug('Routing realtime event:', {
      type: event.type,
      threadID: event.threadID,
      senderID: event.senderID,
      body: event.body
    });
    this.pruneState();
    if (!this.isAllowedThread(event.threadID)) return false;
    await this.runHooks('onAnyEvent', event, [], { silent: true });
    if (event.type === 'message_reaction') return this.handleReaction(event);
    if (event.type === 'event') return this.handleEvent(event);
    if (event.type !== 'message') return false;

    const body = cleanText(event.body, 5000);
    if (!body) return false;

    const prefix = this.store.getPrefix(event.threadID, this.config.prefix);
    const startsWithPrefix = body.startsWith(prefix);
    const tokens = tokenize(startsWithPrefix ? body.slice(prefix.length).trim() : body);
    const possibleCommand = this.resolveCommand(tokens[0]);
    const isPrefixlessCommand = !startsWithPrefix && possibleCommand?.config?.prefixless === true;

    if (!startsWithPrefix && !isPrefixlessCommand) {
      const reply = event.replyTo && this.replyHandlers.get(String(event.replyTo));
      if (reply) {
        if (reply.expiresAt <= Date.now()) {
          this.replyHandlers.delete(String(event.replyTo));
        } else if (reply.senderID && reply.senderID !== String(event.senderID || '')) {
          return false;
        } else {
          return this.handleReply(event, body, reply);
        }
      }
    }

    const firstChat = this.markFirstChat(event.threadID);
    if (firstChat) await this.runHooks('onFirstChat', event, tokenize(body), { silent: true });

    if (!startsWithPrefix && !isPrefixlessCommand) return this.handleChat(event, body);

    const requestedName = tokens.shift()?.toLowerCase();
    if (!requestedName) {
      await this.safeSend(event, `Use ${prefix}help to see the available commands.`);
      return true;
    }

    const command = this.resolveCommand(requestedName);
    if (!command) {
      const suggestion = this.suggestCommand(requestedName);
      await this.safeSend(event, [
        `I do not recognize ${prefix}${requestedName}.`,
        suggestion ? `Did you mean ${prefix}${suggestion}?` : '',
        `Use ${prefix}help to see available commands.`
      ].filter(Boolean).join('\n'));
      return true;
    }

    const role = this.getRole(event.senderID, event);
    const permissionError = this.getPermissionError(command, event, 'onStart', role);
    if (permissionError) {
      await this.safeSend(event, permissionError);
      return true;
    }

    const configuredCooldown = command.config.cooldown;
    const cooldown = configuredCooldown === null || configuredCooldown === undefined
      ? this.config.commandCooldownMs
      : Math.max(0, Number(configuredCooldown) * 1000);
    const cooldownKey = `${event.threadID}:${command.config.name}:${event.senderID || 'unknown'}`;
    if (this.isCoolingDown(cooldownKey, cooldown)) {
      await this.safeSend(event, this.language(
        'system.cooldown',
        'Please wait a moment before using that command again.'
      ));
      return true;
    }

    await this.invoke(command, 'onStart', event, tokens, {
      requestedName,
      record: true,
      errorReply: true
    });
    return true;
  }

  suggestCommand(input) {
    const query = String(input || '').toLowerCase();
    if (!query) return null;
    const candidates = this.commandEntries().flatMap((command) => [
      command.name,
      ...(command.aliases || [])
    ]);
    let best = null;
    for (const candidate of candidates) {
      const distance = levenshtein(query, candidate);
      if (!best || distance < best.distance) best = { candidate, distance };
    }
    const threshold = Math.max(2, Math.ceil(query.length * 0.6));
    return best && best.distance <= threshold ? best.candidate : null;
  }

  markFirstChat(threadID) {
    const id = String(threadID);
    if (this.firstChatThreads.has(id)) return false;
    this.firstChatThreads.add(id);
    return true;
  }

  canUse(command, event, hook, role = this.getRole(event.senderID, event)) {
    return !this.getPermissionError(command, event, hook, role);
  }

  getPermissionError(command, event, hook, role = this.getRole(event.senderID, event)) {
    if (this.store.isMuted(event.threadID) && role < 2 && !command.config.allowWhenMuted) {
      return this.language('permissions.muted', 'The bot is muted in this chat.');
    }
    const requiredRole = this.getRequiredRole(command, hook);
    if (role >= requiredRole) return null;
    this.logger.debug(`Permission denied for ${command.config.name} (${hook}) to ${event.senderID || 'unknown'}`);
    if (requiredRole >= ROLES.OWNER) {
      return this.language('permissions.owner', 'Only the bot owner can use this command.');
    }
    if (requiredRole >= ROLES.BOT_ADMIN) {
      return this.language('permissions.botAdmin', 'Only bot administrators can use this command.');
    }
    if (requiredRole === 1) {
      return this.language('permissions.groupAdmin', 'Only group administrators can use this command.');
    }
    return 'You do not have permission to use this command.';
  }

  async invoke(command, hook, event, args, options = {}) {
    if (typeof command?.[hook] !== 'function') return false;
    const role = this.getRole(event.senderID, event);
    if (!this.canUse(command, event, hook, role)) return false;
    const context = this.createContext(event, args, command.config.name);
    context.command = command;
    context.requestedName = options.requestedName || command.config.name;
    context.hook = hook;
    if (options.reply) context.reply = options.reply;
    if (options.reaction) context.reaction = options.reaction;
    if (options.record) this.store.recordCommand(event.threadID, event.senderID || 'unknown');

    try {
      await command[hook](context);
    } catch (error) {
      this.logger.error(`Command ${command.config.name} ${hook} failed:`, error);
      if (options.errorReply) await this.safeReply(context, 'I could not complete that command. Please try again.');
    }
    return true;
  }

  async runHooks(hook, event, args, options = {}) {
    let invoked = 0;
    const names = this.handlerEvents?.[hook] || [...this.commands.keys()];
    for (const name of names) {
      const command = this.commands.get(name);
      if (!command) continue;
      if (typeof command[hook] !== 'function') continue;
      if (await this.invoke(command, hook, event, args, options)) invoked += 1;
    }
    return invoked;
  }

  async handleChat(event, body) {
    const invoked = await this.runHooks('onChat', event, tokenize(body), { silent: true, record: true });
    if (invoked > 0) return true;
    if (!this.config.autoReply) return false;
    if (!/^(hi|hello|hey|ping)\b/i.test(body)) return false;
    const key = `${event.threadID}:greeting:${event.senderID || 'unknown'}`;
    if (this.isCoolingDown(key, 60 * 1000)) return false;
    await this.safeSend(event, `${this.config.botName}: Hello. Use ${this.store.getPrefix(event.threadID, this.config.prefix)}help to see what I can do.`);
    return true;
  }

  async handleReply(event, body, registered) {
    const command = this.resolveCommand(registered.commandName);
    if (!command) return false;
    if (!this.canUse(command, event, 'onReply')) return false;
    const context = this.createContext(event, tokenize(body), command.config.name);
    context.command = command;
    context.reply = registered;
    try {
      if (registered.handler) await registered.handler(context);
      else await this.invoke(command, 'onReply', event, tokenize(body), { reply: registered, record: true });
    } catch (error) {
      this.logger.error(`Reply handler ${command.config.name} failed:`, error);
      await this.safeReply(context, 'I could not process that reply. Please try again.');
    }
    return true;
  }

  async handleReaction(event) {
    if (await this.handleAdminUnsendReaction(event)) return true;
    const reactionStatus = event.reactionStatus || event.reaction_status;
    if (reactionStatus && reactionStatus !== 'created') return false;
    const key = event.messageID && String(event.messageID);
    const registered = key && this.reactionHandlers.get(key);
    if (!registered || registered.expiresAt <= Date.now()) return false;
    const command = this.resolveCommand(registered.commandName);
    if (!command || !this.canUse(command, event, 'onReaction')) return false;
    const context = this.createContext(event, [], command.config.name);
    context.command = command;
    context.reaction = event.reaction;
    try {
      if (registered.handler) await registered.handler(context);
      else await this.invoke(command, 'onReaction', event, [], { reaction: event.reaction, record: true });
    } catch (error) {
      this.logger.error(`Reaction handler ${command.config.name} failed:`, error);
    }
    return true;
  }

  async handleAdminUnsendReaction(event) {
    const reactionValue = event.reaction && typeof event.reaction === 'object'
      ? event.reaction.emoji || event.reaction.reaction
      : event.reaction;
    const reaction = String(reactionValue || '').replace(/\uFE0F/g, '');
    const status = event.reactionStatus || event.reaction_status;
    if (!['😠', '😡'].includes(reaction) || (status && status !== 'created')) return false;
    if (this.getRole(event.senderID, event) < 1) return false;

    const targetID = event.targetMessageID || event.messageID;
    if (!targetID || typeof this.api.unsendMessage !== 'function') return false;

    const message = await this.findMessage(event.threadID, targetID);
    if (!message || !isBotMessage(message)) return false;

    let currentUser;
    try {
      currentUser = typeof this.api.getCurrentUserID === 'function'
        ? await this.api.getCurrentUserID()
        : null;
    } catch (error) {
      this.logger.debug(`Could not identify the bot for reaction unsend: ${error.message}`);
      return false;
    }
    if (!asID(currentUser) || asID(message.senderID) !== asID(currentUser)) return false;

    try {
      const unsend = this.api.unsendMessageFast || this.api.unsendMessage;
      await unsend.call(this.api, targetID, event.threadID);
    } catch (error) {
      this.logger.warn(`Could not auto-unsend reacted message ${targetID}:`, error.message);
    }
    return true;
  }

  async findMessage(threadID, targetID) {
    if (typeof this.store.getHistory === 'function') {
      const cached = this.store.getHistory(threadID, this.config.maxHistory || 50);
      const match = cached.find((message) => messageIDMatches(message, targetID));
      if (match) return match;
    }
    if (typeof this.api.getThreadHistory !== 'function') return null;
    try {
      const history = await this.api.getThreadHistory(threadID, 20);
      return Array.isArray(history)
        ? history.find((message) => messageIDMatches(message, targetID)) || null
        : null;
    } catch (error) {
      this.logger.debug(`Could not load reacted message ${targetID}: ${error.message}`);
      return null;
    }
  }

  async handleEvent(event) {
    if (!this.isAllowedThread(event.threadID)) return false;
    const commandHandlers = await this.runHooks('onEvent', event, [], { silent: true, record: true });
    const eventHandlers = await this.runEventCommands(event);
    return commandHandlers + eventHandlers > 0;
  }

  async runEventCommands(event) {
    let invoked = 0;
    const names = this.handlerEvents?.eventCommands || [...this.eventCommands.keys()];
    for (const name of names) {
      const command = this.eventCommands.get(name);
      if (!command || typeof command.onStart !== 'function' || !this.canUse(command, event, 'onStart')) continue;
      const context = this.createContext(event, [], command.config.name, command);
      context.command = command;
      context.hook = 'onEvent';
      try {
        await command.onStart(context);
        invoked += 1;
      } catch (error) {
        this.logger.error(`Event command ${command.config.name} failed:`, error);
      }
    }
    return invoked;
  }

  createContext(event, args, commandName, commandOverride = null) {
    const threadID = String(event.threadID);
    const command = commandOverride || this.resolveCommand(commandName);
    const message = {
      id: event.messageID || null,
      threadID,
      reply: async (content) => {
        if (typeof content === 'string' && event.messageID && this.api.replyToMessage) {
          try {
            return await this.api.replyToMessage(threadID, content, event.messageID);
          } catch (error) {
            this.logger.warn(`Reply request failed for ${event.messageID}; sending normally:`, error.message);
          }
        }
        return this.api.sendMessage(content, threadID);
      },
      send: (content) => this.api.sendMessage(content, threadID),
      react: (reaction) => this.api.sendReaction(reaction, event.messageID, threadID),
       unsend: () => event.messageID
         ? (this.api.unsendMessageFast || this.api.unsendMessage).call(this.api, event.messageID, threadID)
         : null,
      setReply: (handler, ttlMs = 10 * 60 * 1000, targetMessageID = event.messageID) => {
        const replyHandler = typeof handler === 'function' ? handler : command?.onReply;
        if (!targetMessageID || typeof replyHandler !== 'function') return null;
        this.replyHandlers.set(String(targetMessageID), {
          commandName,
          handler: replyHandler,
          senderID: String(event.senderID || ''),
          expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || 0)
        });
        return targetMessageID;
      },
      setReactionHandler: (handler, ttlMs = 10 * 60 * 1000, targetMessageID = event.messageID) => {
        const reactionHandler = typeof handler === 'function' ? handler : command?.onReaction;
        if (!targetMessageID || typeof reactionHandler !== 'function') return null;
        this.reactionHandlers.set(String(targetMessageID), {
          commandName,
          handler: reactionHandler,
          expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || 0)
        });
        return targetMessageID;
      }
    };

    const context = {
      api: this.api,
      config: this.config,
      store: this.store,
      commands: this.commands,
      commandEntries: () => this.commandEntries(),
      globals: this.globals,
      global: this.globals,
      logger: this.logger,
      event,
      args,
      commandName,
      body: event.body || '',
      prefix: this.store.getPrefix(threadID, this.config.prefix),
      role: this.getRole(event.senderID, event),
      roleName: this.getRoleName(this.getRole(event.senderID, event), event.senderID),
      getLang: this.language,
      senderID: event.senderID || event.author || event.userID || '',
      threadID,
      isGroup: event.isGroup === true,
      message
    };
    context.functions = createContextFunctions({
      api: this.api,
      config: this.config,
      store: this.store,
      router: this,
      logger: this.logger,
      language: this.language,
      event,
      message
    });
    context.utils = context.functions;
    return context;
  }

  async safeReply(context, content) {
    try {
      await context.message.reply(content);
    } catch (error) {
      this.logger.error('Could not send command error reply:', error);
    }
  }

  async safeSend(event, content) {
    try {
      await this.send(event, content);
    } catch (error) {
      this.logger.error('Could not send bot reply:', error);
    }
  }

  send(event, content) {
    return this.api.sendMessage(content, String(event.threadID));
  }
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
    }
    for (let column = 0; column <= right.length; column++) previous[column] = current[column];
  }
  return previous[right.length];
}

module.exports = { CommandRouter, tokenize, createGlobalFunctions, createContextFunctions, ROLES, ROLE_NAMES };
