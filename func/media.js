'use strict';

function getPublicUrl(args, type) {
  const value = String(args[0] || '').trim();
  if (!value) throw new Error(`Usage: ${type} <public URL>`);

  let url;
  try {
    url = new URL(value);
  } catch (_) {
    throw new Error('Please provide a valid public http(s) URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Please provide a valid public http(s) URL.');
  }
  return url.toString();
}

async function sendUrlMedia({ api, args, message, threadID, type, send }) {
  try {
    const url = getPublicUrl(args, type);
    const result = await send(api, threadID, url);
    return message.reply(`Sent ${type} from URL${result?.messageID ? ` (${result.messageID})` : ''}.`);
  } catch (error) {
    return message.reply(error.message);
  }
}

module.exports = { getPublicUrl, sendUrlMedia };
