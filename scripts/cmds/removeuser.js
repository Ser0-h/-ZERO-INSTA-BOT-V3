'use strict';

const { resolveUserIDs } = require('../utils/thread-users');

module.exports = {
  config: {
    name: 'removeuser',
    aliases: ['rmuser'],
    author: 'Neoaz 🐊',
    category: 'group',
    role: 1,
    allowWhenMuted: true,
    description: 'Remove Instagram users from the current group.',
    usage: '{pn} <userID|@username> [more users...]'
  },

  async onStart({ api, args, message, threadID }) {
    if (!args.length) return message.reply('Usage: removeuser <userID|@username> [more users...]');
    try {
      const userIDs = await resolveUserIDs(api, args);
      if (!userIDs.length) return message.reply('Provide at least one user ID or username.');
      const success = await api.removeUsersFromThread(threadID, userIDs);
      if (success === false) throw new Error('Instagram rejected the remove-user request.');
      return message.reply(`Removed ${userIDs.length} user${userIDs.length === 1 ? '' : 's'} from the group.`);
    } catch (error) {
      return message.reply(`Could not remove the user${args.length === 1 ? '' : 's'}: ${error.message}`);
    }
  }
};
