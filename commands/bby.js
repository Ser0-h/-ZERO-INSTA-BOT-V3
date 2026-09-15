"use strict";

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

function log(...args) {
    if (DEBUG) {
        console.log("[bby]", ...args);
    }
}

function timeoutSignal() {
    const controller = new AbortController();

    const timer = setTimeout(() => {
        controller.abort();
    }, BBY_TIMEOUT_MS);

    timer.unref?.();

    return controller.signal;
}

async function babyAPI(text, attachments = []) {
    const baseRes = await fetch(BASE_API_URL, {
        signal: timeoutSignal()
    });

    if (!baseRes.ok) {
        throw new Error(`Base API HTTP ${baseRes.status}`);
    }

    const baseData = await baseRes.json();

    if (!baseData || !baseData.mahmud) {
        throw new Error("Base API URL missing");
    }

    const url =
        `${baseData.mahmud}/api/baby` +
        `?text=${encodeURIComponent(text)}` +
        `&font=3`;

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            attachments
        }),
        signal: timeoutSignal()
    });

    if (!res.ok) {
        throw new Error(`BBY API HTTP ${res.status}`);
    }

    const data = await res.json();

    if (
        !data ||
        typeof data.reply !== "string" ||
        !data.reply.trim()
    ) {
        throw new Error("BBY API returned empty reply");
    }

    return data.reply;
}

function getUserID(event) {
    return String(
        event?.senderID ??
        event?.senderId ??
        event?.userID ??
        ""
    );
}

function getMessageID(result) {
    if (!result) return null;

    if (typeof result === "string") {
        return result;
    }

    if (Array.isArray(result)) {
        return getMessageID(result[0]);
    }

    return (
        result.messageID ??
        result.messageId ??
        result.message_id ??
        result.item_id ??
        result.itemId ??
        result.id ??
        result.mid ??
        null
    );
}

async function sendReply(message, text) {
    try {
        const result = await message.reply({
            body: text
        });

        const messageID = getMessageID(result);

        log(
            "BOT MESSAGE:",
            messageID || "NO ID"
        );

        return {
            result,
            messageID
        };
    } catch (error) {
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

async function createConversation({
    message,
    event,
    text,
    setReplyHandler,
    userID
}) {
    let reply;

    try {
        reply = await babyAPI(text);

        log(
            "API:",
            text,
            "=>",
            reply
        );
    } catch (error) {
        log(
            "API ERROR:",
            error.message
        );

        reply = BBY_FALLBACK_MESSAGE;
    }

    const sent = await sendReply(
        message,
        reply
    );

    if (!sent.messageID) {
        log(
            "Cannot continue conversation: no message ID"
        );

        return;
    }

    setReplyHandler(
        async ({
            message: nextMessage,
            event: nextEvent,
            setReplyHandler: nextSetReplyHandler
        }) => {
            const nextUserID =
                getUserID(nextEvent);

            if (
                userID &&
                nextUserID &&
                String(userID) !== String(nextUserID)
            ) {
                log(
                    "Ignored reply from another user"
                );

                return;
            }

            const nextText =
                typeof nextEvent.body === "string"
                    ? nextEvent.body.trim()
                    : "";

            if (!nextText) {
                return;
            }

            log(
                "CONTINUE:",
                nextText
            );

            return createConversation({
                message: nextMessage,
                event: nextEvent,
                text: nextText,
                setReplyHandler: nextSetReplyHandler,
                userID
            });
        },
        sent.messageID
    );

    log(
        "HANDLER ARMED:",
        sent.messageID
    );
}

async function onStart({
    message,
    event,
    invokedAs,
    args,
    setReplyHandler
}) {
    let text = "";

    if (Array.isArray(args) && args.length) {
        text = args.join(" ").trim();
    }

    if (!text && invokedAs) {
        text = String(invokedAs).trim();
    }

    if (!text) {
        return;
    }

    const alias = String(
        invokedAs || ""
    ).toLowerCase();

    if (!BBY_ALIASES.includes(alias)) {
        return;
    }

    const userID =
        getUserID(event);

    log(
        "START:",
        alias,
        "| USER:",
        userID
    );

    return createConversation({
        message,
        event,
        text,
        setReplyHandler,
        userID
    });
}

module.exports = {
    config: {
        name: "bby",
        author: "Idle×Saow",
        version: "1.3.0",
        description:
            "Non-prefix BBY AI chatbot with continuous reply conversation",
        category: "none",
        noPrefix: true,
        nonPrefix: true,
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
