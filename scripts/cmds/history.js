'use strict';

// Guarantee `global.utils` exists before this module destructures it.
require('../../src/global-utils');

const { toNumber } = global.utils;

module.exports = {
  config: {
    name: 'history',
    aliases: ['recent'],
    author: 'Neoaz 🐊',
    category: 'instagram',
    description: 'Show recent messages from this thread.',
    usage: '{pn} [count]'
  },

  async onStart({ api, args, message, store, threadID }) {
    const limit = toNumber(args[0], 10, 1, 25);
    try {
      const history = await api.getThreadHistory(threadID, limit);
      if (Array.isArray(history) && history.length) {
        const lines = history.slice(-limit).map((item) => {
          const sender = item.senderID || item.userID || 'unknown';
          return `${sender}: ${String(item.body || item.text || '[attachment]').slice(0, 180)}`;
        });
        return message.reply(`Recent messages\n\n${lines.join('\n')}`);
      }
    } catch (error) {
      store.logger.warn('Remote history lookup failed:', error.message);
    }

    const local = store.getHistory(threadID, limit);
    if (!local.length) return message.reply('No recent messages are available.');
    return message.reply(`Recent messages\n\n${local.map((item) => `${item.senderID || 'unknown'}: ${item.body || '[attachment]'}`).join('\n')}`);
  }
};
