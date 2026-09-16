"use strict";

module.exports = {
    config: {
        name: "pp",
        aliases: ["pfp"],
        version: "1.0",
        author: "Idle×Saow",
        countDown: 5,
        role: 0,
        description: {
            en: "Get profile picture of a user"
        },
        category: "media",
        guide: {
            en: "{pn} | {pn} <userId> | {pn} @mention | {pn} (reply)"
        }
    },

    langs: {
        en: {
            failed: "❌ Failed: %1",
            noPfp: "❌ No profile picture found."
        }
    },

    onStart: async function ({ api, event, args, message, getLang }) {
        let targetId = null;

        // !pp <userId>
        if (args[0]) {
            targetId = args[0].replace(/[^0-9]/g, "");
        }

        // !pp @mention
        if (
            !targetId &&
            event.mentions &&
            event.mentions.length
        ) {
            targetId = String(event.mentions[0]);
        }

        // Raw Instagram mention data
        if (
            !targetId &&
            event.raw?.text_entities?.mentioned_user_ids?.length
        ) {
            targetId = String(
                event.raw.text_entities.mentioned_user_ids[0]
            );
        }

        // Reply to a message
        if (!targetId && event.messageReply) {
            targetId = String(
                event.messageReply.user_id ||
                event.messageReply.senderID ||
                event.messageReply.raw?.user_id ||
                ""
            );
        }

        // No target → command sender
        if (!targetId) {
            targetId = String(
                event.senderID ||
                event.userID ||
                ""
            );
        }

        if (!targetId) {
            return message.reply(
                getLang("failed", "no target")
            );
        }

        // Reaction helper
        const react = async (emoji) => {
            try {
                await api.setMessageReaction(
                    emoji,
                    event.threadID,
                    event.messageID,
                    event.clientContext
                );
            } catch (_) {}
        };

        await react("⌛");

        try {
            // Correct Instagram API method
            const info = await api.userInfo.getUserInfo(targetId);

            if (
                !info ||
                !info.success ||
                !info.profile_pic_url
            ) {
                await react("❌");
                return message.reply(
                    getLang("noPfp")
                );
            }

            const url =
                info.hd_profile_pic_url ||
                info.profile_pic_url;

            await api.sendMessage(
                {
                    attachment: url
                },
                event.threadID,
                event
            );

            await react("✅");

        } catch (e) {
            console.error("[PP] Error:", e);

            await react("❌");

            return message.reply(
                getLang(
                    "failed",
                    e?.message || "Unknown error"
                )
            );
        }
    }
};
