'use strict';

// Guarantee `global.utils` exists before this module destructures it.
require('../../src/global-utils');

const { extractImageUrl, findReplyTarget } = global.utils;

module.exports = {
  config: {
    name: 'setprofile',
    aliases: ['setpfp', 'profile'],
    author: 'Neoaz 🐊',
    category: 'owner',
    role: 3,
    allowWhenMuted: true,
    description: 'Change the bot account profile picture.',
    usage: '{pn} <public image URL> or reply to an image'
  },

  async onStart({ api, args, event, message, threadID }) {
    try {
      const imageUrl = await resolveImageUrl(api, args, event, threadID);
      if (!imageUrl) return message.reply('Provide a public image URL or reply to an image.');
      if (typeof api.setProfilePicture !== 'function') return message.reply('Profile-picture updates are unavailable.');

      const result = await api.setProfilePicture(imageUrl);
      if (result === false || result?.success === false) throw new Error('Instagram rejected the profile-picture update.');
      return message.reply('Profile picture updated.');
    } catch (error) {
      return message.reply(`Could not update the profile picture: ${error.message}`);
    }
  }
};

async function resolveImageUrl(api, args, event, threadID) {
  const value = String(args[0] || '').trim();
  if (value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
    } catch (_) {
      return null;
    }
  }

  if (!event?.replyTo) return null;
  const target = await findReplyTarget(api, event, threadID);
  return extractImageUrl(target);
}

module.exports.resolveImageUrl = resolveImageUrl;
