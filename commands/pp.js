"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");

const BASE_API_CONFIG =
    "https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json";

function getJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(
            url,
            {
                headers: {
                    "User-Agent": "Mozilla/5.0"
                }
            },
            (res) => {
                let data = "";

                res.on("data", chunk => {
                    data += chunk;
                });

                res.on("end", () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        return reject(
                            new Error(`HTTP ${res.statusCode}`)
                        );
                    }

                    try {
                        resolve(JSON.parse(data));
                    } catch (err) {
                        reject(err);
                    }
                });
            }
        ).on("error", reject);
    });
}

function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);

        https.get(
            url,
            {
                headers: {
                    "User-Agent": "Mozilla/5.0"
                }
            },
            (res) => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    file.close();
                    fs.unlink(filePath, () => {});
                    return reject(
                        new Error(`HTTP ${res.statusCode}`)
                    );
                }

                res.pipe(file);

                file.on("finish", () => {
                    file.close(resolve);
                });
            }
        ).on("error", (err) => {
            file.close();
            fs.unlink(filePath, () => {});
            reject(err);
        });
    });
}

module.exports = {
    config: {
        name: "pp",
        aliases: ["profile", "dp", "pfp"],
        version: "1.0.1",
        author: "Idle×Saow",
        countDown: 5,
        role: 0,
        description: {
            en: "Fetch user's profile picture"
        },
        category: "utility",
        guide: {
            en:
                "{pn}\n" +
                "{pn} @mention\n" +
                "{pn} <reply>"
        }
    },

    onStart: async function ({
        api,
        message,
        event,
        usersData
    }) {
        let uid = event.senderID;

        try {
            // Reply করা user
            if (event.messageReply?.senderID) {
                uid = event.messageReply.senderID;
            }

            // Mention করা user
            else if (
                event.mentions &&
                Object.keys(event.mentions).length > 0
            ) {
                uid = Object.keys(event.mentions)[0];
            }

            if (!uid) {
                return message.reply(
                    "❌ User ID পাওয়া যায়নি।"
                );
            }

            api.setMessageReaction(
                "⌛",
                event.messageID,
                () => {},
                true
            );

            // Base API URL
            const baseData = await getJSON(BASE_API_CONFIG);

            if (!baseData?.mahmud) {
                throw new Error("Base API URL not found");
            }

            const baseUrl = String(baseData.mahmud).replace(/\/+$/, "");

            // PFP API
            const pfpUrl =
                `${baseUrl}/api/pfp?mahmud=${encodeURIComponent(uid)}`;

            // Cache folder
            const cacheDir = path.join(__dirname, "cache");

            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, {
                    recursive: true
                });
            }

            const cachePath = path.join(
                cacheDir,
                `pp_${uid}_${Date.now()}.jpg`
            );

            // Download PFP
            await downloadFile(pfpUrl, cachePath);

            let userName = "User";

            try {
                if (usersData?.getName) {
                    userName = await usersData.getName(uid);
                }
            } catch (_) {}

            return message.reply(
                {
                    body:
                        `> 🎀 ${userName}\n` +
                        `𝐇𝐞𝐫𝐞'𝐬 𝐲𝐨𝐮𝐫 𝐩𝐫𝐨𝐟𝐢𝐥𝐞 𝐩𝐢𝐜𝐭𝐮𝐫𝐞 ✨`,
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
                "❌ Profile picture আনতে সমস্যা হয়েছে।"
            );
        }
    }
};
