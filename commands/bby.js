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

const BBY_ALIASES = [
    "bby",
    "jan",
    "babu",
    "zero"
];

/* ================================================================= */

function log(...args) {
    if (DEBUG) {
        console.log("[bby]", ...args);
    }
}

function makeTimeoutSignal() {
    const controller = new AbortController();

    const timer = setTimeout(() => {
        controller.abort();
    }, BBY_TIMEOUT_MS);

    timer.unref?.();

    return controller.signal;
}

/* ------------------------- BBY API ---------------------------- */

async function babyAPI(text, attachments = []) {
    const baseRes = await fetch(
        BASE_API_URL,
        {
            signal: makeTimeoutSignal()
        }
    );

    if (!baseRes.ok) {
        throw new Error(
            `base URL HTTP ${baseRes.status}`
        );
    }

    const baseData = await baseRes.json();

    if (
        !baseData ||
        !baseData.mahmud
    ) {
        throw new Error(
            "BBY API base URL not found"
        );
    }

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

            signal: makeTimeoutSignal()
        }
    );

    if (!res.ok) {
        throw new Error(
            `baby API HTTP ${res.status}`
        );
    }

    const data = await res.json();

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

/* ------------------------- Helpers ---------------------------- */

function getSenderID(event) {
    return String(
        event?.senderID ??
        event?.userID ??
        event?.senderId ??
        ""
    );
}

function getMessageID(result) {
    if (!result) return null;

    if (typeof result === "string") {
        return result;
    }

    return (
        result.messageID ??
        result.messageId ??
        result.message_id ??
        result.item_id ??
        result.itemId ??
        result.id ??
        result.mid ??
        result.result?.messageID ??
        result.result?.messageId ??
        result.result?.message_id ??
        result.result?.item_id ??
        result.result?.id ??
        null
    );
}

/* ---------------------- Send BBY Reply ------------------------ */

async function sendBBY(message, text) {
    try {
        const result = await message.reply({
            body: text
        });

        const messageID = getMessageID(result);

        log(
            "BOT REPLY SENT:",
            messageID || "NO_MESSAGE_ID"
        );

        return {
            result,
            messageID
        };
    }
    catch (error) {
        log(
            "SEND ERROR:",
            error.message
        );

        return {
            result: null,
            messageID: null
        };
    }
}

/* ---------------------- Conversation ------------------------- */

/**
 * Send AI response and arm the next reply handler.
 *
 * This is the important part:
 *
 * User
 *   ↓
 * bby
 *   ↓
 * Bot reply #1
 *   ↓
 * setReplyHandler(#1)
 *
 * User replies to #1
 *   ↓
 * Bot reply #2
 *   ↓
 * setReplyHandler(#2)
 *
 * User replies to #2
 *   ↓
 * Bot reply #3
 *   ↓
 * setReplyHandler(#3)
 *
 * ...continues
 */

async function answer({
    message,
    event,
    text,
    setReplyHandler,
    ownerID
}) {
    let output;

    try {
        output = await babyAPI(text);

        log(
            "API REPLY:",
            output
        );
    }
    catch (error) {
        log(
            "API ERROR:",
            error.message
        );

        output = BBY_FALLBACK_MESSAGE;
    }

    const sent = await sendBBY(
        message,
        output
    );

    if (!sent.messageID) {
        log(
            "Cannot arm reply handler: message ID missing"
        );

        return;
    }

    /*
     * Only the same person who started the conversation
     * can continue this conversation.
     */

    setReplyHandler(
        async ({
            message: replyMessage,
            event: replyEvent,
            setReplyHandler: nextReplyHandler
        }) => {
            const currentSenderID =
                getSenderID(replyEvent);

            if (
                ownerID &&
                currentSenderID &&
                String(currentSenderID) !==
                String(ownerID)
            ) {
                log(
                    "IGNORED: different user"
                );

                return;
            }

            const nextText =
                typeof replyEvent.body === "string"
                    ? replyEvent.body.trim()
                    : "";

            if (!nextText) {
                return;
            }

            log(
                "CONVERSATION CONTINUE:",
                nextText
            );

            /*
             * IMPORTANT:
             *
             * This creates the next Bot message and then
             * arms another handler for that NEW message.
             */

            return answer({
                message: replyMessage,
                event: replyEvent,
                text: nextText,
                setReplyHandler: nextReplyHandler,
                ownerID
            });
        },

        sent.messageID
    );

    log(
        "REPLY HANDLER ARMED:",
        sent.messageID
    );
}

/* --------------------------- Command -------------------------- */

async function onStart({
    message,
    event,
    args,
    setReplyHandler
}) {
    const text =
        Array.isArray(args)
            ? args.join(" ").trim()
            : "";

    if (!text) {
        return;
    }

    const ownerID =
        getSenderID(event);

    log(
        "INITIAL:",
        text,
        "| USER:",
        ownerID
    );

    return answer({
        message,
        event,
        text,
        setReplyHandler,
        ownerID
    });
}

/* --------------------------- Exports -------------------------- */

module.exports = {
    config: {
        name: "bby",

        author: "Idle×Saow",

        version: "1.2.0",

        description:
            "Non-prefix BBY AI chatbot with continuous reply conversation",

        category: "none",

        noPrefix: true,

        nonPrefix: true,

        /*
         * Dispatcher checks noPrefixRole.
         * ROLE_USER = 0
         *
         * Therefore everyone can use these aliases.
         */

        noPrefixRole: 0,

        aliases: [
            "bby",
            "jan",
            "babu",
            "zero"
        ],

        cooldown: 3
    },

    onStart
};
