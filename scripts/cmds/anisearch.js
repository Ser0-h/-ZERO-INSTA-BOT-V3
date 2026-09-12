'use strict';

// Guarantee `global.utils` exists before this module destructures it.
require('../../src/global-utils');

const axios = require('axios');
const { setProgress } = global.utils;

const API_BASE = 'https://alldl.neokex.xyz/api';

async function requestJSON(url) {
  const response = await axios.get(url, { timeout: 45000, validateStatus: () => true });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Media service returned HTTP ${response.status}`);
  }
  return response.data;
}

function getErrorMessage(error) {
  return error?.response?.data?.message
    || error?.response?.data?.error
    || error?.message
    || 'The media service did not return a usable result.';
}

async function getRandomMatch(query) {
  const payload = await requestJSON(`${API_BASE}/tik-sr?q=${encodeURIComponent(query)}`);
  const results = (payload?.results || payload?.data?.results || []).filter((item) => item.url);
  if (!results.length) throw new Error('No matching anime videos were found.');
  return results[Math.floor(Math.random() * results.length)].url;
}

async function getVideo(url) {
  const payload = await requestJSON(`${API_BASE}/alldl?url=${encodeURIComponent(url)}`);
  const data = payload?.metadata?.data || payload?.data?.metadata?.data || payload?.data || payload?.metadata;
  const downloads = data?.downloads || [];
  const download = downloads.find((item) => item.url && item.ext === 'mp4' && !String(item.label).toLowerCase().includes('audio'))
    || downloads.find((item) => item.url && !String(item.label).toLowerCase().includes('audio'));
  if (!data?.title || !download) throw new Error(getErrorMessage({ response: { data: payload } }));
  return { title: data.title, url: download.url };
}

module.exports = {
  config: {
    name: 'anisearch',
    author: 'Neoaz 🐊',
    category: 'media',
    cooldown: 5,
    description: 'Find a random anime video for a search query.',
    usage: '{pn} <anime or character>'
  },

  async onStart({ args, message }) {
    const query = args.join(' ').trim();
    if (!query) return message.reply('Usage: anisearch <anime or character>');
    await setProgress(message, '⌛');
    try {
      const video = await getVideo(await getRandomMatch(query));
      await message.send({ body: video.title, video: video.url });
      await setProgress(message, '✅');
    } catch (error) {
      await setProgress(message, '❌');
      return message.reply(`❌ ${getErrorMessage(error)}`);
    }
  }
};
