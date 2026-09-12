'use strict';

// Guarantee `global.utils` exists before this module destructures it.
require('../../src/global-utils');

const { stringifyThreadInfo } = global.utils;

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
      return message.reply(`${stringifyThreadInfo(info)}\nThread ID: ${threadID}`);
    } catch (error) {
      return message.reply(`Could not fetch thread information: ${error.message}`);
    }
  }
};
