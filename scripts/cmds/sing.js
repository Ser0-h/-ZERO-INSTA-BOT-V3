'use strict';

const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setProgress } = require('../../func/progress');

const BASE_URL = 'https://play.nkx.lol';
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const REQUEST_HEADERS = { 'User-Agent': 'Insta-Bot-V1/1.0' };

function resolveUrl(uri, baseUrl) {
  try {
    return new URL(uri, baseUrl).href;
  } catch (_) {
    return uri;
  }
}

function parsePlaylist(text, baseUrl) {
  let initUrl = null;
  const segments = [];
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXT-X-MAP:')) {
      const match = line.match(/URI="([^"]+)"/);
      if (match) initUrl = resolveUrl(match[1], baseUrl);
    } else if (!line.startsWith('#')) {
      segments.push(resolveUrl(line, baseUrl));
    }
  }
  return { initUrl, segments };
}

async function fetchPlaylist(url) {
  const response = await axios.get(url, {
    headers: REQUEST_HEADERS,
    timeout: 20000,
    responseType: 'text'
  });
  const text = typeof response.data === 'string' ? response.data : String(response.data);
  if (text.includes('#EXT-X-STREAM-INF')) {
    const variant = text.split(/\r?\n/).map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'));
    if (!variant) throw new Error('The audio playlist has no stream variant.');
    return fetchPlaylist(resolveUrl(variant, url));
  }
  return parsePlaylist(text, url);
}

async function downloadHlsAudio(streamUrl) {
  const { initUrl, segments } = await fetchPlaylist(streamUrl);
  if (!segments.length) throw new Error('The audio playlist has no segments.');

  const buffers = [];
  let totalBytes = 0;
  const urls = initUrl ? [initUrl, ...segments] : segments;
  for (const url of urls) {
    const response = await axios.get(url, {
      headers: REQUEST_HEADERS,
      responseType: 'arraybuffer',
      timeout: 20000
    });
    totalBytes += response.data.byteLength;
    if (totalBytes > MAX_ATTACHMENT_BYTES) {
      throw new Error('The audio exceeds Instagram\'s 25MB limit.');
    }
    buffers.push(Buffer.from(response.data));
  }
  return { buffer: Buffer.concat(buffers), extension: initUrl ? 'm4a' : 'aac' };
}

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

  async onStart({ args, event, message }) {
    const query = args.join(' ').trim();
    if (!query) return message.reply('Please provide a song name.');
    await setProgress(message, '⌛');

    let filePath;
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

      const { buffer, extension } = await downloadHlsAudio(streamUrl);
      filePath = path.join(os.tmpdir(), `insta-bot-sing-${process.pid}-${Date.now()}.${extension}`);
      await fs.promises.writeFile(filePath, buffer);
      await message.send({ body: selected.title || query, attachment: filePath });
      await setProgress(message, '✅');
    } catch (error) {
      await setProgress(message, '❌');
      return message.reply(error.message || 'An error occurred while processing the download.');
    } finally {
      if (filePath) await fs.promises.unlink(filePath).catch(() => {});
    }
  }
};
