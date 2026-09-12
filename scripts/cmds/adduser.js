'use strict';

const { resolveUserIDs } = require('../utils/thread-users');

module.exports = {
  config: {
    name: 'adduser',
    aliases: [],
    author: 'Neoaz 🐊',
    category: 'group',
    role: 1,
    allowWhenMuted: true,
    description: 'Add Instagram users to the current group.',
    usage: '{pn} <userID|@username> [more users...]'
  },

  async onStart({ api, args, message, threadID }) {
    if (!args.length) return message.reply('Usage: adduser <userID|@username> [more users...]');
    try {
      const userIDs = await resolveUserIDs(api, args);
      if (!userIDs.length) return message.reply('Provide at least one user ID or username.');
      const success = await api.addUsersToThread(threadID, userIDs);
      if (success === false) throw new Error('Instagram rejected the add-user request.');
      return message.reply(`Added ${userIDs.length} user${userIDs.length === 1 ? '' : 's'} to the group.`);
    } catch (error) {
      return message.reply(`Could not add the user${args.length === 1 ? '' : 's'}: ${error.message}`);
    }
  }
};
