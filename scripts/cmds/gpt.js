'use strict';

const axios = require('axios');
const { setProgress, extractImageUrl, findReplyTarget } = global.utils;

const API_URL = 'https://flux-context.onrender.com';
const DEFAULT_QUALITY = 'low';
const DEFAULT_RESOLUTION = '1k';
const DEFAULT_ASPECT_RATIO = '1:1';
const ASPECT_RATIOS = new Set(['1:1', '16:9', '9:16', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '21:9']);
const POLL_INTERVAL = 5000;
const MAX_POLLS = 120;
const activeRequests = new Set();

module.exports = {
  config: {
    name: 'gpt',
    author: 'Neoaz 🐊',
    category: 'image',
    cooldown: 5,
    description: 'Generate or edit images with GPT Image.',
    usage: '{pn} <prompt> [--quality low|medium|high] [--resolution 1k|2k|4k] [--ar 1:1|16:9|9:16]'
  },

  async onStart({ api, args, event, message, senderID, threadID }) {
    const owner = String(senderID || event.senderID || threadID || 'unknown');
    if (activeRequests.has(owner)) return message.reply('An image request is already running for you. Please wait.');

    const options = parseArguments(args);
    if (!options.prompt) return message.reply('Please enter a prompt for the image.');
    const imageUrl = await resolveImageUrl(api, event, threadID);
    activeRequests.add(owner);
    await setProgress(message, '⌛');

    try {
      const payload = {
        prompt: options.prompt,
        quality: options.quality,
        resolution: options.resolution,
        ratio: options.aspectRatio,
        wait: false
      };
      if (imageUrl) payload.imageUrl = imageUrl;

      const { data: submitted } = await axios.post(`${API_URL}/generate`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });
      const taskID = getTaskID(submitted);
      if (!taskID) throw new Error(getAPIMessage(submitted) || 'The image service did not return a task ID.');
      await message.reply(`${imageUrl ? 'Editing' : 'Generating'} your image...\nTask ID: ${taskID}`);

      const result = await pollTask(taskID);
      const resultURL = getImageURL(result);
      if (!resultURL) throw new Error(getAPIMessage(result) || 'The image service did not return an image URL.');
      await message.send({ body: 'Here is your image.', image: resultURL });
      await setProgress(message, '✅');
    } catch (error) {
      await setProgress(message, '❌');
      return message.reply(`Image generation failed:\n${getErrorMessage(error)}`);
    } finally {
      activeRequests.delete(owner);
    }
  }
};

function parseArguments(args) {
  const remaining = [];
  let quality = DEFAULT_QUALITY;
  let resolution = DEFAULT_RESOLUTION;
  let aspectRatio = DEFAULT_ASPECT_RATIO;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--quality' && args[index + 1]) quality = args[++index].toLowerCase();
    else if (arg === '--resolution' && args[index + 1]) resolution = args[++index].toLowerCase();
    else if (arg === '--ar' && ASPECT_RATIOS.has(args[index + 1])) aspectRatio = args[++index];
    else remaining.push(arg);
  }
  if (!['low', 'medium', 'high'].includes(quality)) quality = DEFAULT_QUALITY;
  if (!['1k', '2k', '4k'].includes(resolution)) resolution = DEFAULT_RESOLUTION;
  return { prompt: remaining.join(' ').trim(), quality, resolution, aspectRatio };
}

async function resolveImageUrl(api, event, threadID) {
  const currentImage = extractImageUrl(event);
  if (currentImage || !event.replyTo) return currentImage;

  const replyTarget = await findReplyTarget(api, event, threadID);
  return extractImageUrl(replyTarget);
}

async function pollTask(taskID) {
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    const { data } = await axios.get(`${API_URL}/task/${encodeURIComponent(taskID)}`, { timeout: 30000 });
    const status = String(data?.status || data?.state || '').toLowerCase();
    if (getImageURL(data)) return data;
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
      throw new Error(getAPIMessage(data) || `Task ${status}.`);
    }
  }
  throw new Error('The image service did not finish in time.');
}

function getTaskID(data) {
  return data?.taskId || data?.task_id || data?.id || data?.data?.taskId || data?.data?.task_id;
}

function getImageURL(data) {
  const candidates = [
    data?.imageUrl, data?.image_url, data?.url, data?.output, data?.result,
    data?.output?.imageUrl, data?.output?.image_url, data?.output?.url,
    data?.result?.imageUrl, data?.result?.image_url, data?.result?.url,
    data?.data?.imageUrl, data?.data?.image_url, data?.data?.url,
    data?.images?.[0], data?.images?.[0]?.url,
    data?.result?.images?.[0], data?.result?.images?.[0]?.url,
    data?.data?.images?.[0], data?.data?.images?.[0]?.url
  ];
  return candidates.find((value) => typeof value === 'string' && /^https?:\/\//i.test(value));
}

function getAPIMessage(data) {
  const message = data?.error?.message || data?.error || data?.message || data?.detail;
  return typeof message === 'string' ? message : '';
}

function getErrorMessage(error) {
  return getAPIMessage(error?.response?.data) || error?.message || 'Unknown error';
}
