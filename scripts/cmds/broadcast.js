'use strict';

module.exports = {
  config: {
    name: 'broadcast',
    aliases: ['sendto'],
    author: 'Neoaz 🐊',
    category: 'admin',
    role: 2,
    description: 'Send a message to one explicitly named thread.',
    usage: '{pn} <threadID> <message>',
    allowWhenMuted: true
  },

  async onStart({ api, args, message }) {
    const targetThreadID = args.shift();
    const body = args.join(' ').trim();
    if (!targetThreadID || !body) return message.reply('❑ Usage: broadcast <threadID> <message>');
    if (body.length > 2000) return message.reply('❑ Broadcasts are limited to 2000 characters.');
    await api.sendMessage(body, targetThreadID);
    return message.reply(`❑ Message sent to ${targetThreadID}.`);
  }
};
