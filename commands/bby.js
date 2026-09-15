"use strict";

/**
 * ============================================================
 *  onMessage.js — Instagram DM message event (non-prefix bby)
 *  Author : Idle×Saow
 * ------------------------------------------------------------
 *  - Quoted reply: tries 7 different send formats
 *  - Conversation continue: detects bot-message replies via
 *    stored ID OR bot-ownership flags (fromMe/isBot/sender)
 *  - Dumps full event JSON on reply (for one-time field check)
 *  ZERO DEPENDENCY — Node 18+ built-in fetch
 * ============================================================
 */

/* ============================ CONFIG ============================ */
const DEBUG = true; // final hole false kore dao

const ALLOWED_UIDS = [
    // "1111111111",
];

const BASE_API_URL =
    "https://raw.githubusercontent.com/mahmud-aura/HINATA/main/baseApiUrl.json";
const BBY_TIMEOUT_MS = 20000;
const BBY_FALLBACK_MESSAGE =
    "bby is a little busy right now. try again in a bit 🥺";
const BBY_TRIGGER = "bby";
const SESSION_TTL_MS = 30 * 60 * 1000;
/* ================================================================= */

const sessions = new Map();
let replyDumped = false; // full event ekbar e dump hobe

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

function makeTimeoutSignal() {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), BBY_TIMEOUT_MS).unref?.();
    return controller.signal;
}

/* ------------------- Loader argument adapter ----------------- */

function normalizeArgs(args) {
    const a = args[0];
    if (a && typeof a === "object" && (a.api !== undefined || a.event !== undefined)) {
        return { api: a.api, event: a.event };
    }
    // some loaders pass (api, event, ...) directly
    if (args.length >= 2 && args[1] && typeof args[1] === "object") {
        return { api: args[0], event: args[1] };
    }
    return { api: args[0], event: args[0] };
}

/* ------------------- Event field extractors ------------------ */

function getMessageId(message) {
    if (!message) return null;
    if (typeof message === "string") return message;
    return (
        message.messageID ??
        message.message_id ??
        message.messageId ??
        message.item_id ??
        message.mid ??
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
        event.message?.user_id ??
        event.message?.sender_id ??
        event.author?.id ??
        event.message?.author?.id ??
        null
    );
}

function getThreadId(event) {
    if (!event) return null;
    return (
        event.threadID ??
        event.threadId ??
        event.thread_id ??
        event.message?.thread_id ??
        event.chatId ??
        event.chat?.id ??
        event.thread?.thread_id ??
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
        event.item?.text ??
        "";
    return typeof body === "string" ? body.trim() : "";
}

function getMyId(api) {
    try {
        if (api && typeof api.getCurrentUserID === "function") {
            return api.getCurrentUserID();
        }
    } catch (err) { /* ignore */ }
    return null;
}

function normalizeReply(candidate) {
    if (!candidate) return null;
    if (typeof candidate === "string") return { id: candidate, raw: null };
    const raw = candidate.item ?? candidate.message ?? candidate;
    return { id: getMessageId(raw), raw };
}

function getReplyInfo(event) {
    const candidates = [
        event.messageReply,
        event.replyTo,
        event.repliedTo,
        event.reply_to,
        event.replyToMessage,
        event.reply_to_message,
        event.replied_to_item,
        event.message?.replied_to_item,
        event.message?.reply,
        event.item?.replied_to_item,
        event.message?.reply_to,
    ];
    for (const c of candidates) {
        if (c) return normalizeReply(c);
    }
    return null;
}

function isBotMessage(replyRaw, api) {
    if (!replyRaw || typeof replyRaw !== "object") return false;

    if (
        replyRaw.fromMe === true ||
        replyRaw.isBot === true ||
        replyRaw.isSelf === true ||
        replyRaw.is_bot === true
    ) {
        return true;
    }

    const replySender =
        replyRaw.senderID ??
        replyRaw.senderId ??
        replyRaw.userID ??
        replyRaw.user_id ??
        replyRaw.author?.id ??
        replyRaw.message?.user_id ??
        null;

    const me = getMyId(api);
    if (replySender != null && me != null && String(replySender) === String(me)) {
        return true;
    }

    return false;
}

function isAllowed(senderId) {
    if (!ALLOWED_UIDS.length) return true;
    return senderId != null && ALLOWED_UIDS.includes(String(senderId));
}

/* ------------------------- BBY API (fetch) -------------------- */

async function babyAPI(text, attachments = []) {
    const baseRes = await fetch(BASE_API_URL, {
        signal: makeTimeoutSignal(),
    });
    if (!baseRes.ok) throw new Error(`base URL HTTP ${baseRes.status}`);
    const baseData = await baseRes.json();

    const base = Array.isArray(baseData.mahmud)
        ? baseData.mahmud[0]
        : baseData.mahmud;

    const res = await fetch(
        `${base}/api/baby?text=${encodeURIComponent(text)}&font=3`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attachments }),
            signal: makeTimeoutSignal(),
        }
    );
    if (!res.ok) throw new Error(`baby API HTTP ${res.status}`);

    const data = await res.json();
    if (!data || typeof data.reply !== "string" || !data.reply) {
        throw new Error("baby API returned empty reply");
    }
    return data.reply;
}

/* ---------------------- Reply delivery ------------------------ */

async function sendReply(api, threadId, text, replyToId) {
    const attempts = [];

    if (typeof api.sendMessage === "function") {
        attempts.push(
            (t) => api.sendMessage(t, threadId, replyToId),
            (t) => api.sendMessage(t, threadId, { replyToMessage: replyToId }),
            (t) => api.sendMessage(t, threadId, { messageReply: replyToId }),
            (t) => api.sendMessage(t, threadId, { replyTo: replyToId }),
            (t) => api.sendMessage(t, threadId, { reply_to: replyToId })
        );
    }

    // instagram-private-api realtime style
    if (api.realtime && api.realtime.direct && typeof api.realtime.direct.sendText === "function") {
        attempts.push(
            (t) => api.realtime.direct.sendText({ text: t, threadId, replyToItemId: replyToId }),
            (t) => api.realtime.direct.sendText({ text: t, thread: threadId, replyToItemId: replyToId })
        );
    }

    if (replyToId && attempts.length) {
        for (let i = 0; i < attempts.length; i++) {
            try {
                const sent = await attempts[i](text);
                log("QUOTED REPLY OK with format #" + (i + 1) + " of " + attempts.length);
                return sent;
            } catch (err) {
                log("reply format #" + (i + 1) + " failed:", err.message);
            }
        }
        log("no quoted-reply format worked, sending plain");
    }

    return api.sendMessage(text, threadId);
}

async function deliver(api, event, userText) {
    const senderId = getSenderId(event);
    const threadId = getThreadId(event);
    const userMsgId = getMessageId(event);

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
        if (!threadId) {
            log("ERROR: thread id not found in event");
            return;
        }

        const sent = await sendReply(api, threadId, output, userMsgId);
        const sentId = Array.isArray(sent)
            ? getMessageId(sent[0])
            : getMessageId(sent?.payload?.message ?? sent);

        if (sentId) {
            sessions.set(String(sentId), { senderId, threadId, createdAt: now() });
            log("sent, stored id:", sentId);
        } else {
            log("WARN: no id returned (bot-reply detection will handle replies)");
        }
    } catch (err) {
        log("SEND ERROR:", err.message);
    }
}

/* --------------------------- Handler --------------------------- */

async function onMessage() {
    const { api, event } = normalizeArgs(arguments);

    sweepExpired();

    const text = getText(event);
    if (!text) return;

    const senderId = getSenderId(event);
    const replyInfo = getReplyInfo(event);

    log("msg:", text, "| from:", senderId, "| replyTarget:", replyInfo?.id ?? null);

    // One-time full event dump when a reply is detected -> paste this to me
    if (DEBUG && replyInfo && !replyDumped) {
        replyDumped = true;
        try {
            log("REPLY EVENT DUMP:", JSON.stringify(event));
        } catch (err) {
            log("REPLY EVENT DUMP failed:", err.message);
        }
    }

    if (!isAllowed(senderId)) {
        log("ignored (uid not allowed)");
        return;
    }

    // Conversation CONTINUE
    if (replyInfo) {
        const byStoredId = sessions.has(String(replyInfo.id));
        const byBotFlag = isBotMessage(replyInfo.raw, api);

        if (byStoredId || byBotFlag) {
            if (byStoredId) sessions.delete(String(replyInfo.id));
            log("conversation continued via " + (byStoredId ? "stored id" : "bot-reply detection"));
            return deliver(api, event, text);
        }
        log("reply target is NOT a bot message -> ignored");
    }

    // Conversation NEW
    if (text.toLowerCase().includes(BBY_TRIGGER)) {
        log("new conversation started");
        return deliver(api, event, text);
    }

    log("ignored (normal message)");
}

module.exports = onMessage;
