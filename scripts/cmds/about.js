'use strict';

module.exports = {
  config: {
    name: 'about',
    aliases: ['botinfo'],
    author: 'Neoaz 🐊',
    category: 'system',
    description: 'Show basic information about the bot.',
    usage: '{pn}'
  },

  async onStart({ config, message }) {
    return message.reply([
      config.botName,
      config.description,
      '',
      `Prefix: ${config.prefix}`,
      `Website: ${config.website}`,
      `Author: ${config.author}`
    ].join('\n'));
  }
};
