"use strict";

const axios = require("axios");

const BASE_API_URL =
  "https://raw.githubusercontent.com/mahmud-aura/HINATA/main/baseApiUrl.json";

const API_TIMEOUT = 20000;

const TRIGGERS = [
  "bby",
  "baby",
  "babu",
  "bbu",
  "jan",
  "bot",
  "জান",
  "জানু",
  "বেবি",
  "wifey",
  "hina",
  "hinata"
];

function log(...args) {
  console.log("[BBY]", ...args);
}

/* =========================
   GET BBY API URL
========================= */

async function getApiUrl() {
  const { data } = await axios.get(BASE_API_URL, {
    timeout: API_TIMEOUT
  });

  let base = data?.mahmud;

  if (Array.isArray(base)) {
    base = base.find(Boolean);
  }

  if (!base) {
    throw new Error("BBY API URL not found");
  }

  return String(base).replace(/\/+$/, "");
}

/* =========================
   BBY API
========================= */

async function askBby(text, senderID) {
  const base = await getApiUrl();

  const url = `${base}/api/baby`;

  log("Request:", text);

  const { data } = await axios.get(url, {
    params: {
      text,
      senderID,
      font: 3
    },

    timeout: API_TIMEOUT
  });

  log("Response:", data);

  if (!data?.reply) {
    throw new Error("BBY returned empty reply");
  }

  return String(data.reply).trim();
}

/* =========================
   MESSAGE ID
========================= */

function getMessageID(info) {
  if (!info) return null;

  if (typeof info === "string") {
    return info;
  }

  return (
    info.messageID ||
    info.messageId ||
    info.id ||
    info.message?.messageID ||
    info.message?.messageId ||
    (Array.isArray(info) ? getMessageID(info[0]) : null)
  );
}

/* =========================
   CONTINUOUS CHAT
========================= */

async function replyAndListen({
  message,
  text,
  senderID,
  setReplyHandler
}) {
  let answer;

  try {
    answer = await askBby(text, senderID);
  } catch (error) {
    log(
      "API ERROR:",
      error?.response?.data ||
      error?.message ||
      error
    );

    answer =
      "❌ BBY API is currently unavailable.\n" +
      "╰➤ Please try again later.";
  }

  let sent;

  try {
    sent = await message.reply(answer);
  } catch (error) {
    log("SEND ERROR:", error?.message || error);
    return;
  }

  const botMessageID = getMessageID(sent);

  log("Bot message ID:", botMessageID);

  /*
   * GoatBot:
   *
   * global.GoatBot.onReply.set(botMessageID, ...)
   *
   * Instagram Bot:
   *
   * setReplyHandler(..., botMessageID)
   */

  if (!botMessageID || typeof setReplyHandler !== "function") {
    log("Could not attach reply listener.");
    return sent;
  }

  setReplyHandler(
    async ({
      message: replyMessage,
      event: replyEvent,
      setReplyHandler: nextSetReplyHandler
    }) => {
      const userText =
        typeof replyEvent?.body === "string"
          ? replyEvent.body.trim()
          : "";

      if (!userText) return;

      log("Reply received:", userText);

      await replyAndListen({
        message: replyMessage,
        text: userText,
        senderID: replyEvent?.senderID || senderID,
        setReplyHandler: nextSetReplyHandler
      });
    },

    botMessageID
  );

  log("Listening for reply:", botMessageID);

  return sent;
}

/* =========================
   COMMAND START
========================= */

async function onStart({
  message,
  args,
  event,
  setReplyHandler
}) {
  const text = args.join(" ").trim();

  const senderID = event?.senderID;

  /*
   * Just:
   *
   * Bby
   */

  if (!text) {
    let sent;

    try {
      sent = await message.reply(
        "╭───〔 ☠️ BBY 〕───╮\n" +
        "➥ Bby is listening... 🥺\n" +
        "➥ Reply to this message.\n" +
        "╰────────────────╯"
      );
    } catch (error) {
      log("Initial send error:", error?.message || error);
      return;
    }

    const botMessageID = getMessageID(sent);

    if (!botMessageID) {
      log("Initial message ID not found.");
      return sent;
    }

    setReplyHandler(
      async ({
        message: replyMessage,
        event: replyEvent,
        setReplyHandler: nextSetReplyHandler
      }) => {
        const userText =
          typeof replyEvent?.body === "string"
            ? replyEvent.body.trim()
            : "";

        if (!userText) return;

        log("Initial reply:", userText);

        await replyAndListen({
          message: replyMessage,
          text: userText,
          senderID: replyEvent?.senderID || senderID,
          setReplyHandler: nextSetReplyHandler
        });
      },

      botMessageID
    );

    log(
      "Initial listener attached:",
      botMessageID
    );

    return sent;
  }

  /*
   * Example:
   *
   * Bby kemon acho
   */

  return replyAndListen({
    message,
    text,
    senderID,
    setReplyHandler
  });
}

/* =========================
   EXPORT
========================= */

module.exports = {
  config: {
    name: "bby",

    author: "Idle×Saow",

    version: "2.0.0",

    description:
      "BBY chatbot with continuous reply conversation",

    category: "ai",

    noPrefix: true,

    noPrefixRole: 0,

    role: 0,

    cooldown: 0
  },

  onStart
};
