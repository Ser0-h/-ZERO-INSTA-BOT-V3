"use strict";

/**
 * ============================================================
 *  bby.js — Instagram Direct non-prefix AI chatbot command
 *  Author : Idle×Saow
 * ------------------------------------------------------------
 *  DEFENSIVE BUILD:
 *  - Works with both loader styles: onChat({ api, event }) and
 *    onChat(api, event)
 *  - Handles common event field-name variations
 *  - Exposes every common hook name as alias
 *  - Uses the repo's baby API (mahmud) with timeout + fallback
 *  - Set DEBUG = false after everything works
 * ============================================================
 */

const axios = require("axios");

/* ============================ CONFIG ============================ */
const DEBUG = true; // false kore dao jokhon kaj shuru korbe

const BASE_API_URL =
    "https://raw.githubusercontent.com/mahmud-aura/HINATA/main/baseApiUrl.json";
const BBY_TIMEOUT_MS = 20000;
const BBY_FALLBACK_MESSAGE =
    "bby is a little busy right now. try again in a bit 🥺";
const BBY_TRIGGER = "bby";
const SESSION_TTL_MS = 30 * 60 * 1000;
/* ================================================================= */

/**
 * sessions : Map<messageId, { senderId, threadId, createdAt }>
 *   Only direct replies to these bot-sent messages re-trigger bby.
 */
const sessions = new Map();

function log(...args) {
    if (DEBUG) console.log("[bby]", ...args);
}

function now() {
    return Date.now();
}

function sweepExpired() {
    const t = now();
    for (const [id, ctx] of sessions) {
        if (t - ctx.createdAt > SESSION_TTL_MS) sessions.delete(id);
    }
}

/* ------------------- Loader argument adapter ----------------- */
/* Handles BOTH styles automatically:
     onChat({ api, event })   -> args[0].api / args[0].event
     onChat(api, event)       -> args[0] / args[1]                */

function normalizeArgs(args) {
    const a = args[0];
    if (a && typeof a === "object" && (a.api !== undefined || a.event !== undefined)) {
        return { api: a.api, event: a.event };
    }
    return { api: args[0], event: args[1] };
}

/* ------------------- Event field extractors ------------------ */

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
    if (!event) return null;
    return (
        event.senderID ??
        event.senderId ??
        event.userID ??
        event.user_id ??
        event.author?.id ??
        null
    );
}

function getThreadId(event) {
    if (!event) return null;
    return (
        event.threadID ??
        event.threadId ??
        event.thread_id ??
        event.chatId ??
        event.chat?.id ??
        null
    );
}

function getText(event) {
    if (!event) return "";
    const body =
        event.body ??
        event.text ??
        event.message ??
        event.content ??
        event.message?.text ??
        event.message?.body ??
        "";
    return typeof body === "string" ? body.trim() : "";
}

function getReplyTargetId(event) {
    if (!event) return null;
    const reply =
        event.messageReply ??
        event.replyTo ??
        event.repliedTo ??
        event.reply_to ??
        event.messageReply?.messageID ??
        null;
    if (!reply) return null;
    return getMessageId(reply);
}

/* ------------------------- BBY API --------------------------- */

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

/* ---------------------- Reply delivery ------------------------ */

async function deliver(api, event, userText) {
    let output;
    try {
        output = await babyAPI(userText);
        log("API reply:", output);
    } catch (err) {
        log("API ERROR:", err.message);
        output = BBY_FALLBACK_MESSAGE;
    }

    try {
        if (!api || typeof api.sendMessage !== "function") {
            log("ERROR: api.sendMessage not found on the api object");
            return;
        }
        const threadId = getThreadId(event);
        if (!threadId) {
            log("ERROR: thread id not found in event");
            return;
        }

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
            log("sent, stored message id:", sentId);
        } else {
            log("WARN: sendMessage succeeded but returned no message id");
        }
    } catch (err) {
        log("SEND ERROR:", err.message);
    }
}

/* --------------------------- Hooks ---------------------------- */

async function onChat() {
    const { api, event } = normalizeArgs(arguments);

    sweepExpired();

    const text = getText(event);
    if (!text) return;

    const senderId = getSenderId(event);
    const replyTargetId = getReplyTargetId(event);

    log("msg:", text, "| replyTarget:", replyTargetId);

    // Case B: direct reply to a message sent by bby (no "bby" word needed)
    if (replyTargetId && sessions.has(String(replyTargetId))) {
        const ctx = sessions.get(String(replyTargetId));
        sessions.delete(String(replyTargetId));
        if (senderId && ctx.senderId && senderId !== ctx.senderId) return;
        log("reply-chain triggered");
        return deliver(api, event, text);
    }

    // Case A: message contains/starts with the trigger word
    if (text.toLowerCase().includes(BBY_TRIGGER)) {
        log("trigger word matched");
        return deliver(api, event, text);
    }

    log("ignored (normal message)");
}

async function onReply() {
    const { api, event } = normalizeArgs(arguments);

    sweepExpired();

    const replyTargetId = getReplyTargetId(event);
    if (!replyTargetId || !sessions.has(String(replyTargetId))) return;

    const text = getText(event);
    if (!text) return;

    const ctx = sessions.get(String(replyTargetId));
    sessions.delete(String(replyTargetId));

    const senderId = getSenderId(event);
    if (senderId && ctx.senderId && senderId !== ctx.senderId) return;

    log("onReply triggered");
    return deliver(api, event, text);
}

/* --------------------------- Exports -------------------------- */

module.exports = {
    config: {
        name: "bby",
        author: "Idle×Saow",
        version: "1.0.3",
        description: "Non-prefix bby AI chatbot for Instagram Direct",
        category: "ai",
        nonPrefix: true,
        noPrefix: true,
        cooldown: 3,
    },

    // Primary hooks
    onChat,
    onReply,

    // Aliases — one of these WILL match your loader
    handleEvent: onChat,
    handleReply: onReply,
    onStart: onChat,
    run: onChat,
    execute: onChat,
    start: onChat,
};
