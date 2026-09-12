'use strict';

const {
  findReplyTarget,
  getMessageSenderID,
  getUserID,
  getUsername
} = global.utils;

module.exports = {
  config: {
    name: 'id',
    aliases: ['uid'],
    author: 'Neoaz 🐊',
    category: 'system',
    description: 'Show your ID, a replied user ID, or a mentioned user ID.',
    usage: '{pn} [@username]'
  },

  async onStart({ api, args, event, message, senderID, threadID }) {
    const username = args[0]?.replace(/^@/, '').replace(/[\s,]+$/, '');
    if (username) {
      try {
        const user = await api.getUserInfoByUsername(username);
        return message.reply(`User ID of ${user.username || `@${username}`}: ${getUserID(user)}`);
      } catch (error) {
        return message.reply(`Could not find @${username}: ${error.message}`);
      }
    }

    if (event.replyTo) {
      const target = await resolveReplyUser(api, event, threadID);
      if (!target.userID) return message.reply('Could not resolve the user who sent that message.');
      return message.reply(`User ID of ${target.username || 'this user'}: ${target.userID}`);
    }

    return message.reply(`Your ID: ${senderID || 'unknown'}`);
  }
};

async function resolveReplyUser(api, event, threadID) {
  const target = await findReplyTarget(api, event, threadID);
  let userID = getMessageSenderID(target);
  let username = getUsername(target);

  if (userID && !username && typeof api.getUserInfo === 'function') {
    try {
      const user = await api.getUserInfo(userID);
      username = getUsername(user) || getUserID(user) && user.username;
    } catch (_) {
      // The ID is still useful even when profile lookup fails.
    }
  }
  return { userID, username };
}
