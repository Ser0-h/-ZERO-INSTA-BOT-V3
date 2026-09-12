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

  return {
    getCurrentUserID: () => client.getCurrentUserID(),
    listen: (callback) => client.listen(callback),
    stopListening: () => client.stopListening(),
    on: (...args) => client.on(...args),
    off: (...args) => client.off(...args),
    once: (...args) => client.once(...args),
    sendMessage: (message, threadID) => sendMessage(normalizeOutgoingMessage(message), threadID),
    sendMessageBatch: (threadIDs, message) => client.sendMessageBatch(threadIDs, normalizeOutgoingMessage(message)),
    sendEffects: (threadID, text, effect) => client.sendEffects(
      String(threadID),
      typeof text === 'string' ? normalizeOutgoingText(text) : text,
      effect
    ),
    sendAvatarEffect: (threadID, text, effect, options) => client.sendAvatarEffect(
      String(threadID),
      typeof text === 'string' ? normalizeOutgoingText(text) : text,
      effect,
      options
    ),
    listAvatarEffects: () => client.listAvatarEffects(),
    listEffects: () => client.listEffects(),
    stickerMusic: (threadID, queryOrTrack, options) => client.stickerMusic(String(threadID), queryOrTrack, options),
    sendPhotoFromUrl: (threadID, imageUrl, options) => client.sendPhotoFromUrl(threadID, imageUrl, options),
    sendVoiceFromUrl: (threadID, audioUrl, options) => client.sendVoiceFromUrl(threadID, audioUrl, options),
    sendGIF: (threadID, gifUrl, options) => client.sendGIF(threadID, gifUrl, options),
    sendDirectMessage: (userID, message) => client.sendDirectMessage(userID, normalizeOutgoingMessage(message)),
    replyToMessage: (threadID, message, messageID) => client.replyToMessage(threadID, normalizeOutgoingMessage(message), messageID),
    unsendMessage: (messageID, threadID) => client.unsendMessage(messageID, threadID),
    unsendMessageFast: (messageID, threadID) => typeof client.unsendMessageFast === 'function'
      ? client.unsendMessageFast(messageID, threadID)
      : client.unsendMessage(messageID, threadID),
    unsendMessageBatch: (messageIDs) => client.unsendMessageBatch(messageIDs),
    unsendLastMessage: (threadID) => client.unsendLastMessage(threadID),
    sendReaction: (...args) => client.sendReaction(...args),
    removeReaction: (...args) => client.removeReaction(...args),
    toggleReaction: (...args) => client.toggleReaction(...args),
    getThreadInfo: (threadID) => client.getThreadInfo(threadID),
    getMultipleThreadInfo: (threadIDs) => client.getMultipleThreadInfo(threadIDs),
    getThreadHistory: (threadID, amount) => client.getThreadHistory(threadID, amount),
    getNewerMessages: (threadID, timestamp) => client.getNewerMessages(threadID, timestamp),
    getMessagesAround: (threadID, messageID, limit) => client.getMessagesAround(threadID, messageID, limit),
    getInbox: (options) => client.getInbox(options),
    getPendingRequests: (options) => client.getPendingRequests(options),
    searchThreads: (query, options) => client.searchThreads(query, options),
    sendTypingIndicator: (threadID) => client.sendTypingIndicator(threadID),
    stopTypingIndicator: (threadID) => client.stopTypingIndicator(threadID),
    changeThreadTitle: (threadID, title) => client.changeThreadTitle(threadID, title),
    changeNickname: (userID, threadID, nickname) => client.changeNickname(userID, threadID, nickname),
    deleteThread: (threadID) => client.deleteThread(threadID),
    approveRequest: (threadID) => client.approveRequest(threadID),
    declineRequest: (threadID) => client.declineRequest(threadID),
    addUsersToThread: (threadID, userIDs) => client.addUsersToThread(threadID, userIDs),
    addUserToGroup: (threadID, userID) => client.addUserToGroup(threadID, userID),
    removeUsersFromThread: (threadID, userIDs) => client.removeUsersFromThread(threadID, userIDs),
    leaveThread: (threadID) => client.leaveThread(threadID),
    muteThread: (threadID) => client.muteThread(threadID),
    unmuteThread: (threadID) => client.unmuteThread(threadID),
    getUserInfo: (userID) => client.getUserInfo(userID),
    getProfilePicture: (userID) => client.getProfilePicture(userID),
    getUserInfoByUsername: (username) => client.getUserInfoByUsername(username),
    getProfilePictureByUsername: (username) => client.getProfilePictureByUsername(username),
    setProfilePicture: (imageUrl) => client.setProfilePicture(imageUrl),
    searchUsers: (query, options) => client.searchUsers(query, options),
    getMultipleUserInfo: (userIDs) => client.getMultipleUserInfo(userIDs),
    getFollowers: (userID, options) => client.getFollowers(userID, options),
    getFollowing: (userID, options) => client.getFollowing(userID, options),
    followUser: (userID, options) => client.followUser(userID, options),
    unfollowUser: (userID, options) => client.unfollowUser(userID, options),
    markAsRead: (threadID, read) => client.markAsRead(threadID, read),
    markAsUnread: (threadID) => client.markAsUnread(threadID),
    markMultipleAsRead: (threadIDs) => client.markMultipleAsRead(threadIDs),
    searchReels: (query, options) => client.searchReels(query, options),
    searchHashtags: (query, options) => client.searchHashtags(query, options),
    searchPlaces: (query, options) => client.searchPlaces(query, options),
    getTrendingSearches: () => client.getTrendingSearches(),
    getRecentSearches: () => client.getRecentSearches(),
    clearRecentSearches: () => client.clearRecentSearches(),
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
