'use strict';

const { getMessageID } = require('../utils/reply');

module.exports = {
  config: {
    name: 'unsend',
    aliases: ['delete'],
    author: 'Neoaz ð',
    category: 'admin',
    role: 0,
    description: 'Remove a bot message by replying to it; admins may provide an ID.',
    usage: '{pn} [messageID]',
    allowWhenMuted: true
  },

  async onStart({ api, args, event, message, threadID, role }) {
    const replyTarget = event.replyTo
      || event.reply_to_item_id
      || event.replied_to_item_id
      || event.replied_to_message?.item_id
      || event.replied_to_message?.id
      || getMessageID(event.replyToMessage)
      || getMessageID(event.reply_to_message)
      || getMessageID(event.replied_to_item)
      || getMessageID(event.quoted_item)
      || null;
    const messageID = args[0] || replyTarget;
    const respond = (content) => typeof message.send === 'function'
      ? message.send(content)
      : message.reply(content);
    if (!messageID) return respond('â Reply to a bot message to remove it.');
    if (args[0] && !replyTarget && Number(role) < 2) {
      return respond('â Reply to the bot message you want to remove.');
    }
    try {
      const unsend = api.unsendMessageFast || api.unsendMessage;
      await unsend.call(api, messageID, threadID);
      return true;
    } catch (error) {
      return respond(`â Could not remove message ${messageID}: ${error.message}`);
    }
  }
};
