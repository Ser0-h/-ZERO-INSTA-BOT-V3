'use strict';

// Guarantee `global.utils` exists before this module destructures it.
require('../../src/global-utils');

const { extractImageUrl, findReplyTarget } = global.utils;

const FALLBACK_EFFECTS = Object.freeze([
  { name: 'love', style: 1000, aliases: ['heart', 'hearts', 'kiss'] },
  { name: 'angry', style: 1001, aliases: ['mad', 'rage', 'anger'] },
  { name: 'laugh', style: 1002, aliases: ['haha', 'lol', 'laughing', 'funny'] },
  { name: 'cry', style: 1003, aliases: ['sad', 'crying', 'tears'] }
]);

module.exports = {
  config: {
    name: 'aveffect',
    aliases: ['avfx', 'powereffect', 'powerup'],
    author: 'Neoaz 🐊',
    category: 'messaging',
    cooldown: 8,
    role: 0,
    description: 'Send a message with an Instagram avatar (power-up) effect.',
    longDescription: 'Uploads an animation and sends it as an avatar power-up effect. '
      + 'Supply the animation as a public URL, an inline base64/data URL, or a reply to a GIF/video.',
    usage: '{pn} <love|angry|laugh|cry> <message> | {pn} list'
  },

  async onStart({ api, args, event, message, threadID }) {
    if (typeof api.sendAvatarEffect !== 'function') {
      return message.reply('❌ Avatar effects are unavailable on this chat API build.');
    }

    const first = String(args[0] || '').toLowerCase();
    if (!first || first === 'list') {
      const effects = resolveEffects(api);
      return message.reply([
        'Avatar effects',
        '',
        ...effects.map((effect) => `- ${effect.name} (${effect.style})${effect.aliases.length ? ` — ${effect.aliases.join(', ')}` : ''}`),
        '',
        'Usage: aveffect <effect> <message> [media URL]'
      ].join('\n'));
    }

    const effect = resolveEffectName(api, first);
    const available = resolveEffects(api).map((item) => item.name).join(', ');
    if (!effect) return message.reply(`❌ Unknown avatar effect. Available: ${available}.`);

    const mediaUrl = await resolveMediaUrl(args, event, threadID, api);
    const text = args.slice(1).filter((arg) => !isUrl(arg)).join(' ').trim() || `Avatar effect: ${effect}`;

    try {
      await message.react('⌛');
      const result = await api.sendAvatarEffect(threadID, text, effect, mediaUrl ? { mediaUrl } : undefined);
      await message.react('✅');
      return message.reply(`✅ Avatar effect sent: ${result?.effect || effect}.`);
    } catch (error) {
      await message.react('❌');
      return message.reply(`❌ Avatar effect failed: ${error.message || 'Instagram rejected the request.'}`);
    }
  }
};

function resolveEffects(api) {
  try {
    const listed = typeof api.listAvatarEffects === 'function' ? api.listAvatarEffects() : null;
    if (Array.isArray(listed) && listed.length) {
      return listed.map((effect) => ({
        name: String(effect.name || '').toLowerCase(),
        style: Number(effect.style) || 0,
        aliases: Array.isArray(effect.aliases) ? effect.aliases : []
      })).filter((effect) => effect.name);
    }
  } catch (_) {
    // Fall back to the known styles when the API cannot enumerate them.
  }
  return FALLBACK_EFFECTS.map((effect) => ({ ...effect, aliases: [...effect.aliases] }));
}

function resolveEffectName(api, value) {
  const needle = String(value || '').trim().toLowerCase();
  if (!needle) return null;
  for (const effect of resolveEffects(api)) {
    if (effect.name === needle || effect.aliases.includes(needle) || String(effect.style) === needle) {
      return effect.name;
    }
  }
  return null;
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

async function resolveMediaUrl(args, event, threadID, api) {
  const direct = args.slice(1).find((arg) => isUrl(arg));
  if (direct) return direct.trim();
  if (!event?.replyTo) return null;
  try {
    const target = await findReplyTarget(api, event, threadID);
    return extractImageUrl(target) || null;
  } catch (_) {
    return null;
  }
}

module.exports.resolveEffectName = resolveEffectName;
module.exports.resolveEffects = resolveEffects;
