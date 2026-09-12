'use strict';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

module.exports = {
  config: {
    name: 'eval',
    version: '1.7',
    author: 'Neoaz 🐊',
    role: 2,
    category: 'owner',
    description: 'Run JavaScript as the bot owner.',
    usage: '{pn} <code to test>',
    allowWhenMuted: true
  },

  async onStart({ api, args, event, message, threadID, role, config, store, logger, functions, globals }) {
    if (Number(role) < 2) return;
    const code = args.join(' ').trim();
    if (!code) return message.reply('Usage: !eval <code to test>');

    const output = (value) => message.reply(formatOutput(value));
    const out = (value) => output(value);
    const context = {
      api,
      args,
      event,
      message,
      threadID,
      role,
      config,
      store,
      logger,
      functions,
      globals,
      bot: globals?.bot,
      router: globals?.router,
      out,
      output,
      require,
      process,
      console
    };

    try {
      return await runCode(code, context);
    } catch (error) {
      return message.reply(`❌ An error occurred:\n${cleanStack(error)}`);
    }
  }
};

async function runCode(code, context) {
  const names = Object.keys(context);
  const values = Object.values(context);
  const runner = new AsyncFunction(...names, `\"use strict\";\n${code}`);
  return runner(...values);
}

function formatOutput(value) {
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'function') {
    return value.toString();
  }
  if (value instanceof Map) {
    return `Map(${value.size}) ${JSON.stringify(mapToObject(value), null, 2)}`;
  }
  if (typeof value === 'object' && value !== null) return JSON.stringify(value, null, 2);
  if (typeof value === 'undefined') return 'undefined';
  return String(value);
}

function mapToObject(map) {
  const object = {};
  map.forEach((value, key) => {
    object[key] = value;
  });
  return object;
}

function cleanStack(error) {
  return String(error?.stack || error?.message || error).replaceAll(process.cwd(), '~');
}

module.exports = { ...module.exports, formatOutput, mapToObject, runCode };
