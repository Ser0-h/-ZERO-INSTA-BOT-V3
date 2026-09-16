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

    onStart: async function ({ api, event, message }) {
        var targetID =
            event.messageReply &&
            event.messageReply.senderID
                ? String(event.messageReply.senderID)
                : String(event.senderID || event.userID || "");

        if (!targetID) {
            return message.reply("❌ User ID not found.");
        }

        try {
            var info = await new Promise(function (resolve, reject) {
                var finished = false;

                var timer = setTimeout(function () {
                    if (finished) return;

                    finished = true;
                    reject(new Error("getUserInfo timeout"));
                }, 10000);

                try {
                    api.getUserInfo(targetID, function (error, result) {
                        if (finished) return;

                        finished = true;
                        clearTimeout(timer);

                        if (error) {
                            return reject(error);
                        }

                        resolve(result);
                    });
                } catch (error) {
                    if (finished) return;

                    finished = true;
                    clearTimeout(timer);

                    reject(error);
                }
            });

            if (!info) {
                return message.reply("❌ User information not found.");
            }

            var profile = info[targetID] || info;

            var url =
                profile.profilePicUrl ||
                profile.profile_pic_url ||
                profile.hdProfilePicUrl ||
                profile.hd_profile_pic_url ||
                profile.profilePictureUrl ||
                profile.profile_picture_url;

            if (!url) {
                console.log("[PP] User info response:", info);
                return message.reply("❌ No profile picture found.");
            }

            await api.sendMessage(
                {
                    attachment: url
                },
                event.threadID,
                event
            );

        } catch (error) {
            console.error("[PP] Error:", error);

            return message.reply(
                "❌ PFP failed: " +
                (error.message || "Unknown error")
            );
        }
    }
};
