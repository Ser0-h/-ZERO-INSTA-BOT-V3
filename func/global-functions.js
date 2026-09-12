'use strict';

// Goatbot-parity global utility library.
//
// Every helper here mirrors a function from Goatbot-V2's root `utils.js` so
// command and event modules written for Goatbot can be pasted in unchanged.
// It is intentionally dependency-free: the only runtime dependency is `axios`,
// which the bot already ships with.

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const EXT_BY_ATTACHMENT_TYPE = Object.freeze({
  photo: 'png',
  image: 'png',
  animated_image: 'gif',
  video: 'mp4',
  audio: 'mp3',
  sticker: 'webp',
  file: 'bin',
  share: 'txt'
});

// A compact mime -> extension table covering what Instagram/Messenger actually
// serves. Unknown types fall back to "unknow" exactly like Goatbot.
const EXT_BY_MIME = Object.freeze({
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/heic': 'heic',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
  'application/json': 'json',
  'application/zip': 'zip',
  'text/plain': 'txt',
  'text/html': 'html'
});

const ANSI = Object.freeze({
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
});

function colorize(code) {
  return (value) => `${code}${value}${ANSI.reset}`;
}

function hexToAnsi(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!match) return null;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (text) => `\x1b[38;2;${r};${g};${b}m${text}${ANSI.reset}`;
}

const colors = {
  reset: (text) => `${ANSI.reset}${text}`,
  bold: colorize(ANSI.bold),
  dim: colorize(ANSI.dim),
  red: colorize(ANSI.red),
  green: colorize(ANSI.green),
  yellow: colorize(ANSI.yellow),
  blue: colorize(ANSI.blue),
  magenta: colorize(ANSI.magenta),
  cyan: colorize(ANSI.cyan),
  white: colorize(ANSI.white),
  gray: colorize(ANSI.gray),
  grey: colorize(ANSI.gray),
  hex: (hex) => hexToAnsi(hex) || ((text) => text)
};

function getType(value) {
  return Object.prototype.toString.call(value).slice(8, -1);
}

function isNumber(value) {
  return value !== '' && !Number.isNaN(parseFloat(value));
}

function isHexColor(value) {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

function randomString(max = 10, onlyOnce = false, possible) {
  let length = Number(max);
  if (!length || Number.isNaN(length)) length = 10;
  const pool = possible || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < length; i += 1) {
    let index = Math.floor(Math.random() * pool.length);
    if (onlyOnce) {
      let guard = 0;
      while (text.includes(pool[index]) && guard < 1000) {
        index = Math.floor(Math.random() * pool.length);
        guard += 1;
      }
    }
    text += pool[index];
  }
  return text;
}

function randomNumber(min, max) {
  let low = min;
  let high = max;
  if (max === undefined || max === null) {
    high = low;
    low = 0;
  }
  if (low === undefined || low === null || Number.isNaN(Number(low)) || low === '') {
    throw new Error('The first argument (min) must be a number');
  }
  if (high === undefined || high === null || Number.isNaN(Number(high)) || high === '') {
    throw new Error('The second argument (max) must be a number');
  }
  const lo = Math.ceil(Number(low));
  const hi = Math.floor(Number(high));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function convertTime(
  milliSeconds,
  replaceSeconds = 's',
  replaceMinutes = 'm',
  replaceHours = 'h',
  replaceDays = 'd',
  replaceMonths = 'M',
  replaceYears = 'y',
  notShowZero = false
) {
  if (typeof replaceSeconds === 'boolean') {
    notShowZero = replaceSeconds;
    replaceSeconds = 's';
  }
  const total = Math.max(0, Number(milliSeconds) || 0);
  const parts = [
    { value: Math.floor(total / 1000 / 60 / 60 / 24 / 30 / 12), replace: replaceYears },
    { value: Math.floor((total / 1000 / 60 / 60 / 24 / 30) % 12), replace: replaceMonths },
    { value: Math.floor((total / 1000 / 60 / 60 / 24) % 30), replace: replaceDays },
    { value: Math.floor((total / 1000 / 60 / 60) % 24), replace: replaceHours },
    { value: Math.floor((total / 1000 / 60) % 60), replace: replaceMinutes },
    { value: Math.floor((total / 1000) % 60), replace: replaceSeconds }
  ];
  let formatted = '';
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part.value) formatted += part.value + part.replace;
    else if (formatted !== '') formatted += `00${part.replace}`;
    else if (i === parts.length - 1) formatted += `0${part.replace}`;
  }
  if (formatted === '') formatted = `0${replaceSeconds}`;
  if (notShowZero) formatted = formatted.replace(/00\w+/g, '');
  return formatted;
}

function formatNumber(number, locale = 'en-US') {
  if (Number.isNaN(Number(number))) throw new Error('The first argument (number) must be a number');
  return Number(number).toLocaleString(locale);
}

function getExtFromAttachmentType(type) {
  return EXT_BY_ATTACHMENT_TYPE[String(type || '').toLowerCase()] || 'txt';
}

function getExtFromMimeType(mimeType = '') {
  const key = String(mimeType).split(';')[0].trim().toLowerCase();
  return EXT_BY_MIME[key] || 'unknow';
}

function getExtFromUrl(url = '') {
  if (!url || typeof url !== 'string') throw new Error('The first argument (url) must be a string');
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch (_) {
    pathname = url.split('?')[0].split('#')[0];
  }
  const name = pathname.slice(pathname.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  if (dot === -1 || dot === name.length - 1) return 'noext';
  return name.slice(dot + 1).toLowerCase();
}

function removeHomeDir(fullPath) {
  if (!fullPath || typeof fullPath !== 'string') {
    throw new Error('The first argument (fullPath) must be a string');
  }
  let result = fullPath;
  while (result.includes(process.cwd())) result = result.replace(process.cwd(), '');
  return result;
}

function splitPage(arr, limit) {
  const size = Math.max(1, Number(limit) || 1);
  const allPage = [];
  for (let i = 0; i < (arr?.length || 0); i += size) allPage.push(arr.slice(i, i + size));
  return { totalPage: allPage.length, allPage };
}

function getTime(timestamps, format) {
  let value = timestamps;
  let pattern = format;
  if (!pattern && typeof timestamps === 'string') {
    pattern = timestamps;
    value = undefined;
  }
  const date = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('The first argument (timestamps) must be a valid date');
  if (!pattern) return date.toISOString();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const tokens = {
    YYYY: date.getFullYear(),
    YY: pad(date.getFullYear() % 100),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
    SSS: pad(date.getMilliseconds(), 3)
  };
  return pattern.replace(/YYYY|YY|MM|DD|HH|mm|ss|SSS/g, (token) => tokens[token]);
}

function jsonStringifyColor(obj, filter, indent = 0, level = 0) {
  const pad = ' '.repeat(indent * level);
  const childPad = ' '.repeat(indent * (level + 1));
  if (typeof obj === 'string') return colors.green(`"${obj}"`);
  if (typeof obj === 'number' || typeof obj === 'boolean' || obj === null) return colors.yellow(obj);
  if (obj === undefined) return colors.gray('undefined');
  if (typeof obj === 'function') return colors.gray('[Function]');
  if (Array.isArray(obj)) {
    if (!obj.length) return '[]';
    const items = obj.map((item) => childPad + jsonStringifyColor(item, filter, indent, level + 1));
    return `[\n${items.join(',\n')}\n${pad}]`;
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).filter((key) => (typeof filter === 'function' ? filter(key, obj[key]) : true));
    if (!keys.length) return '{}';
    const items = keys.map((key) => (
      `${childPad}${colors.cyan(`"${key}"`)}: ${jsonStringifyColor(obj[key], filter, indent, level + 1)}`
    ));
    return `{\n${items.join(',\n')}\n${pad}}`;
  }
  return String(obj);
}

function message(api, event) {
  const sendError = async (error) => {
    const detail = typeof error === 'object' && error && !error.stack
      ? JSON.stringify(error, null, 2)
      : `${error?.name || error?.error || 'Error'}: ${error?.message || error}`;
    return api.sendMessage(removeHomeDir(String(detail)), event.threadID, event.messageID);
  };
  return {
    send: (form, callback) => api.sendMessage(form, event.threadID, callback),
    reply: (form, callback) => api.sendMessage(form, event.threadID, callback, event.messageID),
    unsend: (messageID, callback) => api.unsendMessage(messageID, callback),
    reaction: (emoji, messageID, callback) => api.setMessageReaction(emoji, messageID, callback, true),
    err: sendError,
    error: sendError
  };
}

async function downloadFile(url = '', filePath = '') {
  if (!url || typeof url !== 'string') throw new Error('The first argument (url) must be a string');
  if (!filePath || typeof filePath !== 'string') throw new Error('The second argument (path) must be a string');
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  await fs.promises.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  await fs.promises.writeFile(filePath, Buffer.from(response.data));
  return filePath;
}

async function getStreamFromURL(url = '', pathName = '', options = {}) {
  if (pathName && typeof pathName === 'object') {
    options = pathName;
    pathName = '';
  }
  if (!url || typeof url !== 'string') throw new Error('The first argument (url) must be a string');
  const response = await axios({ url, method: 'GET', responseType: 'stream', ...options });
  const name = pathName
    || `${randomString(10)}.${response.headers['content-type'] ? getExtFromMimeType(response.headers['content-type']) : 'noext'}`;
  response.data.path = name;
  return response.data;
}

async function getStreamsFromAttachment(attachments = []) {
  const streams = [];
  for (const attachment of attachments) {
    const url = attachment?.url;
    if (!url) continue;
    const fileName = `${randomString(10)}.${getExtFromUrl(url)}`;
    streams.push({
      pending: axios({ url, method: 'GET', responseType: 'stream' }),
      fileName
    });
  }
  for (let i = 0; i < streams.length; i += 1) {
    const stream = await streams[i].pending;
    stream.data.path = streams[i].fileName;
    streams[i] = stream.data;
  }
  return streams;
}

async function translateAPI(text, lang = 'en') {
  const res = await axios.get(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(lang)}&dt=t&q=${encodeURIComponent(text)}`
  );
  return res.data[0][0][0];
}

async function translate(text, lang = 'en') {
  if (typeof text !== 'string') throw new Error('The first argument (text) must be a string');
  return translateAPI(text, lang);
}

async function shortenURL(url) {
  try {
    const result = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
    return result.data;
  } catch (error) {
    return new Error(error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

const log = Object.freeze({
  info: (head, ...rest) => console.log(`${colors.cyan(`[${head}]`)}`, ...rest),
  warn: (head, ...rest) => console.warn(`${colors.yellow(`[${head}]`)}`, ...rest),
  err: (head, ...rest) => console.error(`${colors.red(`[${head}]`)}`, ...rest),
  error: (head, ...rest) => console.error(`${colors.red(`[${head}]`)}`, ...rest),
  success: (head, ...rest) => console.log(`${colors.green(`[${head}]`)}`, ...rest),
  master: (head, ...rest) => console.log(`${colors.magenta(`[${head}]`)}`, ...rest)
});

module.exports = {
  colors,
  convertTime,
  downloadFile,
  formatNumber,
  getExtFromAttachmentType,
  getExtFromMimeType,
  getExtFromUrl,
  getStreamFromURL,
  getStreamFromUrl: getStreamFromURL,
  getStreamsFromAttachment,
  getTime,
  getType,
  isHexColor,
  isNumber,
  jsonStringifyColor,
  log,
  message,
  randomNumber,
  randomString,
  removeHomeDir,
  shortenURL,
  splitPage,
  translate,
  translateAPI
};
