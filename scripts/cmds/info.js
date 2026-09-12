'use strict';

const { stringifyThreadInfo } = require('../../func/utils');

module.exports = {
  config: {
    name: 'info',
    aliases: ['thread'],
    author: 'Neoaz 🐊',
    category: 'instagram',
    description: 'Fetch information about the current conversation.',
    usage: '{pn}'
  },

  async onStart({ api, message, threadID }) {
    try {
      const info = await api.getThreadInfo(threadID);
      return message.reply(`${stringifyThreadInfo(info)}\n➥ Thread ID: ${threadID}`);
    } catch (error) {
      return message.reply(`❑ Could not fetch thread information: ${error.message}`);
    }
  }
};
