'use strict';

function getMessageID(item) {
  return item?.messageID
    || item?.messageId
    || item?.itemID
    || item?.item_id
    || item?.message_id
    || null;
}

function getUserID(user) {
  return user?.userID
    || user?.userId
    || user?.user_id
    || user?.pk
    || user?.pk_id
    || user?.id
    || null;
}

function getMessageSenderID(item) {
  const sender = item?.user || item?.sender || item?.author || item?.from || item?.profile;
  return getUserID(sender)
    || item?.senderID
    || item?.senderId
    || item?.sender_id
    || item?.userID
    || item?.userId
    || item?.user_id
    || null;
}

function getUsername(user) {
  return user?.username
    || user?.user?.username
    || user?.sender?.username
    || user?.author?.username
    || user?.profile?.username
    || null;
}

function extractImageUrl(message) {
  const attachment = (message?.attachments || []).find((item) => item?.url && (
    /^(photo|image|png|animated_image)$/i.test(String(item.type || ''))
    || /\.(?:jpe?g|png|webp|gif|bmp|heic|avif)(?:[?#]|$)/i.test(item.url)
  ));
  if (attachment?.url) return attachment.url;

  const candidates = [
    message?.media?.image_versions2?.candidates?.[0]?.url,
    message?.media?.url,
    message?.image_versions2?.candidates?.[0]?.url,
    message?.image?.url,
    message?.animated_media?.images?.fixed_height?.url,
    message?.animated_media?.images?.original?.url
  ];
  return candidates.find((url) => typeof url === 'string' && /^https?:\/\//i.test(url)) || null;
}

function asItems(result) {
  if (Array.isArray(result)) return result;
  const items = result?.messages
    || result?.items
    || result?.thread?.items
    || result?.data?.messages
    || result?.data?.items
    || [];
  return Array.isArray(items) ? items : [];
}

function replyCandidates(event) {
  return [
    event?.replyToMessage,
    event?.reply_to_message,
    event?.replied_to_message,
    event?.replyToItem,
    event?.reply_to_item,
    event?.replied_to_item,
    event?.quoted_item,
    event?.messageReply
  ].filter((item) => item && typeof item === 'object');
}

async function findReplyTarget(api, event, threadID) {
  const replyID = event?.replyTo?.toString();
  if (!replyID) return null;

  const direct = replyCandidates(event).find((item) => {
    const id = getMessageID(item);
    return !id || id.toString() === replyID;
  });
  if (direct && (getMessageSenderID(direct) || extractImageUrl(direct))) return direct;

  for (const method of ['getMessagesAround', 'getThreadHistory']) {
    if (typeof api?.[method] !== 'function') continue;
    try {
      const result = method === 'getMessagesAround'
        ? await api[method](threadID, replyID, 20)
        : await api[method](threadID, 20);
      const target = asItems(result).find((item) => getMessageID(item)?.toString() === replyID);
      if (target) return target;
    } catch (_) {
      // A missing or stale reply target should not break the command itself.
    }
  }

  return direct || null;
}

module.exports = {
  asItems,
  extractImageUrl,
  findReplyTarget,
  getMessageID,
  getMessageSenderID,
  getUserID,
  getUsername
};
