'use strict';

// Guarantee `global.utils` exists before this module destructures it.
require('../../src/global-utils');

const { setProgress, getPublicUrl } = global.utils;

const API_URL = 'https://alldl.neokex.xyz/api/alldl';

module.exports = {
  config: {
    name: 'alldl',
    aliases: ['dl', 'download'],
    author: 'Neoaz',
    category: 'media',
    cooldown: 10,
    description: 'Download public media from a supported URL.',
    usage: '{pn} <public URL>'
  },

  async onStart({ api, args, body, message, threadID }) {
    let sourceUrl;
    try {
      sourceUrl = getPublicUrl([extractUrl(args, body)], 'alldl');
    } catch (error) {
      return message.reply(error.message);
    }

    await setProgress(message, '⌛');
    try {
      const media = await downloadMedia(sourceUrl);
      if (media.kind === 'audio') {
        await api.sendVoiceFromUrl(threadID, media.url, { title: media.title });
      } else if (media.kind === 'image') {
        await api.sendPhotoFromUrl(threadID, media.url);
      } else {
        await message.send({ body: media.title, video: media.url });
      }
      await setProgress(message, '✅');
      return media;
    } catch (error) {
      await setProgress(message, '❌');
      return message.reply(`❌ Download failed: ${getErrorMessage(error)}`);
    }
  }
};

async function downloadMedia(sourceUrl) {
  let axios;
  try {
    axios = require('axios');
  } catch (_) {
    throw new Error('The axios dependency is not installed. Run npm install first.');
  }
  const response = await axios.get(API_URL, {
    params: { url: sourceUrl },
    timeout: 45000,
    maxContentLength: 2 * 1024 * 1024,
    validateStatus: () => true
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Media service returned HTTP ${response.status}.`);
  }

  const payload = response.data;
  const data = unwrapPayload(payload);
  const downloads = getDownloads(data);
  const selected = selectDownload(downloads, data?.type);
  if (!selected) throw new Error(getErrorMessage({ response: { data: payload } }));

  return {
    title: String(data?.title || data?.name || 'Downloaded media'),
    url: selected.url,
    kind: mediaKind(selected, data?.type)
  };
}

function unwrapPayload(payload) {
  return payload?.metadata?.data
    || payload?.data?.metadata?.data
    || payload?.data
    || payload?.metadata
    || payload;
}

function getDownloads(data) {
  if (Array.isArray(data)) return data;
  return data?.downloads || data?.formats || data?.medias || data?.media || [];
}

function selectDownload(downloads, defaultKind = 'video') {
  const usable = downloads.filter((item) => item && typeof item.url === 'string' && /^https?:\/\//i.test(item.url));
  return usable.find((item) => mediaKind(item, defaultKind) === 'video' && String(item.ext || '').toLowerCase() === 'mp4')
    || usable.find((item) => mediaKind(item, defaultKind) === 'video')
    || usable.find((item) => mediaKind(item, defaultKind) === 'image')
    || usable.find((item) => mediaKind(item, defaultKind) === 'audio')
    || null;
}

function mediaKind(item, fallback = 'video') {
  const ext = String(item?.ext || item?.extension || '').toLowerCase().replace(/^\./, '');
  const value = `${item?.type || ''} ${item?.mime || ''} ${item?.label || ''} ${ext}`.toLowerCase();
  if (value.includes('audio') || ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus'].includes(ext)) return 'audio';
  if (value.includes('image') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
  return ['audio', 'image', 'video'].includes(String(fallback).toLowerCase())
    ? String(fallback).toLowerCase()
    : 'video';
}

function extractUrl(args, body = '') {
  const text = [...(Array.isArray(args) ? args : []), String(body || '')].join(' ');
  const match = text.match(/https?:\/\/[^\s<>"'`]+/i);
  return String(match?.[0] || args?.[0] || '').replace(/[),.;!?]+$/g, '');
}

function getErrorMessage(error) {
  return error?.response?.data?.message
    || error?.response?.data?.error
    || error?.message
    || 'The media service did not return a usable download.';
}

module.exports = { ...module.exports, downloadMedia, extractUrl, mediaKind, selectDownload, unwrapPayload };
