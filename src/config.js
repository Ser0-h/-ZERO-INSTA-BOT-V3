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
  const env = loadEnvFile(rootDir);
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

  const chatApi = settings.chatApi && typeof settings.chatApi === 'object' ? settings.chatApi : {};

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
    accountFile: resolveAccountFile(rootDir, settings.accountFile, env),
    prefix: stringFromValue(settings.prefix, '!'),
    // The owner and admins are Instagram numeric user IDs. They can be set here
    // or, preferably, overridden with OWNER_ID / ADMIN_IDS in the environment so
    // a real account ID is never committed to the repository.
    adminIds: new Set([
      ...listFromValue(environmentValue('ADMIN_IDS', env)),
      ...listFromValue(settings.adminIds)
    ]),
    ownerId: stringFromValue(environmentValue('OWNER_ID', env), stringFromValue(settings.ownerId)),
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
    maxThreads: Math.max(1, numberFromValue(settings.maxThreads, 5000)),
    // State is flushed at most once per interval and always within the max
    // delay, so a busy chat cannot turn every message into a disk write.
    stateSaveIntervalMs: Math.max(200, numberFromValue(environmentValue('STATE_SAVE_INTERVAL_MS', env) ?? settings.stateSaveIntervalMs, 3000)),
    stateSaveMaxDelayMs: Math.max(1000, numberFromValue(environmentValue('STATE_SAVE_MAX_DELAY_MS', env) ?? settings.stateSaveMaxDelayMs, 30000)),
    stateMaxAgeMs: Math.max(0, numberFromValue(environmentValue('STATE_MAX_AGE_MS', env) ?? settings.stateMaxAgeMs, 30 * 24 * 60 * 60 * 1000)),
    chatApi: {
      url: stringFromValue(environmentValue('CHAT_API_URL', env), stringFromValue(chatApi.url)),
      token: stringFromValue(environmentValue('CHAT_API_TOKEN', env), stringFromValue(chatApi.token)),
      timeoutMs: Math.max(1000, numberFromValue(environmentValue('CHAT_API_TIMEOUT_MS', env) ?? chatApi.timeoutMs, 30000)),
      reconnectDelayMs: Math.max(500, numberFromValue(environmentValue('CHAT_API_RECONNECT_DELAY_MS', env) ?? chatApi.reconnectDelayMs, 3000)),
      retryDelayMs: Math.max(1000, numberFromValue(environmentValue('CHAT_API_RETRY_DELAY_MS', env) ?? chatApi.retryDelayMs, 5000)),
      maxRetryDelayMs: Math.max(1000, numberFromValue(environmentValue('CHAT_API_MAX_RETRY_DELAY_MS', env) ?? chatApi.maxRetryDelayMs, 60000)),
      // How often the bot verifies the realtime stream is still alive, and how
      // many failed recoveries it takes before trying a more disruptive step.
      watchdogIntervalMs: Math.max(15000, numberFromValue(environmentValue('CHAT_API_WATCHDOG_INTERVAL_MS', env) ?? chatApi.watchdogIntervalMs, 60000)),
      escalateAfterFailures: Math.max(1, numberFromValue(environmentValue('CHAT_API_ESCALATE_AFTER_FAILURES', env) ?? chatApi.escalateAfterFailures, 3)),
      heartbeatIntervalMs: Math.max(5000, numberFromValue(environmentValue('CHAT_API_HEARTBEAT_INTERVAL_MS', env) ?? chatApi.heartbeatIntervalMs, 25000)),
      heartbeatTimeoutMs: Math.max(10000, numberFromValue(environmentValue('CHAT_API_HEARTBEAT_TIMEOUT_MS', env) ?? chatApi.heartbeatTimeoutMs, 70000))
    }
  };
}

function resolveAccountFile(rootDir, configuredValue, env = {}) {
  const configured = environmentValue('ACCOUNT_FILE', env);
  if (configured) return resolveFromRoot(rootDir, configured, 'account.txt');

  const localPath = resolveFromRoot(rootDir, configuredValue, 'account.txt');
  const usesDefaultPath = !configuredValue || ['./account.txt', 'account.txt'].includes(String(configuredValue).trim());
  if (usesDefaultPath && !fs.existsSync(localPath) && fs.existsSync('/etc/secrets/account.txt')) {
    return '/etc/secrets/account.txt';
  }
  return localPath;
}

function environmentValue(key, env) {
  return process.env[key] !== undefined ? process.env[key] : env[key];
}

function loadEnvFile(rootDir) {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return {};
  try {
    const values = {};
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      values[match[1]] = value;
    }
    return values;
  } catch (error) {
    throw new Error(`Could not read .env: ${error.message}`);
  }
}

module.exports = { loadConfig, listFromValue };
