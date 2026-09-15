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

const BBY_TRIGGER = "bby";

/*
 * Conversation কতক্ষণ active থাকবে
 * 30 minutes
 */
const SESSION_TTL_MS = 30 * 60 * 1000;

/* ================================================================= */


/*
 * ============================================================
 * SESSION SYSTEM
 * ============================================================
 *
 * threadId অনুযায়ী conversation রাখা হবে।
 *
 * Example:
 *
 * User:
 *   bby ki koro
 *
 * Bot:
 *   bose asi...
 *
 * User:
 *   [reply to bot] tumi ki eka?
 *
 * Bot:
 *   ha...
 *
 * User:
 *   [reply to bot] khaiso?
 *
 * Bot:
 *   na...
 *
 * এভাবে chain চলবে।
 *
 * প্রতিবার নতুন bot reply আসার পর তার message ID
 * আবার session-এর মধ্যে save হবে।
 */

const sessions = new Map();


/* ============================ HELPERS ============================ */

function log(...args) {
    if (DEBUG) {
        console.log("[bby]", ...args);
    }
}

function now() {
    return Date.now();
}


/*
 * Expired conversation remove
 */
function sweepExpired() {
    const current = now();

    for (const [threadId, session] of sessions) {
        if (current - session.createdAt > SESSION_TTL_MS) {
            log("session expired:", threadId);
            sessions.delete(threadId);
        }
    }
}


/*
 * Timeout signal
 */
function makeTimeoutSignal() {
    const controller = new AbortController();

    const timer = setTimeout(() => {
        controller.abort();
    }, BBY_TIMEOUT_MS);

    timer.unref?.();

    return controller.signal;
}


/* ===================== LOADER ARGUMENT ADAPTER ==================== */

function normalizeArgs(args) {
    const a = args[0];

    if (
        a &&
        typeof a === "object" &&
        (a.api !== undefined || a.event !== undefined)
    ) {
        return {
            api: a.api,
            event: a.event,
        };
    }

    return {
        api: args[0],
        event: args[1],
    };
}


/* ===================== EVENT FIELD EXTRACTORS ==================== */


/*
 * Message ID বের করা
 */
function getMessageId(message) {
    if (!message) return null;

    if (typeof message === "string") {
        return message;
    }

    return (
        message.messageID ??
        message.messageId ??
        message.message_id ??
        message.item_id ??
        message.itemId ??
        message.id ??
        message.mid ??
        message.message?.messageID ??
        message.message?.id ??
        null
    );
}


/*
 * Sender ID
 */
function getSenderId(event) {
    if (!event) return null;

    return (
        event.senderID ??
        event.senderId ??
        event.userID ??
        event.userId ??
        event.user_id ??
        event.author?.id ??
        event.sender?.id ??
        event.from?.id ??
        null
    );
}


/*
 * Thread / conversation ID
 */
function getThreadId(event) {
    if (!event) return null;

    return (
        event.threadID ??
        event.threadId ??
        event.thread_id ??
        event.chatId ??
        event.chatID ??
        event.chat?.id ??
        event.thread?.id ??
        null
    );
}


/*
 * Message text
 */
function getText(event) {
    if (!event) return "";

    const body =
        event.body ??
        event.text ??
        event.content ??
        event.message?.text ??
        event.message?.body ??
        event.message?.content ??
        "";

    return typeof body === "string"
        ? body.trim()
        : "";
}


/*
 * Reply object বের করা
 */
function getReplyObject(event) {
    if (!event) return null;

    return (
        event.messageReply ??
        event.replyTo ??
        event.repliedTo ??
        event.reply_to ??
        event.reply ??
        event.message?.replyTo ??
        event.message?.messageReply ??
        null
    );
}


/*
 * Reply করা message-এর ID
 */
function getReplyTargetId(event) {
    const reply = getReplyObject(event);

    if (!reply) {
        return null;
    }

    return getMessageId(reply);
}


/* ============================ BBY API ============================ */

async function babyAPI(text, attachments = []) {
    /*
     * Base API URL
     */
    const baseRes = await fetch(BASE_API_URL, {
        signal: makeTimeoutSignal(),
    });

    if (!baseRes.ok) {
        throw new Error(`base URL HTTP ${baseRes.status}`);
    }

    const baseData = await baseRes.json();

    if (!baseData || !baseData.mahmud) {
        throw new Error("base API URL missing");
    }


    /*
     * BBY API
     */
    const res = await fetch(
        `${baseData.mahmud}/api/baby?text=${encodeURIComponent(text)}&font=3`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
            },

            body: JSON.stringify({
                attachments,
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
        !data.reply.trim()
    ) {
        throw new Error("baby API returned empty reply");
    }


    return data.reply;
}


/* ======================== SESSION FUNCTIONS ====================== */


/*
 * নতুন conversation শুরু
 */
function createSession(threadId, senderId) {
    const session = {
        threadId: String(threadId),
        senderId: senderId ? String(senderId) : null,

        /*
         * Bot-এর সব recent message ID
         * এইগুলোতে user reply করলে chain চলবে।
         */
        botMessageIds: new Set(),

        createdAt: now(),
        lastActivity: now(),
    };

    sessions.set(String(threadId), session);

    log("conversation started:", threadId);

    return session;
}


/*
 * Existing session update
 */
function touchSession(session) {
    if (!session) return;

    session.lastActivity = now();
    session.createdAt = now();
}


/*
 * Bot-এর নতুন message ID session-এ রাখা
 */
function rememberBotMessage(session, messageId) {
    if (!session || !messageId) return;

    session.botMessageIds.add(String(messageId));

    /*
     * শুধু recent কয়েকটা ID রাখি
     */
    if (session.botMessageIds.size > 10) {
        const first = session.botMessageIds.values().next().value;

        if (first) {
            session.botMessageIds.delete(first);
        }
    }

    touchSession(session);

    log(
        "bot message stored:",
        messageId,
        "| total:",
        session.botMessageIds.size
    );
}


/*
 * এই message ID কি BBY bot-এর message?
 */
function isBotMessage(session, messageId) {
    if (!session || !messageId) {
        return false;
    }

    return session.botMessageIds.has(String(messageId));
}


/*
 * Reply chain-এর জন্য session খোঁজা
 */
function getReplySession(threadId, replyTargetId) {
    if (!threadId || !replyTargetId) {
        return null;
    }

    const session = sessions.get(String(threadId));

    if (!session) {
        return null;
    }

    if (isBotMessage(session, replyTargetId)) {
        return session;
    }

    return null;
}


/* ========================= SEND MESSAGE ========================== */

async function deliver(api, event, userText, session = null) {
    let output;

    /*
     * API call
     */
    try {
        output = await babyAPI(userText);

        log("API reply:", output);
    } catch (err) {
        log("API ERROR:", err?.message || err);

        output = BBY_FALLBACK_MESSAGE;
    }


    /*
     * sendMessage check
     */
    try {
        if (
            !api ||
            typeof api.sendMessage !== "function"
        ) {
            log("ERROR: api.sendMessage not found");
            return;
        }


        const threadId = getThreadId(event);

        if (!threadId) {
            log("ERROR: thread id not found");
            return;
        }


        const senderId = getSenderId(event);


        /*
         * Session না থাকলে নতুন session বানাবে।
         *
         * এটা প্রথম "bby" trigger-এর সময় হবে।
         */
        if (!session) {
            session = createSession(
                threadId,
                senderId
            );
        }


        /*
         * Message পাঠানো
         */
        const sent = await api.sendMessage(
            output,
            threadId
        );


        /*
         * Instagram framework বিভিন্ন format-এ
         * sent message return করতে পারে।
         */
        const sentId = getMessageId(sent);


        if (sentId) {
            rememberBotMessage(
                session,
                sentId
            );

            log(
                "reply sent:",
                sentId,
                "| thread:",
                threadId
            );
        } else {
            /*
             * ID না পেলে session active থাকবে,
             * কিন্তু exact reply-chain detect করা সম্ভব হবে না।
             */
            touchSession(session);

            log(
                "WARN: sendMessage returned no message id"
            );
        }

    } catch (err) {
        log(
            "SEND ERROR:",
            err?.message || err
        );
    }
}


/* ========================== CHAT HANDLER ========================= */

async function onChat() {
    const { api, event } =
        normalizeArgs(arguments);


    sweepExpired();


    if (!event) {
        return;
    }


    const text = getText(event);

    if (!text) {
        return;
    }


    const threadId = getThreadId(event);
    const senderId = getSenderId(event);
    const replyTargetId =
        getReplyTargetId(event);


    log(
        "MESSAGE:",
        text,
        "| thread:",
        threadId,
        "| sender:",
        senderId,
        "| reply:",
        replyTargetId
    );


    if (!threadId) {
        log("ignored: no thread id");
        return;
    }


    /* =========================================================
     * 1. প্রথমে check করবে এটা কি BBY BOT-এর message-এ reply?
     * ========================================================= */

    const replySession =
        getReplySession(
            threadId,
            replyTargetId
        );


    if (replySession) {

        /*
         * শুধু যে user conversation শুরু করেছিল
         * তার reply গ্রহণ করবে।
         */
        if (
            senderId &&
            replySession.senderId &&
            String(senderId) !==
                String(replySession.senderId)
        ) {
            log("ignored: different user");
            return;
        }


        touchSession(replySession);


        log(
            "CONVERSATION REPLY:",
            text
        );


        /*
         * নতুন answer পাঠাবে।
         *
         * গুরুত্বপূর্ণ:
         * session delete করছি না।
         *
         * কারণ নতুন bot message-এর ID
         * deliver() আবার session-এ save করবে।
         */
        return deliver(
            api,
            event,
            text,
            replySession
        );
    }


    /* =========================================================
     * 2. Reply না হলে শুধু "bby" trigger হলে নতুন conversation
     *    শুরু হবে।
     * ========================================================= */

    const lowerText =
        text.toLowerCase();


    /*
     * bby কোথাও থাকলে trigger হবে।
     *
     * আগের behavior-এর মতোই রাখা হয়েছে।
     */
    if (
        lowerText.includes(
            BBY_TRIGGER
        )
    ) {

        log(
            "BBY TRIGGER:",
            text
        );


        /*
         * একই thread-এ পুরোনো session থাকলে
         * নতুন করে reset করা হবে।
         */
        const oldSession =
            sessions.get(
                String(threadId)
            );


        if (oldSession) {
            sessions.delete(
                String(threadId)
            );
        }


        /*
         * নতুন conversation
         */
        const newSession =
            createSession(
                threadId,
                senderId
            );


        return deliver(
            api,
            event,
            text,
            newSession
        );
    }


    /*
     * Normal message এবং bot-এর message-এ
     * reply নয় → ignore.
     */
    log(
        "ignored: normal message"
    );
}


/* =========================== ON REPLY ============================= */

/*
 * কিছু loader onReply আলাদাভাবে call করতে পারে।
 *
 * তাই একই conversation logic ব্যবহার করা হচ্ছে।
 */
async function onReply() {
    return onChat.apply(
        null,
        arguments
    );
}


/* ============================ EXPORTS ============================ */

module.exports = {

    config: {
        name: "bby",

        author: "Idle×Saow",

        version: "1.0.6",

        description:
            "Non-prefix bby AI chatbot for Instagram Direct",

        category: "ai",

        nonPrefix: true,

        noPrefix: true,

        cooldown: 3,
    },


    onChat,

    onReply,


    /*
     * Loader compatibility
     */
    onMessage: onChat,

    handleEvent: onChat,

    handleReply: onReply,

    onStart: onChat,

    run: onChat,

    execute: onChat,

    start: onChat,
};
