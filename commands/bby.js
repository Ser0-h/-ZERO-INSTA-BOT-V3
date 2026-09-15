"use strict";

/**
 * ============================================================
 *  bby.js — Instagram Direct non-prefix AI chatbot
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
 * Conversation timeout
 */
const SESSION_TTL_MS = 30 * 60 * 1000;


/* ================================================================= */


/*
 * ============================================================
 * Conversation sessions
 *
 * threadID -> {
 *   userId,
 *   botMessageId,
 *   createdAt,
 *   lastActivity
 * }
 *
 * শুধুমাত্র latest bot message-এ reply করলে
 * conversation continue হবে।
 * ============================================================
 */

const sessions = new Map();


/* ============================ DEBUG ============================== */

function log(...args) {
    if (DEBUG) {
        console.log("[bby]", ...args);
    }
}


/* ============================ TIME =============================== */

function now() {
    return Date.now();
}


/* ======================== SESSION CLEAN ========================== */

function sweepExpired() {
    const current = now();

    for (const [threadId, session] of sessions) {
        if (
            current - session.lastActivity >
            SESSION_TTL_MS
        ) {
            log(
                "conversation expired:",
                threadId
            );

            sessions.delete(threadId);
        }
    }
}


/* =========================== TIMEOUT ============================= */

function makeTimeoutSignal() {
    const controller =
        new AbortController();

    const timer = setTimeout(() => {
        controller.abort();
    }, BBY_TIMEOUT_MS);

    timer.unref?.();

    return controller.signal;
}


/* ===================== LOADER ADAPTER ============================ */

function normalizeArgs(args) {
    const first = args[0];

    if (
        first &&
        typeof first === "object" &&
        (
            first.api !== undefined ||
            first.event !== undefined
        )
    ) {
        return {
            api: first.api,
            event: first.event
        };
    }

    return {
        api: args[0],
        event: args[1]
    };
}


/* ===================== MESSAGE ID =============================== */

function getMessageId(message) {
    if (!message) {
        return null;
    }

    if (typeof message === "string") {
        return message;
    }

    return (
        message.messageID ??
        message.messageId ??
        message.message_id ??
        message.item_id ??
        message.itemId ??
        message.mid ??
        message.id ??
        message.message?.messageID ??
        message.message?.messageId ??
        message.message?.id ??
        null
    );
}


/* ======================== SENDER ID ============================== */

function getSenderId(event) {
    if (!event) {
        return null;
    }

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


/* ======================== THREAD ID ============================== */

function getThreadId(event) {
    if (!event) {
        return null;
    }

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


/* =========================== TEXT ================================ */

function getText(event) {
    if (!event) {
        return "";
    }

    const text =
        event.body ??
        event.text ??
        event.content ??
        event.message?.text ??
        event.message?.body ??
        event.message?.content ??
        "";

    return typeof text === "string"
        ? text.trim()
        : "";
}


/* ========================== REPLY DATA =========================== */

function getReplyObject(event) {
    if (!event) {
        return null;
    }

    return (
        event.messageReply ??
        event.message_reply ??
        event.replyTo ??
        event.repliedTo ??
        event.reply_to ??
        event.reply ??
        event.message?.messageReply ??
        event.message?.replyTo ??
        event.message?.reply ??
        null
    );
}


function getReplyTargetId(event) {
    const reply = getReplyObject(event);

    if (!reply) {
        return null;
    }

    return getMessageId(reply);
}


/* ============================ BBY API ============================ */

async function babyAPI(
    text,
    attachments = []
) {

    const baseRes = await fetch(
        BASE_API_URL,
        {
            signal:
                makeTimeoutSignal()
        }
    );


    if (!baseRes.ok) {
        throw new Error(
            `base URL HTTP ${baseRes.status}`
        );
    }


    const baseData =
        await baseRes.json();


    if (
        !baseData ||
        !baseData.mahmud
    ) {
        throw new Error(
            "Invalid base API response"
        );
    }


    const apiUrl =
        `${baseData.mahmud}/api/baby` +
        `?text=${encodeURIComponent(text)}` +
        `&font=3`;


    const res = await fetch(
        apiUrl,
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({
                attachments
            }),

            signal:
                makeTimeoutSignal()
        }
    );


    if (!res.ok) {
        throw new Error(
            `baby API HTTP ${res.status}`
        );
    }


    const data =
        await res.json();


    if (
        !data ||
        typeof data.reply !== "string" ||
        !data.reply.trim()
    ) {
        throw new Error(
            "baby API returned empty reply"
        );
    }


    return data.reply;
}


/* ======================= START SESSION =========================== */

function startConversation(
    threadId,
    userId
) {

    const session = {
        threadId: String(threadId),

        userId:
            userId !== null &&
            userId !== undefined
                ? String(userId)
                : null,

        /*
         * সর্বশেষ bot message ID
         */
        botMessageId: null,

        createdAt: now(),

        lastActivity: now()
    };


    sessions.set(
        String(threadId),
        session
    );


    log(
        "conversation started:",
        threadId,
        "user:",
        userId
    );


    return session;
}


/* ======================= SESSION UPDATE ========================== */

function updateSession(
    session,
    botMessageId
) {

    if (!session) {
        return;
    }


    if (botMessageId) {
        session.botMessageId =
            String(botMessageId);
    }


    session.lastActivity =
        now();

    session.createdAt =
        now();
}


/* ===================== CHECK BOT REPLY =========================== */

function isConversationReply(
    session,
    replyTargetId
) {

    if (
        !session ||
        !replyTargetId ||
        !session.botMessageId
    ) {
        return false;
    }


    return (
        String(replyTargetId) ===
        String(session.botMessageId)
    );
}


/* ========================= DELIVERY ============================== */

async function deliver(
    api,
    event,
    userText,
    session
) {

    let output;


    /* -------------------- API REQUEST -------------------- */

    try {

        output =
            await babyAPI(
                userText
            );


        log(
            "API reply:",
            output
        );

    } catch (error) {

        log(
            "API ERROR:",
            error?.message ||
            error
        );

        output =
            BBY_FALLBACK_MESSAGE;
    }


    /* -------------------- SEND --------------------------- */

    if (
        !api ||
        typeof api.sendMessage !==
            "function"
    ) {

        log(
            "ERROR: sendMessage unavailable"
        );

        return;
    }


    const threadId =
        getThreadId(event);


    if (!threadId) {

        log(
            "ERROR: thread ID missing"
        );

        return;
    }


    try {

        const sent =
            await api.sendMessage(
                output,
                threadId
            );


        /*
         * Instagram bot framework
         * যেভাবেই ID return করুক,
         * সেটা বের করার চেষ্টা।
         */
        const sentId =
            getMessageId(sent);


        if (sentId) {

            updateSession(
                session,
                sentId
            );


            log(
                "new bot message:",
                sentId
            );

        } else {

            /*
             * ID না পেলেও conversation
             * কিছুক্ষণ active থাকবে।
             */
            updateSession(
                session,
                null
            );


            log(
                "WARNING: bot message ID not returned"
            );
        }


    } catch (error) {

        log(
            "SEND ERROR:",
            error?.message ||
            error
        );
    }
}


/* ============================ CHAT ================================ */

async function onChat() {

    const {
        api,
        event
    } = normalizeArgs(
        arguments
    );


    sweepExpired();


    if (!event) {
        return;
    }


    const text =
        getText(event);


    if (!text) {
        return;
    }


    const threadId =
        getThreadId(event);


    const senderId =
        getSenderId(event);


    const replyTargetId =
        getReplyTargetId(event);


    if (!threadId) {

        log(
            "ignored: no thread ID"
        );

        return;
    }


    log(
        "incoming:",
        text,
        "| thread:",
        threadId,
        "| sender:",
        senderId,
        "| reply:",
        replyTargetId
    );


    /* ========================================================
     * 1. EXISTING CONVERSATION
     *
     * User যদি bot-এর সর্বশেষ message-এ reply করে,
     * তাহলে bby না লিখেও conversation চলবে।
     * ======================================================== */

    const session =
        sessions.get(
            String(threadId)
        );


    if (
        session &&
        isConversationReply(
            session,
            replyTargetId
        )
    ) {

        /*
         * Conversation যে user শুরু করেছে
         * শুধু সেই user continue করতে পারবে।
         */
        if (
            session.userId &&
            senderId &&
            String(session.userId) !==
                String(senderId)
        ) {

            log(
                "ignored: different user"
            );

            return;
        }


        log(
            "CONVERSATION CONTINUE:",
            text
        );


        /*
         * session delete করা হবে না।
         *
         * Bot নতুন message পাঠানোর পর
         * তার নতুন ID আবার session-এ বসবে।
         */
        return deliver(
            api,
            event,
            text,
            session
        );
    }


    /* ========================================================
     * 2. NEW BBY CONVERSATION
     *
     * শুধু bby থাকলে নতুন conversation শুরু।
     * ======================================================== */

    if (
        text
            .toLowerCase()
            .includes(BBY_TRIGGER)
    ) {

        log(
            "NEW BBY TRIGGER:",
            text
        );


        /*
         * পুরোনো conversation থাকলে reset
         */
        const newSession =
            startConversation(
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


    /* ========================================================
     * 3. NORMAL MESSAGE
     *
     * bby নেই এবং bot-এর message-এ reply-ও নয়
     * → কিছু করবে না।
     * ======================================================== */

    log(
        "ignored: normal message"
    );
}


/* =========================== ON REPLY ============================= */

/*
 * Loader যদি onReply আলাদা করে call করে,
 * একই logic ব্যবহার করবে।
 */
async function onReply() {

    return onChat.apply(
        null,
        arguments
    );
}


/* ============================ EXPORT ============================== */

module.exports = {

    config: {

        name: "bby",

        author: "Idle×Saow",

        version: "1.0.7",

        description:
            "Non-prefix bby AI chatbot with reply conversation chain",

        category: "ai",


        /*
         * বিভিন্ন loader-এর জন্য
         * non-prefix flags রাখা হয়েছে।
         */
        nonPrefix: true,

        noPrefix: true,

        prefix: false,

        hasPrefix: false,

        usePrefix: false,


        cooldown: 3
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

    start: onChat
};
