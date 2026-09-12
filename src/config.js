'use strict';

const fs = require('fs');
const path = require('path');

function listFromValue(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/);
  return values
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function stringFromValue(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function booleanFromValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function numberFromValue(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function resolveFromRoot(rootDir, value, fallback) {
  return path.resolve(rootDir, stringFromValue(value, fallback));
}

function loadConfig(rootDir = path.resolve(__dirname, '..')) {
  const configPath = path.join(rootDir, 'config.json');
  const commandConfigPath = path.join(rootDir, 'configCommands.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing config.json at ${configPath}. Create it before starting the bot.`);
  }

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read config.json: ${error.message}`);
  }
  if (!settings || Array.isArray(settings) || typeof settings !== 'object') {
    throw new Error('config.json must contain a JSON object.');
  }

  let commandSettings = {};
  if (fs.existsSync(commandConfigPath)) {
    try {
      commandSettings = JSON.parse(fs.readFileSync(commandConfigPath, 'utf8')) || {};
    } catch (error) {
      throw new Error(`Could not read configCommands.json: ${error.message}`);
    }
  }

  return {
    rootDir,
    configPath,
    botName: stringFromValue(settings.botName, 'Instagram Bot'),
    description: stringFromValue(settings.description, 'Instagram command bot'),
    author: stringFromValue(settings.author, 'Saifullah Al Neoaz (NEOKEX)'),
    website: stringFromValue(settings.website, 'https://neokex.xyz'),
    github: stringFromValue(settings.github, 'https://github.com/lazyneoaz'),
    commandConfigPath,
    commandsPath: resolveFromRoot(rootDir, settings.commandsPath, commandSettings.envCommands || 'scripts/cmds'),
    eventsPath: resolveFromRoot(rootDir, settings.eventsPath, commandSettings.envEvents || 'scripts/events'),
    languagesPath: resolveFromRoot(rootDir, settings.languagesPath, commandSettings.envLangs || 'scripts/langs'),
    language: stringFromValue(settings.language, 'en'),
    watchCommands: booleanFromValue(commandSettings.watchCommands, true),
    watchEvents: booleanFromValue(commandSettings.watchEvents, true),
    commandUnload: listFromValue(commandSettings.commandUnload),
    eventCommandUnload: listFromValue(commandSettings.eventCommandUnload),
    dataDir: resolveFromRoot(rootDir, settings.dataDir, 'data'),
    stateFile: resolveFromRoot(rootDir, settings.stateFile, 'data/bot-state.json'),
    accountFile: resolveFromRoot(rootDir, settings.accountFile, 'account.txt'),
    sessionFile: resolveFromRoot(rootDir, settings.sessionFile, 'data/session.json'),
    prefix: stringFromValue(settings.prefix, '!'),
    adminIds: new Set(listFromValue(settings.adminIds)),
    ownerId: stringFromValue(settings.ownerId),
    allowThreadAdmins: booleanFromValue(settings.allowThreadAdmins, true),
    allowedThreads: new Set(listFromValue(settings.allowedThreads)),
    blockedThreads: new Set(listFromValue(settings.blockedThreads)),
    autoReply: booleanFromValue(settings.autoReply),
    welcomeMessages: booleanFromValue(settings.welcomeMessages),
    autoMarkRead: booleanFromValue(settings.autoMarkRead),
    logLevel: stringFromValue(settings.logLevel, 'info'),
    maxHistory: Math.max(1, numberFromValue(settings.maxHistory, 50)),
    commandCooldownMs: Math.max(0, numberFromValue(settings.commandCooldownMs, 1500)),
    maxHandlerEntries: Math.max(1, numberFromValue(settings.maxHandlerEntries, 2000)),
    maxCooldownEntries: Math.max(1, numberFromValue(settings.maxCooldownEntries, 10000)),
    maxTrackedThreads: Math.max(1, numberFromValue(settings.maxTrackedThreads, 10000)),
    maxUsers: Math.max(1, numberFromValue(settings.maxUsers, 10000)),
    maxThreads: Math.max(1, numberFromValue(settings.maxThreads, 5000))
  };
}

module.exports = { loadConfig, listFromValue };
