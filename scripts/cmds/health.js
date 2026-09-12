'use strict';

module.exports = {
  config: {
    name: 'diagnostics',
    aliases: ['diag'],
    author: 'Neoaz 🐊',
    category: 'system',
    description: 'Show realtime connection and bot health.',
    usage: '{pn}'
  },

  async onStart({ functions, message }) {
    const health = functions.getHealth() || {};
    const stats = functions.getStats();
    return message.reply([
      `❑ Connection: ${health.mqtt?.connected ? 'connected' : health.listening ? 'listening' : 'disconnected'}`,
      `❑ Authenticated: ${health.authenticated ? 'yes' : 'no'}`,
      `❑ Messages: ${stats.messages || 0}`,
      `❑ Commands: ${stats.commands || 0}`,
      `❑ Threads: ${stats.threads || 0}`,
      `❑ Users: ${stats.users || 0}`
    ].join('\n'));
  }
};
