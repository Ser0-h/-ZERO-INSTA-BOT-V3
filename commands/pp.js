"use strict";

/**
 * Profile Picture Command
 * !pp              → sender's profile picture
 * !pp (reply)      → replied user's profile picture
 */

module.exports = {
    config: {
        name: "pp",
        aliases: ["pfp", "dp"],
        version: "1.0.0",
        author: "Idle×Saow",
        category: "utility",
        description: "Send Instagram profile picture.",
        usage: "{pn}",
        cooldown: 3
    },

    onStart: async function ({ api, message, event }) {
        try {
            const targetID = event.messageReply?.senderID
                ? String(event.messageReply.senderID)
                : String(event.senderID || event.userID || "");

            if (!targetID) {
                return message.reply("⚠️ Unable to determine user.");
            }

            const userInfo = await new Promise((resolve, reject) => {
                api.getUserInfo(targetID, (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                });
            });

            const profile = userInfo?.[targetID];

            if (!profile) {
                return message.reply("⚠️ User information not found.");
            }

            const profilePic =
                profile.profilePicUrl ||
                profile.profile_pic_url ||
                profile.profilePictureUrl ||
                profile.profile_picture_url ||
                profile.hdProfilePicUrl ||
                profile.hd_profile_pic_url;

            if (!profilePic) {
                return message.reply("⚠️ Profile picture URL not found.");
            }

            await message.reply({
                attachment: profilePic
            });

        } catch (error) {
            console.error("[PP] Error:", error);
            return message.reply("❌ Failed to fetch profile picture.");
        }
    }
};
