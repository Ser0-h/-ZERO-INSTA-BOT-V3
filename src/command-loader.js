'use strict';

const fs = require('fs');
const path = require('path');
const { ensureGlobalUtils } = require('./global-utils');

ensureGlobalUtils();

const COMMAND_HOOKS = ['onStart', 'onChat', 'onFirstChat', 'onReply', 'onReaction', 'onEvent', 'onAnyEvent'];

function loadModules(directory, logger, defaults = {}, { event = false, excludedFiles = [] } = {}) {
  const commands = new Map();
  const aliases = new Map();
  if (!fs.existsSync(directory)) return { commands, aliases };

  const excluded = new Set(excludedFiles.map((name) => path.basename(String(name))));
  for (const file of fs.readdirSync(directory)
    .filter((name) => name.endsWith('.js') && !excluded.has(name))
    .sort()) {
    const filePath = path.join(directory, file);
    delete require.cache[require.resolve(filePath)];
    const command = require(filePath);
    if (!command || !command.config?.name || (event
      ? typeof command.onStart !== 'function'
      : !COMMAND_HOOKS.some((hook) => typeof command[hook] === 'function'))) {
      throw new Error(`Invalid command module: ${file}`);
    }

    const name = String(command.config.name).toLowerCase();
    const config = {
      role: 0,
      aliases: [],
      cooldown: null,
      category: 'general',
      description: 'No description provided.',
      usage: name,
      author: defaults.author || 'Neoaz 🐊',
      ...command.config,
      name
    };
    if (!Array.isArray(config.aliases)) throw new Error(`Invalid aliases for command: ${file}`);
    config.aliases = [...new Set(config.aliases.map((alias) => String(alias).toLowerCase()).filter(Boolean))];
    const roleValues = config.role && typeof config.role === 'object' && !Array.isArray(config.role)
      ? Object.values(config.role)
      : [config.role];
    if (roleValues.some((role) => !Number.isInteger(role) || role < 0 || role > 3)) {
      throw new Error(`Invalid role for command: ${file}`);
    }
    command.config = config;
    if (commands.has(name) || aliases.has(name)) throw new Error(`Duplicate command name: ${name}`);
    commands.set(name, command);
    for (const alias of config.aliases) {
      if (alias === name || commands.has(alias) || aliases.has(alias)) {
        throw new Error(`Duplicate command alias: ${alias}`);
      }
      aliases.set(alias, name);
    }
    logger.debug(`Loaded command ${name}`);
  }

  return { commands, aliases };
}

function loadCommands(directory, logger, defaults = {}, options = {}) {
  return loadModules(directory, logger, defaults, options);
}

function loadEventCommands(directory, logger, defaults = {}, options = {}) {
  return loadModules(directory, logger, defaults, { ...options, event: true });
}

module.exports = { loadCommands, loadEventCommands, COMMAND_HOOKS };
