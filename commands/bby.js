"use strict";

const axios = require("axios");

/**
 * ============================================================
 *  bby.js — Instagram Direct non-prefix AI chatbot command
 *  Author : Idle×Saow
 * ------------------------------------------------------------
 *  Uses the repository's baby API (mahmud) exactly like the
 *  existing helper, with added timeout handling + fallback so
 *  the bot never crashes when the API is down.
 * ============================================================
 */

/* ============================ CONFIG ============================ */
const BASE_API_URL =
    "https://raw.githubusercontent.com/mahmud-aura/HINATA/main/baseApiUrl.json";
const BBY_TIMEOUT_MS = 20000;
const BBY_FALLBACK_MESSAGE =
    "bby is a little busy right now. try again in a bit 🥺";
const BBY_TRIGGER = "bby";
const SESSION_TTL_MS = 30 * 60 * 1000; // reply-chain window
/* ================================================================= */

/**
 * sessions : Map<messageId, { senderId, threadId, createdAt }>
 *   messageId = ID of a reply previously sent by THIS command.
 *   Only direct replies to these IDs re-trigger bby without "bby".
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
/* Same pattern as the repo's babyAPI helper, with timeouts. */

async function babyAPI(text, attachments = []) {
    const { data } = await axios.get(BASE_API_URL, {
        timeout: BBY_TIMEOUT_MS,
    });

    const response = await axios.post(
        `${data.mahmud}/api/baby?text=${encodeURIComponent(text)}&font=3`,
        { attachments },
        { timeout: BBY_TIMEOUT_MS }
    );

    return response.data.reply;
}

/* ---------------------- Reply delivery ---------------------- */

async function deliver(api, event, userText) {
    let output;
    try {
        output = await babyAPI(userText);
    } catch (err) {
        // API down / timeout / bad response -> clean fallback, no crash
        output = BBY_FALLBACK_MESSAGE;
    }

    try {
        const threadId = getThreadId(event);
        if (!threadId) return;

        const senderId = getSenderId(event);
        const sent = await api.sendMessage(output, threadId);
        const sentId = Array.isArray(sent)
            ? getMessageId(sent[0])
            : getMessageId(sent);

        if (sentId) {
            sessions.set(String(sentId), {
                senderId,
                threadId,
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

    // Case B: direct reply to a message sent by bby (no "bby" word needed)
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
        version: "1.0.2",
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
