'use strict';

async function setProgress(message, reaction) {
  if (typeof message?.react !== 'function') return;
  try {
    await message.react(reaction);
  } catch (_) {
    // Progress reactions are optional and must not hide the command result.
  }
}

module.exports = { setProgress };
