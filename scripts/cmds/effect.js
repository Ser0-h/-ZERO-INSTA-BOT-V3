'use strict';

const EFFECT_NAMES = new Set(['love', 'gift', 'celebration', 'fire']);
const availableEffects = [...EFFECT_NAMES].join(', ');

module.exports = {
  config: {
    name: 'effect',
    author: 'Neoaz 🐊',
    category: 'messaging',
    cooldown: 5,
    description: 'Send a test message with an Instagram chat effect.',
    usage: '{pn} [love|gift|celebration|fire] [message]'
  },

  async onStart({ api, args, message, threadID }) {
    const requestedEffect = args.shift() || 'fire';
    const effectName = requestedEffect.toLowerCase();
    if (!EFFECT_NAMES.has(effectName)) {
      return message.reply(`❏ Unknown effect. Available effects: ${availableEffects}.`);
    }

    const text = args.join(' ').trim() || `Effect test: ${effectName}`;
    try {
      const result = await api.sendEffects(threadID, text, effectName);
      return message.reply(`✅ Effect sent: ${result.effect}.`);
    } catch (error) {
      return message.reply(`❌ Effect failed: ${error.message || 'Instagram rejected the request.'}`);
    }
  }
};
