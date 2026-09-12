'use strict';

const axios = require('axios');
const { setProgress } = require('../../func/progress');

const BASE_URL = 'https://play.nkx.lol';

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
      const response = await axios.get(`${BASE_URL}/search`, {
        params: { q: query, limit: 1 },
        timeout: 25000,
        validateStatus: () => true
      });
      if (response.status >= 400) throw new Error(`Search failed (status ${response.status}).`);
      const selected = response.data?.results?.[0];
      if (!selected) throw new Error('No songs found for your query.');
      const streamUrl = selected.audio_cdn_url || selected.audio_url;
      if (!streamUrl) throw new Error('No playable stream was found for that result.');

      await api.sendVoiceFromUrl(threadID, streamUrl, {
        title: selected.title || query,
        replyTo: event?.messageID || null
      });
      await setProgress(message, '✅');
    } catch (error) {
      await setProgress(message, '❌');
      return message.reply(error.message || 'An error occurred while processing the download.');
    }
  }
};
