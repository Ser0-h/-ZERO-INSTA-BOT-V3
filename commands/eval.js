
"use strict";

/**
 * ============================================================
 *  bby.js — Instagram Direct non-prefix AI chatbot command
 *  Author : Idle×Saow
 * ------------------------------------------------------------
 *  No repository files were shared with this request, so the
 *  module follows the standard command/event export layout
 *  used by Instagram DM bot repos. All logic lives in
 *  `onChat` and `onReply`. If your loader expects different
 *  hook names, remap them in the ALIASES section at the
 *  bottom of the exports — nothing else needs to change.
 * ============================================================
 */

/* ============================ CONFIG ============================ */
const BBY_API_URL = "https://your-bby-api-endpoint.com/chat"; // <-- change this
const BBY_API_TIMEOUT_MS = 15000;
const BBY_FALLBACK_MESSAGE =
  "bby is a little busy right now. try again in a bit 🥺";
const BBY_TRIGGER = "bby";
const SESSION_TTL_MS = 30 * 60 * 1000; // remember a bby reply for 30 minutes
/* ================================================================= */

/**
 * Sessions store.
 * Key   : message ID of a reply previously sent by this command.
 * Value : { senderId, createdAt }
 * Only messages that directly reply to one of these stored IDs
 * will re-trigger the command (without typing "bby").
 */
const sessions = new Map();

function now() {
  return Date.now();
}

function sweepExpired() {
  const t = now();
  for (const [id, ctx] of sessions) {
    if (t - ctx.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
}

function getMessageId(message) {
  if (!message) return null;
  if (typeof message === "string") return message;
  return (
    message.messageID ??
    message.message_id ??
    message.item_id ??
    message.id ??
    null
  );
}

function getSenderId(event) {
  return (
    event.senderID ??
    event.senderId ??
    event.userID ??
    event.user_id ??
    null
  );
}

function getThreadId(event) {
  return (
    event.threadID ??
    event.threadId ??
    event.thread_id ??
    null
  );
}

function getText(event) {
  const body =
    event.body ??
    event.text ??
    event.message?.text ??
    event.message?.body ??
    "";
  return typeof body === "string" ? body.trim() : "";
}

function getReplyTargetId(event) {
  const reply =
    event.messageReply ??
    event.replyTo ??
    event.repliedTo ??
    null;
  if (!reply) return null;
  return getMessageId(reply);
}

/* ------------------------- BBY API ------------------------- */

async function askBby(userText) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BBY_API_TIMEOUT_MS);

  try {
    const res = await fetch(BBY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`BBY API responded with HTTP ${res.status}`);
    }

    const data = await res.json();
    const output =
      data?.reply ??
      data?.response ??
      data?.message ??
      data?.text ??
      null;

    if (!output || typeof output !== "string") {
      throw new Error("BBY API returned an empty/invalid reply");
    }

    return output;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------- Reply delivery ---------------------- */

async function deliver(api, event, userText) {
  let output;
  try {
    output = await askBby(userText);
  } catch (err) {
    // API failed or timed out -> clean fallback, never crash the bot
    output = BBY_FALLBACK_MESSAGE;
  }

  try {
    const threadId = getThreadId(event);
    if (!threadId) return;

    const sent = await api.sendMessage(output, threadId);
    const sentId = Array.isArray(sent) ? getMessageId(sent[0]) : getMessageId(sent);

    if (sentId) {
      sessions.set(String(sentId), {
        senderId: getSenderId(event),
        createdAt: now(),
      });
    }
  } catch (err) {
    // A failed send must never take the whole bot down
  }
}

/* ------------------------- Hooks ---------------------------- */

async function onChat({ api, event }) {
  sweepExpired();

  const text = getText(event);
  if (!text) return;

  const senderId = getSenderId(event);
  const replyTargetId = getReplyTargetId(event);

  // Case B: this message is a direct reply to a message sent by bby
  if (replyTargetId && sessions.has(String(replyTargetId))) {
    const ctx = sessions.get(String(replyTargetId));
    sessions.delete(String(replyTargetId)); // one-shot: chain renews each turn
    if (senderId && ctx.senderId && senderId !== ctx.senderId) return;
    return deliver(api, event, text);
  }

  // Case A: message contains/starts with the trigger word
  if (text.toLowerCase().includes(BBY_TRIGGER)) {
    return deliver(api, event, text);
  }

  // Normal message -> stay silent
}

async function onReply({ api, event }) {
  sweepExpired();

  const replyTargetId = getReplyTargetId(event);
  if (!replyTargetId || !sessions.has(String(replyTargetId))) return;

  const text = getText(event);
  if (!text) return;

  const ctx = sessions.get(String(replyTargetId));
  sessions.delete(String(replyTargetId));

  const senderId = getSenderId(event);
  if (senderId && ctx.senderId && senderId !== ctx.senderId) return;

  return deliver(api, event, text);
}

/* ------------------------- Exports -------------------------- */

module.exports = {
  config: {
    name: "bby",
    author: "Idle×Saow",
    version: "1.0.0",
    description: "Non-prefix bby AI chatbot for Instagram Direct",
    category: "ai",
    nonPrefix: true,
    noPrefix: true,
    cooldown: 3,
  },

  onChat,
  onReply,

  // Aliases for loaders that use different hook names
  handleEvent: onChat,
  handleReply: onReply,
  onStart: onChat,
  run: onChat,
};
