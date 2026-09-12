'use strict';

module.exports = {
  config: {
    name: 'welcome',
    aliases: [],
    author: 'Neoaz 🐊',
    category: 'group',
    role: 1,
    allowWhenMuted: true,
    description: 'Turn group welcome messages on or off.',
    usage: '{pn} on|off'
  },

  async onStart({ args, message, store, threadID }) {
    const setting = parseSetting(args[0]);
    if (setting === null) {
      return message.reply(`Welcome messages: ${store.getWelcome(threadID) ? 'on' : 'off'}`);
    }
    if (setting === undefined) return message.reply('Usage: welcome on|off');
    store.setWelcome(threadID, setting);
    return message.reply(`Welcome messages turned ${setting ? 'on' : 'off'} for this group.`);
  }
};

function parseSetting(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase();
  if (['on', 'enable', 'enabled', 'true', '1'].includes(normalized)) return true;
  if (['off', 'disable', 'disabled', 'false', '0'].includes(normalized)) return false;
  return undefined;
}
