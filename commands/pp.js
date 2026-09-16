"use strict";

/**
 * Profile Picture Command
 *
 * !pp          -> Sender's profile picture
 * !pp (reply)  -> Replied user's profile picture
 */

module.exports = {
    config: {
        name: "pp",
        aliases: ["pfp", "dp"],
        version: "1.1.0",
        author: "Idle×Saow",
        category: "utility",
        description: "Send Instagram profile picture.",
        usage: "{pn}",
        cooldown: 3
    },

    onStart: async function ({ api, message, event }) {
        try {
            const targetID = String(
                event.messageReply?.senderID ||
                event.senderID ||
                event.userID ||
                ""
            );

            if (!targetID) {
                return message.reply("⚠️ User ID not found.");
            }

            const getInfo = () => {
                return new Promise((resolve, reject) => {
                    let finished = false;

                    const callback = (error, result) => {
                        if (finished) return;
                        finished = true;

                        if (error) return reject(error);
                        resolve(result);
                    };

                    try {
                        const result = api.getUserInfo(targetID, callback);

                        // Also support Promise-based API
                        if (result && typeof result.then === "function") {
                            result
                                .then(data => callback(null, data))
                                .catch(error => callback(error));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            };

            const result = await getInfo();

            if (!result) {
                return message.reply("⚠️ Instagram user information not found.");
            }

            /*
             * getUserInfo() may return:
             *
             * { "123": { ...profile } }
             *
             * OR
             *
             * { ...profile }
             */
            let profile = result;

            if (
                result[targetID] &&
                typeof result[targetID] === "object"
            ) {
                profile = result[targetID];
            }

            /*
             * Find profile picture URL from common
             * ig-chat-api / Instagram response fields.
             */
            const profilePic =
                profile.profilePicUrl ||
                profile.profile_pic_url ||
                profile.profilePictureUrl ||
                profile.profile_picture_url ||
                profile.hdProfilePicUrl ||
                profile.hd_profile_pic_url ||
                profile.profilePic ||
                profile.profile_picture ||
                profile.avatar ||
                profile.avatarUrl ||
                profile.avatar_url ||
                profile.picture ||
                profile.pictureUrl ||
                profile.picture_url ||
                null;

            if (!profilePic || typeof profilePic !== "string") {
                console.log("[PP] UserInfo response:", profile);
                return message.reply("⚠️ Profile picture URL not found.");
            }

            await message.reply({
                attachment: profilePic
            });

        } catch (error) {
            console.error("[PP] Failed:", error);
            return message.reply("❌ Failed to fetch profile picture.");
        }
    }
};
