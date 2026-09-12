'use strict';

module.exports = {
  config: {
    name: 'stickermusic',
    aliases: ['sm'],
    author: 'Neoaz 🐊',
    category: 'media',
    cooldown: 10,
    description: 'Search Instagram music and send it as a chat sticker.',
    usage: '{pn} <song name>'
  },

  async onStart({ api, args, message, threadID }) {
    const query = args.join(' ').trim();
    if (!query) return message.reply('Please provide a song name.');

    try {
      const result = await api.stickerMusic(threadID, query);
      const title = result.track?.title || query;
      const artist = result.track?.artist ? ` by ${result.track.artist}` : '';
      return message.reply(`✅ Music sticker sent: ${title}${artist}.`);
    } catch (error) {
      return message.reply(`❌ Music sticker failed: ${error.message || 'Instagram rejected the request.'}`);
    }
  }
};
