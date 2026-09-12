'use strict';

module.exports = {
  config: {
    name: 'tid',
    aliases: ['threadid'],
    author: 'Neoaz 🐊',
    category: 'system',
    description: 'Show the current conversation ID.',
    usage: '{pn}'
  },

  async onStart({ message, threadID }) {
    return message.reply(`❑ Thread ID: ${threadID}`);
  }
};
