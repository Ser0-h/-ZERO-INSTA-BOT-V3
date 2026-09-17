"use strict";

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BASE_API_CONFIG =
    "https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json";

const getBaseApiUrl = async () => {
    const response = await axios.get(BASE_API_CONFIG, {
        timeout: 10000
    });

    if (!response.data?.mahmud) {
        throw new Error("Base API URL not found");
    }

    return response.data.mahmud;
};

module.exports = {
    config: {
        name: "pp",
        aliases: ["profile", "dp", "pfp"],
        version: "1.0.0",
        author: "Idle×Saow",
        countDown: 5,
        role: 0,
        description: "Fetch user's profile picture",
        category: "utility",
        guide: {
            en:
                "{pn}\n" +
                "{pn} @mention\n" +
                "{pn} <reply>"
        }
    },

    onStart: async function ({ api, message, args, event, usersData }) {
        let uid = event.senderID;

        try {
            /*
             * Priority:
             * 1. Replied user's UID
             * 2. Mentioned user's UID
             * 3. Sender's UID
             */

            if (event.messageReply?.senderID) {
                uid = event.messageReply.senderID;
            } else if (
                event.mentions &&
                Object.keys(event.mentions).length > 0
            ) {
                uid = Object.keys(event.mentions)[0];
            }

            if (!uid) {
                return message.reply("❌ User ID পাওয়া যায়নি।");
            }

            api.setMessageReaction(
                "⌛",
                event.messageID,
                () => {},
                true
            );

            const baseUrl = await getBaseApiUrl();

            /*
             * Original API
             * /api/pfp?mahmud=UID
             */
            const pfpUrl =
                `${baseUrl}/api/pfp?mahmud=${encodeURIComponent(uid)}`;

            const response = await axios.get(pfpUrl, {
                responseType: "arraybuffer",
                timeout: 15000,
                headers: {
                    "User-Agent": "Mozilla/5.0"
                }
            });

            if (!response.data || response.data.length === 0) {
                throw new Error("Empty profile picture response");
            }

            const cacheDir = path.join(__dirname, "cache");

            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }

            const cachePath = path.join(
                cacheDir,
                `pp_${uid}_${Date.now()}.jpg`
            );

            fs.writeFileSync(cachePath, Buffer.from(response.data));

            let userName = "User";

            try {
                if (usersData?.getName) {
                    userName = await usersData.getName(uid);
                }
            } catch (_) {
                // Name unavailable, use default
            }

            return message.reply(
                {
                    body: `> 🎀 ${userName}\n\n𝐇𝐞𝐫𝐞'𝐬 𝐲𝐨𝐮𝐫 𝐩𝐫𝐨𝐟𝐢𝐥𝐞 𝐩𝐢𝐜𝐭𝐮𝐫𝐞 ✨`,
                    attachment: fs.createReadStream(cachePath)
                },
                () => {
                    api.setMessageReaction(
                        "✅",
                        event.messageID,
                        () => {},
                        true
                    );

                    setTimeout(() => {
                        try {
                            if (fs.existsSync(cachePath)) {
                                fs.unlinkSync(cachePath);
                            }
                        } catch (_) {}
                    }, 1000);
                }
            );

        } catch (error) {
            console.error("[PP ERROR]", error);

            api.setMessageReaction(
                "❌",
                event.messageID,
                () => {},
                true
            );

            return message.reply(
                "❌ Profile picture আনতে সমস্যা হয়েছে। API হয়তো বর্তমানে unavailable।"
            );
        }
    }
};
