'use strict';

function normalizeEvent(error, event) {
  if (error) return { error, event: null };
  if (!event || typeof event !== 'object') return { error: null, event: null };

  const normalized = { ...event };
  const rawType = normalized.type || normalized.eventType || normalized.event_type || 'unknown';
  normalized.eventType = normalized.eventType || normalized.event_type || rawType;
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
  normalized.threadID = normalized.threadID || normalized.threadId || normalized.thread_id
    || normalized.thread_v2_id || normalized.thread_key || normalized.thread_fbid || null;
  normalized.senderID = normalized.senderID
    || normalized.senderId
    || normalized.sender_id
    || normalized.userID
    || normalized.author
    || normalized.actor_id
    || normalized.author_id
    || normalized.from
    || '';
  normalized.messageID = normalized.messageID || normalized.messageId || normalized.message_id
    || normalized.itemID || normalized.item_id || null;
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
    const reactionObject = normalized.reaction && typeof normalized.reaction === 'object'
      ? normalized.reaction
      : null;
    normalized.reactionStatus = normalized.reactionStatus
      || normalized.reaction_status
      || reactionObject?.reactionStatus
      || reactionObject?.reaction_status
      || reactionObject?.status
      || null;
    const reactionMessageID = normalized.reactionMessageID
      || normalized.reactionMessageId
      || normalized.reaction?.message_id
      || normalized.messageID;
    normalized.targetMessageID = normalized.targetMessageID
      || normalized.targetMessageId
      || normalized.reactionMessageID
      || normalized.reaction?.item_id
      || normalized.reaction?.itemId
      || normalized.messageID
      || null;
    normalized.reactionMessageID = reactionMessageID?.toString() || null;
    if (normalized.targetMessageID) normalized.messageID = String(normalized.targetMessageID);
  }
  normalized.isGroup = normalized.isGroup === true || normalized.is_group === true;
  normalized.updateType = normalized.updateType || normalized.update_type || normalized.event_action
    || normalized.eventAction || normalized.change_type || normalized.log_message_type || null;
  normalized.logMessageType = normalized.logMessageType || normalized.log_message_type || null;
  normalized.action = normalized.action || normalized.event_action || normalized.eventAction || null;
  normalized.addedParticipants = normalized.addedParticipants
    || normalized.added_participants
    || normalized.added_users
    || normalized.added_user_ids
    || normalized.users_added
    || normalized.participants_added
    || normalized.participantsAdded
    || null;
  normalized.removedParticipants = normalized.removedParticipants
    || normalized.removed_participants
    || normalized.removed_users
    || normalized.removed_user_ids
    || normalized.left_users
    || normalized.users_removed
    || normalized.participants_removed
    || normalized.participantsRemoved
    || null;
  normalized.addedParticipant = normalized.addedParticipant || normalized.added_participant || normalized.added_user || null;
  normalized.removedParticipant = normalized.removedParticipant || normalized.removed_participant || normalized.removed_user || null;
  normalized.participants = normalized.participants || normalized.thread_participants || null;
  normalized.users = normalized.users || normalized.thread_users || null;
  normalized.user = normalized.user || normalized.participant || null;
  normalized.reader = normalized.reader || normalized.reader_id || null;
  normalized.from = normalized.from || normalized.senderID || normalized.sender_id || null;
  normalized.presence = normalized.presence || normalized.presence_type || null;
  normalized.isTyping = normalized.isTyping ?? normalized.is_typing;
  normalized.isOnline = normalized.isOnline ?? normalized.is_online;
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
