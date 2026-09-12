'use strict';

module.exports = {
  config: {
    name: 'changename',
    aliases: ['setname', 'groupname'],
    author: 'Neoaz 🐊',
    category: 'group',
    role: 1,
    allowWhenMuted: true,
    description: 'Change the current group name.',
    usage: '{pn} <new group name>'
  },

  async onStart({ api, args, message, threadID }) {
    const title = args.join(' ').trim();
    if (!title) return message.reply('Usage: changename <new group name>');
    if (title.length > 100) return message.reply('The group name must be 100 characters or fewer.');

    try {
      const result = await api.changeThreadTitle(threadID, title);
      if (result === false || result?.success === false) throw new Error('Instagram rejected the group-name change.');
      return message.reply(`Group name changed to "${title}".`);
    } catch (error) {
      return message.reply(`Could not change the group name: ${error.message}`);
    }
  }
};
