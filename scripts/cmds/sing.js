'use strict';

const { setProgress } = require('../../func/progress');

module.exports = {
  config: {
    name: 'sing',
    aliases: ['song', 'music'],
    author: 'Neoaz 🐊',
    category: 'media',
    cooldown: 5,
    description: 'Search and download a song.',
    usage: '{pn} <song name>'
  },

  async onStart({ api, args, event, message, threadID }) {
    const query = args.join(' ').trim();
    if (!query) return message.reply('Please provide a song name.');
    await setProgress(message, '⌛');

    try {
      const result = await api.stickerMusic(threadID, query, { send: false, initialize: false });
      const track = result?.track || {};
      const audioUrl = getAudioUrl(track);
      if (!audioUrl) throw new Error('Instagram did not return a playable audio URL for that song.');

      await api.sendVoiceFromUrl(threadID, audioUrl, {
        title: track.title || query,
        replyTo: event?.messageID || null
      });
      await setProgress(message, '✅');
    } catch (error) {
      await setProgress(message, '❌');
      return message.reply(error.message || 'An error occurred while processing the download.');
    }
  }
};

function getAudioUrl(track) {
  return track?.audioURL
    || track?.audioUrl
    || track?.progressiveDownloadURL
    || track?.progressive_download_url
    || null;
}

module.exports = { ...module.exports, getAudioUrl };
