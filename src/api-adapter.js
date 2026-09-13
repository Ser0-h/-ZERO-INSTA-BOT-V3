'use strict';

const OUTPUT_TEXT_REPLACEMENTS = [
  ['\u2751', '❏'],
  ['\u27A5', '➥'],
  ['[!]', '❏'],
  ['->', '➥'],
  ['[OK]', '✅'],
  ['[X]', '❌'],
  ['\u2764\uFE0F', '<3'],
  ['\u2764', '<3'],
  ['\u2765', '>'],
  ['\u00E2\uFFFD\uFFFD', '❏'],
  ['\u00E2\uFFFD\u00A5', '➥'],
  ['\u00E2\u009D\u0091', '❏'],
  ['\u00E2\u009E\u00A5', '➥'],
  ['\u00E2\u009D\u00A4', '<3'],
  ['\u00E2\u009D\u00A5', '>']
];

function normalizeOutgoingText(value) {
  let text = String(value);
  for (const [from, to] of OUTPUT_TEXT_REPLACEMENTS) text = text.split(from).join(to);
  return text;
}

function normalizeOutgoingMessage(message) {
  if (typeof message === 'string') return normalizeOutgoingText(message);
  if (!message || typeof message !== 'object') return message;
  const normalized = { ...message };
  if (typeof normalized.body === 'string') normalized.body = normalizeOutgoingText(normalized.body);
  if (typeof normalized.text === 'string') normalized.text = normalizeOutgoingText(normalized.text);
  return normalized;
}

// The vendored client exposes both a rich facade and a lower-level client.
// This adapter keeps session restoration and cookie login interchangeable.
function adaptClient(client) {
  const rawClient = client._client || client;
  const sendMessage = typeof client.sendMessage === 'function'
    ? (message, threadID) => client.sendMessage(message, threadID)
    : (message, threadID) => client.sendMessage.toThread(threadID, message);
  const destroy = typeof client.destroy === 'function'
    ? () => client.destroy()
    : typeof rawClient.destroy === 'function' ? () => rawClient.destroy() : null;

  // The installed public client may be older than the server. When a method is
  // missing we fall back to the client's generic `call(operation, args)` path so
  // every server operation still works. Only when neither exists do we expose an
  // explicit "unsupported" function that throws a clear message instead of the
  // opaque "client.x is not a function".
  const supportsCall = typeof client.call === 'function';
  const delegate = (name, buildArgs) => (...input) => {
    const args = buildArgs(...input);
    if (typeof client[name] === 'function') return client[name](...args);
    if (supportsCall) return client.call(name, args);
    const error = new Error(`This chat client does not support "${name}". Update @lazyneoaz/insta-chat-client.`);
    error.code = 'UNSUPPORTED_OPERATION';
    return Promise.reject(error);
  };

  return {
    getCurrentUserID: () => client.getCurrentUserID(),
    listen: (callback) => client.listen(callback),
    stopListening: () => client.stopListening(),
    on: (...args) => client.on(...args),
    off: (...args) => client.off(...args),
    once: (...args) => client.once(...args),
    sendMessage: (message, threadID) => sendMessage(normalizeOutgoingMessage(message), threadID),
    sendMessageBatch: delegate('sendMessageBatch', (threadIDs, message) => [threadIDs, normalizeOutgoingMessage(message)]),
    sendEffects: delegate('sendEffects', (threadID, text, effect) => [
      String(threadID),
      typeof text === 'string' ? normalizeOutgoingText(text) : text,
      effect
    ]),
    listEffects: delegate('listEffects', () => []),
    sendPhotoFromUrl: delegate('sendPhotoFromUrl', (threadID, imageUrl, options) => [threadID, imageUrl, options]),
    sendVoiceFromUrl: delegate('sendVoiceFromUrl', (threadID, audioUrl, options) => [threadID, audioUrl, options]),
    sendGIF: delegate('sendGIF', (threadID, gifUrl, options) => [threadID, gifUrl, options]),
    sendDirectMessage: delegate('sendDirectMessage', (userID, message) => [userID, normalizeOutgoingMessage(message)]),
    replyToMessage: delegate('replyToMessage', (threadID, message, messageID) => [threadID, normalizeOutgoingMessage(message), messageID]),
    unsendMessage: delegate('unsendMessage', (messageID, threadID) => [messageID, threadID]),
    unsendMessageFast: (messageID, threadID) => {
      if (typeof client.unsendMessageFast === 'function') return client.unsendMessageFast(messageID, threadID);
      if (supportsCall) return client.call('unsendMessageFast', [messageID, threadID]);
      return client.unsendMessage(messageID, threadID);
    },
    unsendMessageBatch: delegate('unsendMessageBatch', (messageIDs) => [messageIDs]),
    unsendLastMessage: delegate('unsendLastMessage', (threadID) => [threadID]),
    sendReaction: delegate('sendReaction', (...args) => args),
    removeReaction: delegate('removeReaction', (...args) => args),
    toggleReaction: delegate('toggleReaction', (...args) => args),
    getThreadInfo: delegate('getThreadInfo', (threadID) => [threadID]),
    getMultipleThreadInfo: delegate('getMultipleThreadInfo', (threadIDs) => [threadIDs]),
    getThreadHistory: delegate('getThreadHistory', (threadID, amount) => [threadID, amount]),
    getNewerMessages: delegate('getNewerMessages', (threadID, timestamp) => [threadID, timestamp]),
    getMessagesAround: delegate('getMessagesAround', (threadID, messageID, limit) => [threadID, messageID, limit]),
    getInbox: delegate('getInbox', (options) => [options]),
    getPendingRequests: delegate('getPendingRequests', (options) => [options]),
    searchThreads: delegate('searchThreads', (query, options) => [query, options]),
    sendTypingIndicator: delegate('sendTypingIndicator', (threadID) => [threadID]),
    stopTypingIndicator: delegate('stopTypingIndicator', (threadID) => [threadID]),
    changeThreadTitle: delegate('changeThreadTitle', (threadID, title) => [threadID, title]),
    changeNickname: delegate('changeNickname', (userID, threadID, nickname) => [userID, threadID, nickname]),
    deleteThread: delegate('deleteThread', (threadID) => [threadID]),
    approveRequest: delegate('approveRequest', (threadID) => [threadID]),
    declineRequest: delegate('declineRequest', (threadID) => [threadID]),
    addUsersToThread: delegate('addUsersToThread', (threadID, userIDs) => [threadID, userIDs]),
    addUserToGroup: delegate('addUserToGroup', (threadID, userID) => [threadID, userID]),
    removeUsersFromThread: delegate('removeUsersFromThread', (threadID, userIDs) => [threadID, userIDs]),
    leaveThread: delegate('leaveThread', (threadID) => [threadID]),
    muteThread: delegate('muteThread', (threadID) => [threadID]),
    unmuteThread: delegate('unmuteThread', (threadID) => [threadID]),
    getUserInfo: delegate('getUserInfo', (userID) => [userID]),
    getProfilePicture: delegate('getProfilePicture', (userID) => [userID]),
    getUserInfoByUsername: delegate('getUserInfoByUsername', (username) => [username]),
    getProfilePictureByUsername: delegate('getProfilePictureByUsername', (username) => [username]),
    setProfilePicture: delegate('setProfilePicture', (imageUrl) => [imageUrl]),
    searchUsers: delegate('searchUsers', (query, options) => [query, options]),
    getMultipleUserInfo: delegate('getMultipleUserInfo', (userIDs) => [userIDs]),
    getFollowers: delegate('getFollowers', (userID, options) => [userID, options]),
    getFollowing: delegate('getFollowing', (userID, options) => [userID, options]),
    followUser: delegate('followUser', (userID, options) => [userID, options]),
    unfollowUser: delegate('unfollowUser', (userID, options) => [userID, options]),
    markAsRead: delegate('markAsRead', (threadID, read) => [threadID, read]),
    markAsUnread: delegate('markAsUnread', (threadID) => [threadID]),
    markMultipleAsRead: delegate('markMultipleAsRead', (threadIDs) => [threadIDs]),
    searchReels: delegate('searchReels', (query, options) => [query, options]),
    searchHashtags: delegate('searchHashtags', (query, options) => [query, options]),
    searchPlaces: delegate('searchPlaces', (query, options) => [query, options]),
    getTrendingSearches: delegate('getTrendingSearches', () => []),
    getRecentSearches: delegate('getRecentSearches', () => []),
    clearRecentSearches: delegate('clearRecentSearches', () => []),
    getHealth: () => client.getHealth(),
    getServerStatus: typeof client.getServerStatus === 'function' ? () => client.getServerStatus() : null,
    reconnect: typeof client.reconnect === 'function' ? (reason) => client.reconnect(reason) : null,
    isConnected: typeof client.isConnected === 'function' ? () => client.isConnected() : null,
    status: typeof client.status === 'function' ? () => client.status() : null,
    waitUntilConnected: typeof client.waitUntilConnected === 'function'
      ? (timeoutMs) => client.waitUntilConnected(timeoutMs)
      : null,
    saveSession: (filePath) => client.saveSession(filePath),
    stopTask: (name) => client.stopTask(name),
    resetSession: () => {
      client.stopListening?.();
      if ('sessionId' in client) client.sessionId = null;
      if ('authPromise' in client) client.authPromise = null;
    },
    destroy,
    logout: () => client.logout()
  };
}

module.exports = { adaptClient };
