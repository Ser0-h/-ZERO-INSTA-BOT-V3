'use strict';

const { normalizeEvent } = require('./handlerCheckData');

function createHandlerAction(bot) {
  return (error, event) => {
    const normalized = normalizeEvent(error, event);
    if (normalized.error) {
      bot.logger.error('Realtime listener error:', normalized.error.message);
    } else if (normalized.event) {
      bot.logger.debug('Realtime event reached bot:', {
        type: normalized.event.type,
        threadID: normalized.event.threadID,
        messageID: normalized.event.messageID,
        senderID: normalized.event.senderID,
        body: normalized.event.body
      });
    } else {
      bot.logger.debug('Realtime listener callback received no event.');
    }
    return bot.handleEvent(normalized.error, normalized.event).catch((handlerError) => {
      bot.logger.error('Event handler failed:', handlerError);
    });
  };
}

module.exports = { createHandlerAction };
