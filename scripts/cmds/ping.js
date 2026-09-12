'use strict';

module.exports = {
  config: {
    name: 'ping',
    aliases: [],
    author: 'Neoaz 🐊',
    category: 'system',
    description: 'Check whether the bot is responding.',
    usage: '{pn}'
  },

  async onStart({ message, functions }) {
    const health = functions.getHealth?.() || {};
    const state = health.mqtt?.connected || health.listening ? 'online' : 'starting';
    return message.reply(`Pong. The bot is ${state}.`);
  }
};
