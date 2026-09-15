"use strict";

/**
 * ============================================================
 *  bby.js — Instagram Direct non-prefix AI chatbot command
 *  Author : Idle×Saow
 *  ZERO DEPENDENCY — Node 18+ built-in fetch
 * ============================================================
 */

/* ============================ CONFIG ============================ */
const DEBUG = true;

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
        message.itemId ??
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
        event.sender?.id ??
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
        event.message?.replyTo ??
        event.message?.reply_to ??
        null;

    if (!reply) return null;

    return getMessageId(reply);
}

/* ------------------------- BBY ALIAS -------------------------- */

function isBBYAlias(text) {
    if (!text) return false;

    return BBY_ALIASES.includes(
        text.trim().toLowerCase()
    );
}

/* ------------------------- BBY API ---------------------------- */

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
        const senderId = getSenderId(event);
        const originalMessageId = getMessageId(event);

        if (!threadId) {
            log("ERROR: thread id not found");
            return;
        }

        if (!originalMessageId) {
            log("ERROR: message id not found");
            return;
        }

        /*
         * Bot always replies directly to the current user message.
         */

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

        if (!sentId) {
            log("WARN: bot message ID not returned");
            return;
        }

        /*
         * IMPORTANT:
         *
         * New bot message = new active conversation point.
         *
         * Old session delete korleo notun bot message-er ID
         * immediately session-e store hobe.
         */

        sessions.set(String(sentId), {
            senderId: senderId != null
                ? String(senderId)
                : null,

            threadId: String(threadId),

            createdAt: now()
        });

        log(
            "SESSION CREATED:",
            String(sentId),
            "| USER:",
            senderId,
            "| THREAD:",
            threadId
        );

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
        "MSG:",
        text,
        "| REPLY:",
        replyTargetId,
        "| USER:",
        senderId
    );

    /*
     * ==========================================================
     * REPLY CHAIN
     * ==========================================================
     */

    if (
        replyTargetId &&
        sessions.has(String(replyTargetId))
    ) {
        const ctx = sessions.get(
            String(replyTargetId)
        );

        /*
         * Session delete করার আগে user verify.
         */

        if (
            senderId != null &&
            ctx.senderId != null &&
            String(senderId) !== String(ctx.senderId)
        ) {
            log("REPLY IGNORED: different user");
            return;
        }

        /*
         * Current session consume.
         * deliver() নতুন bot message-এর ID দিয়ে
         * নতুন session তৈরি করবে।
         */

        sessions.delete(
            String(replyTargetId)
        );

        log(
            "REPLY CHAIN MATCHED:",
            replyTargetId
        );

        return deliver(
            api,
            event,
            text
        );
    }

    /*
     * ==========================================================
     * INITIAL ALIAS EVENT
     * ==========================================================
     */

    if (isBBYAlias(text)) {
        log(
            "INITIAL ALIAS:",
            text
        );

        return deliver(
            api,
            event,
            text
        );
    }

    /*
     * Normal message ignore.
     */

    log("IGNORED");
}

/* --------------------------- Reply ---------------------------- */

async function onReply() {
    const { api, event } = normalizeArgs(arguments);

    sweepExpired();

    const replyTargetId = getReplyTargetId(event);

    if (!replyTargetId) {
        return;
    }

    const ctx = sessions.get(
        String(replyTargetId)
    );

    if (!ctx) {
        return;
    }

    const text = getText(event);

    if (!text) {
        return;
    }

    const senderId = getSenderId(event);

    if (
        senderId != null &&
        ctx.senderId != null &&
        String(senderId) !== String(ctx.senderId)
    ) {
        log("ONREPLY IGNORED: different user");
        return;
    }

    /*
     * Consume old bot message session.
     * deliver() নতুন bot message-এর জন্য
     * নতুন session বানাবে।
     */

    sessions.delete(
        String(replyTargetId)
    );

    log(
        "ONREPLY MATCHED:",
        replyTargetId
    );

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
        version: "1.0.8",
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

    onMessage: onChat,
    handleEvent: onChat,
    handleReply: onReply,
    onStart: onChat,
    run: onChat,
    execute: onChat,
    start: onChat,
};
