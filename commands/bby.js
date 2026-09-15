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

        const sent = await api.sendMessage(
            output,
            threadId
        );

        const sentId = Array.isArray(sent)
            ? getMessageId(sent[0])
            : getMessageId(sent);

        /*
         * Bot je message ta pathalo,
         * oi message ID diye alada session store hobe.
         *
         * Tai ekoi somoy onekjon bby/jan/babu/zero
         * likhleo prottekta bot reply alada kore track hobe.
         */
        if (sentId) {
            sessions.set(String(sentId), {
                senderId,
                threadId,
                createdAt: now()
            });

            log("sent, stored id:", sentId);
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
     * 1. Existing bot reply-chain
     * ==========================================================
     *
     * Bot je message-er reply dise,
     * user oi message-e reply korlei abar bot reply korbe.
     *
     * Ekhane ar bby/jan/babu/zero lekhar proyojon nai.
     */

    if (
        replyTargetId &&
        sessions.has(String(replyTargetId))
    ) {
        const ctx = sessions.get(String(replyTargetId));

        sessions.delete(String(replyTargetId));

        if (
            senderId &&
            ctx.senderId &&
            senderId !== ctx.senderId
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
     * 2. BBY aliases
     * ==========================================================
     *
     * Sudhu exact:
     * bby
     * jan
     * babu
     * zero
     *
     * Egula likhle bot reply korbe.
     *
     * "hello bby"
     * "bby kothay"
     * "jan hello"
     *
     * Egula trigger korbe na.
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
        senderId !== ctx.senderId
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
        version: "1.0.6",
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
