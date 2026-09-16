"use strict";

module.exports = {
    config: {
        name: "pp",
        aliases: ["pfp"],
        version: "1.0.0",
        author: "Idle×Saow",
        countDown: 5,
        role: 0,
        description: {
            en: "Get profile picture of a user"
        },
        category: "media",
        guide: {
            en: "{pn} | {pn} (reply)"
        }
    },

    langs: {
        en: {
            noPfp: "❌ No profile picture found.",
            rateLimit: "⚠️ Instagram temporarily limited this profile request. Try again later.",
            failed: "❌ Failed: %1"
        }
    },

    onStart: async function ({
        api,
        event,
        message,
        getLang,
        usersData
    }) {
        var targetID = "";

        if (
            event.messageReply &&
            event.messageReply.senderID
        ) {
            targetID = String(event.messageReply.senderID);
        } else {
            targetID = String(
                event.senderID ||
                event.userID ||
                ""
            );
        }

        if (!targetID) {
            return message.reply(
                getLang("failed", "user ID not found")
            );
        }

        try {
            /*
             * First try cached user information.
             */
            var cached = null;

            try {
                if (usersData && usersData.get) {
                    cached = await usersData.get(targetID);
                }
            } catch (_) {}

            var url = null;

            if (cached) {
                url =
                    cached.profilePicUrl ||
                    cached.profile_pic_url ||
                    cached.profilePictureUrl ||
                    cached.profile_picture_url ||
                    cached.avatarUrl ||
                    cached.avatar_url ||
                    null;
            }

            /*
             * Only request Instagram if cache has no PP URL.
             */
            if (!url) {
                var info = await api.userInfo.getUserInfo(targetID);

                if (!info) {
                    return message.reply(
                        getLang("noPfp")
                    );
                }

                if (
                    info.statusCode === 429 ||
                    info.code === 429 ||
                    (
                        info.message &&
                        String(info.message).indexOf("429") !== -1
                    )
                ) {
                    return message.reply(
                        getLang("rateLimit")
                    );
                }

                if (
                    info.profile_pic_url
                ) {
                    url =
                        info.hd_profile_pic_url ||
                        info.profile_pic_url;
                }
            }

            if (!url) {
                return message.reply(
                    getLang("noPfp")
                );
            }

            await api.sendMessage(
                {
                    attachment: url
                },
                event.threadID,
                event
            );

        } catch (e) {
            console.error("[PFP]", e);

            var errorText =
                e && e.message
                    ? String(e.message)
                    : "";

            if (errorText.indexOf("429") !== -1) {
                return message.reply(
                    getLang("rateLimit")
                );
            }

            return message.reply(
                getLang(
                    "failed",
                    errorText || "Unknown error"
                )
            );
        }
    }
};
