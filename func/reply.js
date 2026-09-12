'use strict';

const RESPONSE_EFFECTS = Object.freeze(['love', 'gift', 'celebration', 'fire']);
let responseEffectIndex = 0;

function nextResponseEffect() {
  const effect = RESPONSE_EFFECTS[responseEffectIndex];
  responseEffectIndex = (responseEffectIndex + 1) % RESPONSE_EFFECTS.length;
  return effect;
}

async function replyWithEffect({ api, message, threadID }, content) {
  const effect = nextResponseEffect();
  if (typeof api?.sendEffects === 'function') {
    try {
      return await api.sendEffects(String(threadID), content, effect);
    } catch (_) {
      // Fall back to a normal reply when the effect endpoint is unavailable.
    }
  }
  return message.reply(content);
}

module.exports = { RESPONSE_EFFECTS, nextResponseEffect, replyWithEffect };
