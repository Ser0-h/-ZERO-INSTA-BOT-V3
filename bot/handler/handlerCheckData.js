'use strict';

function normalizeEvent(error, event) {
  if (error) return { error, event: null };
  if (!event || typeof event !== 'object') return { error: null, event: null };

  const normalized = { ...event };
  const rawType = normalized.type || normalized.eventType || normalized.event_type || 'unknown';
  normalized.eventType = normalized.eventType || rawType;
  normalized.type = {
    message_sync: 'message',
    reaction: 'message_reaction',
    thread_event: 'event',
    typ: 'event',
    read_receipt: 'event',
    thread_update: 'event',
    message_unsent: 'event',
    presence: 'event'
  }[rawType] || rawType;
  normalized.threadID = normalized.threadID || normalized.threadId || normalized.thread_id || null;
  normalized.senderID = normalized.senderID
    || normalized.senderId
    || normalized.sender_id
    || normalized.userID
    || normalized.author
    || normalized.from
    || '';
  normalized.messageID = normalized.messageID || normalized.messageId || normalized.itemID || null;
  const replyTarget = normalized.replyTo
    || normalized.reply_to
    || normalized.reply_to_item_id
    || normalized.replied_to_item_id
    || normalized.reply_to_item?.item_id
    || normalized.reply_to_item?.id
    || normalized.reply_to_message_id
    || normalized.reply_to_message?.item_id
    || normalized.reply_to_message?.id
    || normalized.replied_to_message?.item_id
    || normalized.replied_to_message?.id
    || normalized.replied_to_item?.item_id
    || normalized.replied_to_item?.id
    || normalized.quoted_item?.item_id
    || normalized.quoted_item?.id
    || normalized.in_reply_to_id
    || normalized.replyToMessage?.messageID
    || normalized.replyToMessage?.messageId
    || normalized.replyToMessage?.itemID
    || null;
  normalized.replyTo = replyTarget?.toString() || null;
  if (normalized.type === 'message_reaction') {
    const reactionMessageID = normalized.reactionMessageID
      || normalized.reactionMessageId
      || normalized.reaction?.message_id
      || normalized.messageID;
    normalized.targetMessageID = normalized.targetMessageID
      || normalized.targetMessageId
      || normalized.reactionMessageID
      || normalized.reaction?.item_id
      || normalized.reaction?.itemId
      || null;
    normalized.reactionMessageID = reactionMessageID?.toString() || null;
    if (normalized.targetMessageID) normalized.messageID = String(normalized.targetMessageID);
  }
  normalized.isGroup = normalized.isGroup === true || normalized.is_group === true;
  normalized.updateType = normalized.updateType || normalized.update_type || normalized.event_action || null;
  normalized.action = normalized.action || normalized.event_action || null;
  normalized.addedParticipants = normalized.addedParticipants
    || normalized.added_participants
    || normalized.added_users
    || normalized.added_user_ids
    || normalized.users_added
    || null;
  normalized.removedParticipants = normalized.removedParticipants
    || normalized.removed_participants
    || normalized.removed_users
    || normalized.removed_user_ids
    || normalized.left_users
    || normalized.users_removed
    || null;
  normalized.participants = normalized.participants || normalized.thread_participants || null;
  normalized.users = normalized.users || normalized.thread_users || null;
  normalized.user = normalized.user || normalized.participant || null;
  if (!normalized.isGroup && (String(normalized.threadID || '').includes(':')
      || Array.isArray(normalized.addedParticipants)
      || Array.isArray(normalized.removedParticipants))) {
    normalized.isGroup = true;
  }
  return { error: null, event: normalized };
}

function isRoutableEvent(event) {
  return Boolean(event && event.threadID && ['message', 'message_reaction', 'event'].includes(event.type));
}

module.exports = { normalizeEvent, isRoutableEvent };
