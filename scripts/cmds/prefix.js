'use strict';

const fs = require('fs');
const { replyWithEffect } = require('../../func/reply');

module.exports = {
  config: {
    name: 'prefix',
    aliases: [],
    author: 'Neoaz 🐊',
    category: 'admin',
    role: 0,
    prefixless: true,
    description: 'Set or reset the command prefix for this thread or globally.',
    usage: '{pn} [newPrefix] [-g]'
  },

  async onStart({ api, args, config, message, role, store, threadID }) {
    const reply = (content) => replyWithEffect({ api, message, threadID }, content);
    const next = args[0];
    if (!next) {
      return reply([
        `🌐 Global prefix: ${config.prefix}`,
        `📬 Thread prefix: ${store.getPrefix(threadID, config.prefix)}`
      ].join('\n'));
    }
    if (next.length > 3 || /\s/.test(next)) return reply('The prefix must be 1 to 3 non-space characters.');

    if (args[1] === '-g') {
      if (role < 2) return reply('Only bot admins can change the global prefix.');
      const raw = JSON.parse(fs.readFileSync(config.configPath, 'utf8'));
      raw.prefix = next;
      fs.writeFileSync(config.configPath, JSON.stringify(raw, null, 2) + '\n');
      config.prefix = next;
      return reply(`🌐 Global prefix changed to ${next}`);
    }

    if (next === 'reset') {
      store.setPrefix(threadID, null);
      return reply(`📬 Thread prefix reset to ${config.prefix}`);
    }
    store.setPrefix(threadID, next);
    return reply(`📬 Thread prefix changed to ${next}`);
  }
};
