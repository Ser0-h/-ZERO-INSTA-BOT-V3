'use strict';

const {
  findReplyTarget,
  getMessageSenderID,
  getUserID,
  getUsername
} = global.utils;

module.exports = {
  config: {
    name: 'pfp',
    aliases: ['profilepic', 'avatar', 'dp'],
    author: 'Neoaz 🐊',
    category: 'users',
    role: 0,
    allowWhenMuted: true,
    description: "Send a user's Instagram profile picture.",
    usage: '{pn} [@username|userID] or reply to a message'
  },

  async onStart({ api, args, event, message, senderID, threadID }) {
    try {
      const target = await resolveTarget(api, args, event, threadID, senderID);
      if (!target.userID && !target.username) {
        return message.reply('Mention a user, provide a user ID, or reply to a message.');
      }

      const user = await loadUser(api, target);
      const userID = getUserID(user) || target.userID;
      let profilePicUrl = user?.profilePicUrl || user?.profile_pic_url || target.profilePicUrl || null;

      if (!profilePicUrl && userID && typeof api.getProfilePicture === 'function') {
        profilePicUrl = await api.getProfilePicture(userID);
      }
      if (!profilePicUrl && target.username && typeof api.getProfilePictureByUsername === 'function') {
        profilePicUrl = await api.getProfilePictureByUsername(target.username);
      }
      if (!profilePicUrl) return message.reply('No profile picture is available for that user.');
      if (typeof api.sendPhotoFromUrl !== 'function') return message.reply('Profile-picture sending is unavailable.');

      return api.sendPhotoFromUrl(threadID, profilePicUrl, {
        replyTo: event?.messageID || undefined
      });
    } catch (error) {
      return message.reply(`Could not get the profile picture: ${error.message}`);
    }
  },

  resolveTarget
};

async function resolveTarget(api, args = [], event = {}, threadID, senderID) {
  const input = String(args[0] || '').replace(/^@/, '').replace(/[\s,]+$/, '');
  if (input) {
    return /^\d+$/.test(input) || /^u_\d+$/.test(input)
      ? { userID: input }
      : { username: input };
  }

  const mention = firstMention(event.mentions);
  if (mention) return mention;

  if (event.replyTo) {
    const replied = await findReplyTarget(api, event, threadID);
    if (replied) {
      return {
        userID: getMessageSenderID(replied),
        username: getUsername(replied),
        profilePicUrl: replied.profilePicUrl || replied.profile_pic_url
      };
    }
  }

  return senderID ? { userID: String(senderID) } : {};
}

async function loadUser(api, target) {
  if (target.userID && typeof api.getUserInfo === 'function') {
    return api.getUserInfo(String(target.userID));
  }
  if (target.username && typeof api.getUserInfoByUsername === 'function') {
    return api.getUserInfoByUsername(target.username);
  }
  return target;
}

function firstMention(mentions) {
  if (!mentions) return null;
  if (Array.isArray(mentions)) {
    const mention = mentions[0];
    if (!mention) return null;
    if (typeof mention === 'string') return parseMentionValue(mention);
    return {
      userID: getUserID(mention),
      username: getUsername(mention) || mention.username || mention.name
    };
  }
  if (typeof mentions !== 'object') return null;

  const [key, value] = Object.entries(mentions)[0] || [];
  if (!key) return null;
  if (value && typeof value === 'object') {
    return {
      userID: getUserID(value),
      username: getUsername(value) || key
    };
  }
  return parseMentionValue(/^\d+$/.test(String(value || '')) ? value : key);
}

function parseMentionValue(value) {
  const normalized = String(value || '').replace(/^@/, '');
  return /^\d+$/.test(normalized) || /^u_\d+$/.test(normalized)
    ? { userID: normalized }
    : normalized ? { username: normalized } : null;
}
