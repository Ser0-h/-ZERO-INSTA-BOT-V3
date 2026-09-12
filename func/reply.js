'use strict';

const RESPONSE_EFFECTS = Object.freeze(['love', 'gift', 'celebration', 'fire']);
let responseEffectIndex = 0;

function nextResponseEffect() {
  const effect = RESPONSE_EFFECTS[responseEffectIndex];
  responseEffectIndex = (responseEffectIndex + 1) % RESPONSE_EFFECTS.length;
  return effect;
}

async function replyWithEffect({ message }, content) {
  // The effect endpoint sends a standalone message and cannot preserve the reply target.
  return message.reply(content);
}

module.exports = { RESPONSE_EFFECTS, nextResponseEffect, replyWithEffect };
