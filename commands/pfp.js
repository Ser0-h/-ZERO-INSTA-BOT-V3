module.exports = {
  config: {
    name: "pfp",
    aliases: ["profilepic"],
    version: "1.0",
    author: "Mahi",
    countDown: 5,
    role: 0,
    description: { en: "Get profile picture of a user" },
    category: "media",
    guide: { en: "{pn} | {pn} <userId> | {pn} @mention | {pn} (reply)" }
  },

  langs: {
    en: {
      failed: "❌ Failed: %1",
      noPfp: "❌ No profile picture found."
    }
  },

  onStart: async function ({ api, event, args, message, getLang }) {
    let targetId = null;

    if (args[0]) {
      targetId = args[0].replace(/[^0-9]/g, "");
    }

    if (!targetId && event.mentions && event.mentions.length) {
      targetId = String(event.mentions[0]);
    }

    if (!targetId && event.raw?.text_entities?.mentioned_user_ids?.length) {
      targetId = String(event.raw.text_entities.mentioned_user_ids[0]);
    }

    if (!targetId && event.messageReply) {
      targetId = String(
        event.messageReply.user_id ||
        event.messageReply.senderID ||
