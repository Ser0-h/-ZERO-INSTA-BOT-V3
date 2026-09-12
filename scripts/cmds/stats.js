'use strict';

const { formatDuration } = require('../../func/utils');
const { replyWithEffect } = require('../../func/reply');

module.exports = {
  config: {
    name: 'stats',
    aliases: ['status'],
    author: 'Neoaz 🐊',
    category: 'system',
    description: 'Show persistent message and command statistics.',
    usage: '{pn}'
  },

  async onStart({ api, config, message, store, threadID }) {
    const stats = store.stats();
    return replyWithEffect({ api, message, threadID }, [
      `❏ ${config.botName || 'Bot'} statistics`,
      `➥ Uptime: ${formatDuration(stats.uptimeMs)}`,
      `➥ Messages seen: ${stats.messages}`,
      `➥ Commands run: ${stats.commands}`,
      `➥ Users: ${stats.users}`,
      `➥ Threads: ${stats.threads}`
    ].join('\n'));
  }
};
