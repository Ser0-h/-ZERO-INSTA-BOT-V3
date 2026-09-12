'use strict';

const fs = require('fs');
const path = require('path');

const FOLDERS = {
  cmd: { directory: 'commandsPath', excluded: 'commandUnload', label: 'command' },
  event: { directory: 'eventsPath', excluded: 'eventCommandUnload', label: 'event command' }
};

module.exports = {
  config: {
    name: 'cmd',
    aliases: ['command'],
    version: '1.0',
    author: 'Neoaz 🐊',
    role: 2,
    category: 'owner',
    description: 'Load, unload, and install command or event files.',
    usage: '{pn} <load|unload|install> [event] <name or url> [file.js]'
  },

  async onStart({ args, body, config, event, functions, message }) {
    const action = String(args[0] || '').toLowerCase();
    const { folder, index } = getFolder(args, 1);
    const spec = FOLDERS[folder];
    const name = action === 'loadall' ? null : normalizeFileName(args[index]);

    if (action === 'load' || action === 'loadall') {
      if (action === 'load' && !name) return message.reply('❏ Please enter a file name to load.');
      return reloadFiles({ config, functions, folder, name, loadAll: action === 'loadall', message });
    }

    if (action === 'unload') {
      if (!name) return message.reply('❏ Please enter a file name to unload.');
      return unloadFile({ config, functions, folder, name, message });
    }

    if (action === 'install') {
      return installFile({ args, body, config, event, functions, folder, index, message });
    }

    return message.reply([
      '❏ Usage:',
      '➥ !cmd load <file.js>',
      '➥ !cmd loadall [event]',
      '➥ !cmd unload <file.js>',
      '➥ !cmd install <url> <file.js>',
      '➥ !cmd install event <url> <file.js>',
      '➥ Inline code is accepted when the file name ends in .js.'
    ].join('\n'));
  }
};

async function reloadFiles({ config, functions, folder, name, loadAll, message }) {
  const spec = FOLDERS[folder];
  const directory = config[spec.directory];
  const target = name || '';
  if (!loadAll && !fs.existsSync(path.join(directory, target))) {
    return message.reply(`❏ ${spec.label} file "${target}" was not found.`);
  }

  config[spec.excluded] = (config[spec.excluded] || []).filter((file) => file !== target);
  if (loadAll) config[spec.excluded] = [];
  await saveCommandSettings(config);
  await functions.reloadCommands();
  return message.reply(`✅ Loaded ${loadAll ? 'all ' : ''}${spec.label}${loadAll ? 's' : ` "${target}"`} successfully.`);
}

async function unloadFile({ config, functions, folder, name, message }) {
  const spec = FOLDERS[folder];
  if (folder === 'cmd' && name === 'cmd.js') return message.reply('❏ The installer command cannot unload itself.');
  const filePath = path.join(config[spec.directory], name);
  if (!fs.existsSync(filePath)) return message.reply(`❏ ${spec.label} file "${name}" was not found.`);

  config[spec.excluded] = config[spec.excluded] || [];
  if (!config[spec.excluded].includes(name)) config[spec.excluded].push(name);
  await saveCommandSettings(config);
  await functions.reloadCommands();
  return message.reply(`✅ Unloaded ${spec.label} "${name}" successfully.`);
}

async function installFile({ args, body, config, event, functions, folder, index, message }) {
  const spec = FOLDERS[folder];
  const values = args.slice(index + 1);
  const source = args[index];
  const fileToken = values.find((value) => /\.js$/i.test(value)) || source;
  const name = normalizeFileName(fileToken);
  if (!name) return message.reply('❏ Please provide a valid file name ending in .js.');

  let rawCode;
  try {
    if (isURL(source)) {
      rawCode = await downloadSource(source);
    } else {
      rawCode = extractInlineCode(body, name);
    }
  } catch (error) {
    return message.reply(`❌ Could not download the ${spec.label}: ${error.message}`);
  }
  if (!rawCode?.trim()) return message.reply('❏ Could not find command code to install.');

  const targetPath = path.join(config[spec.directory], name);
  if (fs.existsSync(targetPath)) {
    const prompt = await message.reply(`❏ ${spec.label} file already exists. React to this message to overwrite it.`);
    const promptID = getMessageID(prompt);
    if (!promptID) return message.reply('❏ I could not register the overwrite confirmation.');
    message.setReactionHandler(async (context) => {
      if (String(context.senderID) !== String(event.senderID)) return;
      if (!isCreatedReaction(context.reaction)) return;
      return installWrittenFile({ config, functions, folder, name, rawCode, targetPath, message: context.message });
    }, 10 * 60 * 1000, promptID);
    return prompt;
  }

  return installWrittenFile({ config, functions, folder, name, rawCode, targetPath, message });
}

async function installWrittenFile({ config, functions, folder, name, rawCode, targetPath, message }) {
  const spec = FOLDERS[folder];
  const previousCode = fs.existsSync(targetPath) ? await fs.promises.readFile(targetPath, 'utf8') : null;
  const wasExcluded = (config[spec.excluded] || []).includes(name);
  try {
    validateJavaScript(rawCode);
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, rawCode, 'utf8');
    config[spec.excluded] = (config[spec.excluded] || []).filter((file) => file !== name);
    await saveCommandSettings(config);
    await functions.reloadCommands();
    return message.reply(`✅ Installed ${spec.label} "${name}" successfully.`);
  } catch (error) {
    if (previousCode === null) await fs.promises.rm(targetPath, { force: true });
    else await fs.promises.writeFile(targetPath, previousCode, 'utf8');
    config[spec.excluded] = (config[spec.excluded] || []).filter((file) => file !== name);
    if (wasExcluded) config[spec.excluded].push(name);
    await saveCommandSettings(config).catch(() => {});
    await functions.reloadCommands().catch(() => {});
    return message.reply(`❌ Failed to install "${name}": ${error.message}`);
  }
}

async function downloadSource(source) {
  let axios;
  try {
    axios = require('axios');
  } catch (_) {
    throw new Error('The axios dependency is not installed. Run npm install first.');
  }
  const url = normalizeURL(source);
  const response = await axios.get(url, { responseType: 'text', maxContentLength: 1024 * 1024 });
  if (typeof response.data !== 'string') throw new Error('The URL did not return text.');
  return response.data;
}

function normalizeURL(source) {
  const url = new URL(source);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are allowed.');
  if (url.hostname === 'github.com') {
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (match) return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}`;
  }
  if (url.hostname === 'pastebin.com' && !url.pathname.startsWith('/raw/')) {
    url.pathname = `/raw${url.pathname}`;
  }
  return url.toString();
}

async function saveCommandSettings(config) {
  let settings = {};
  if (fs.existsSync(config.commandConfigPath)) {
    settings = JSON.parse(await fs.promises.readFile(config.commandConfigPath, 'utf8'));
  }
  settings.commandUnload = config.commandUnload || [];
  settings.eventCommandUnload = config.eventCommandUnload || [];
  await fs.promises.writeFile(config.commandConfigPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

function getFolder(args, index) {
  const value = String(args[index] || '').toLowerCase();
  if (['event', 'events', 'evt'].includes(value)) return { folder: 'event', index: index + 1 };
  return { folder: 'cmd', index };
}

function normalizeFileName(value) {
  const name = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.js$/i.test(name)) return null;
  return name;
}

function isURL(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch (_) {
    return false;
  }
}

function extractInlineCode(body, fileName) {
  const text = String(body || '');
  const marker = text.search(/\binstall\b/i);
  if (marker < 0) return '';
  const afterInstall = text.slice(marker + 'install'.length).trim();
  const withoutFolder = afterInstall.replace(/^(?:event|events|evt)\s+/i, '');
  if (withoutFolder.startsWith(fileName)) return withoutFolder.slice(fileName.length).trim();
  const fileIndex = withoutFolder.lastIndexOf(fileName);
  return fileIndex >= 0 ? withoutFolder.slice(0, fileIndex).trim() : '';
}

function validateJavaScript(code) {
  // Compile only for syntax validation; the module is executed by the normal loader after writing.
  new Function('module', 'exports', 'require', '__dirname', '__filename', code); // eslint-disable-line no-new-func
}

function getMessageID(result) {
  const item = Array.isArray(result) ? result[0] : result;
  return item?.messageID || item?.messageId || item?.itemID || item?.itemId || item?.id || null;
}

function isCreatedReaction(reaction) {
  if (!reaction) return false;
  if (typeof reaction === 'string') return true;
  return reaction.status === undefined || reaction.status === 'created';
}

module.exports = { ...module.exports, extractInlineCode, normalizeFileName, normalizeURL };
