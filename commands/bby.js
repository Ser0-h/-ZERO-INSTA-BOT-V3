"use strict";

/**
 * ============================================================
 *  bby.js — Instagram Direct non-prefix AI chatbot command
 *  Author : Idle×Saow
 *  ZERO DEPENDENCY — Node 18+ built-in fetch
 * ============================================================
 */

/* ============================ CONFIG ============================ */
const DEBUG = true; // kaj shuru hole false kore dao

const BASE_API_URL =
    "https://raw.githubusercontent.com/mahmud-aura/HINATA/main/baseApiUrl.json";

const BBY_TIMEOUT_MS = 20000;

const BBY_FALLBACK_MESSAGE =
    "bby is a little busy right now. try again in a bit 🥺";

const BBY_ALIASES = [
    "bby",
    "jan",
    "babu",
    "zero"
];

const SESSION_TTL_MS = 30 * 60 * 1000;
/* ================================================================= */

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
        if (t - ctx.createdAt > SESSION_TTL_MS) {
            sessions.delete(id);
        }
    }
}

function makeTimeoutSignal() {
    const controller = new AbortController();

    setTimeout(() => controller.abort(), BBY_TIMEOUT_MS).unref?.();

    return controller.signal;
}

/* ------------------- Loader argument adapter ----------------- */

function normalizeArgs(args) {
    const a = args[0];

    if (
        a &&
        typeof a === "object" &&
        (a.api !== undefined || a.event !== undefined)
    ) {
        return {
            api: a.api,
            event: a.event
        };
    }

    return {
        api: args[0],
        event: args[1]
    };
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
        null;

    if (!reply) return null;

    return getMessageId(reply);
}

/* ------------------------- BBY ALIAS -------------------------- */

function isBBYAlias(text) {
    if (!text) return false;

    const normalized = text.trim().toLowerCase();

    return BBY_ALIASES.includes(normalized);
}

/* ------------------------- BBY API (fetch) -------------------- */

async function babyAPI(text, attachments = []) {
    const baseRes = await fetch(BASE_API_URL, {
        signal: makeTimeoutSignal(),
    });

    if (!baseRes.ok) {
        throw new Error(`base URL HTTP ${baseRes.status}`);
    }

    const baseData = await baseRes.json();

    const res = await fetch(
        `${baseData.mahmud}/api/baby?text=${encodeURIComponent(text)}&font=3`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                attachments
            }),
            signal: makeTimeoutSignal(),
        }
    );

    if (!res.ok) {
        throw new Error(`baby API HTTP ${res.status}`);
    }

    const data = await res.json();

    if (
        !data ||
        typeof data.reply !== "string" ||
        !data.reply
    ) {
        throw new Error("baby API returned empty reply");
    }

    return data.reply;
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
            log("ERROR: api.sendMessage not found");
            return;
        }

        const threadId = getThreadId(event);

        if (!threadId) {
            log("ERROR: thread id not found in event");
            return;
        }

        const senderId = getSenderId(event);

        /*
         * IMPORTANT:
         *
         * First bot reply will be attached to the user's
         * original message.
         *
         * api.sendMessage(
         *   payload,
         *   threadID,
         *   callback,
         *   replyTarget
         * )
         */

        const originalMessageId = getMessageId(event);

        const sent = await new Promise((resolve, reject) => {
            api.sendMessage(
                {
                    body: output
                },
                threadId,
                (error, result) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(result);
                },
                originalMessageId
            );
        });

        const sentId = Array.isArray(sent)
            ? getMessageId(sent[0])
            : getMessageId(sent);

        /*
         * Bot-er nijer message ID session-e store hobe.
         *
         * User bot-er reply-e text dile:
         *
         * User -> Bot message-e reply
         *       -> oi bot message ID pawa jabe
         *       -> session match hobe
         *       -> abar bot reply korbe
         *
         * Tai prottek bot message-er alada chain thakbe.
         */

        if (sentId) {
            sessions.set(String(sentId), {
                senderId,
                threadId,
                createdAt: now()
            });

            log(
                "sent reply to:",
                originalMessageId,
                "| stored bot id:",
                sentId
            );
        } else {
            log("WARN: sendMessage returned no message id");
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

    log(
        "msg:",
        text,
        "| replyTarget:",
        replyTargetId
    );

    /*
     * ==========================================================
     * 1. Reply to bot's previous message
     * ==========================================================
     *
     * Ekhane bby/jan/babu/zero lagbe na.
     *
     * Bot-er message-e reply korlei bot abar reply korbe.
     */

    if (
        replyTargetId &&
        sessions.has(String(replyTargetId))
    ) {
        const ctx = sessions.get(String(replyTargetId));

        sessions.delete(String(replyTargetId));

        /*
         * Je user-er jonno session create hoisilo,
         * sudhu sei user-er reply accept korbe.
         */

        if (
            senderId &&
            ctx.senderId &&
            String(senderId) !== String(ctx.senderId)
        ) {
            return;
        }

        log("reply-chain triggered");

        return deliver(
            api,
            event,
            text
        );
    }

    /*
     * ==========================================================
     * 2. Exact BBY aliases
     * ==========================================================
     *
     * Only:
     *
     * bby
     * jan
     * babu
     * zero
     *
     * egulai initial event.
     *
     * Example:
     *
     * bby          -> trigger
     * jan          -> trigger
     * babu         -> trigger
     * zero         -> trigger
     *
     * But:
     *
     * hello bby    -> NOT trigger
     * bby hello    -> NOT trigger
     * amar bby     -> NOT trigger
     */

    if (isBBYAlias(text)) {
        log("BBY alias matched:", text);

        return deliver(
            api,
            event,
            text
        );
    }

    /*
     * Normal message ignore.
     */

    log("ignored (normal message)");
}

/* --------------------------- Reply ---------------------------- */

async function onReply() {
    const { api, event } = normalizeArgs(arguments);

    sweepExpired();

    const replyTargetId = getReplyTargetId(event);

    if (
        !replyTargetId ||
        !sessions.has(String(replyTargetId))
    ) {
        return;
    }

    const text = getText(event);

    if (!text) return;

    const ctx = sessions.get(String(replyTargetId));

    sessions.delete(String(replyTargetId));

    const senderId = getSenderId(event);

    if (
        senderId &&
        ctx.senderId &&
        String(senderId) !== String(ctx.senderId)
    ) {
        return;
    }

    log("onReply triggered");

    return deliver(
        api,
        event,
        text
    );
}

/* --------------------------- Exports -------------------------- */

module.exports = {
    config: {
        name: "bby",
        author: "Idle×Saow",
        version: "1.0.7",
        description:
            "Non-prefix bby AI chatbot for Instagram Direct",

        category: "none",

        nonPrefix: true,
        noPrefix: true,

        aliases: [
            "bby",
            "jan",
            "babu",
            "zero"
        ],

        cooldown: 3,
    },

    onChat,
    onReply,

    // Aliases — includes onMessage for your loader
    onMessage: onChat,
    handleEvent: onChat,
    handleReply: onReply,
    onStart: onChat,
    run: onChat,
    execute: onChat,
    start: onChat,
};
