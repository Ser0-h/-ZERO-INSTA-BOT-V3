"use strict";

module.exports = {
	config: {
		name: "uid",
		aliases: ["id"],
		author: "Neoaz 🐊",
		category: "info",
		cooldown: 2,
		role: 0,
		description: { en: "Return an Instagram numeric user id" },
		usage: { en: "{p}uid [@handle | userID] — or reply to a message" }
	},

	onStart: async function ({ message, args, event, api }) {

		const numeric = args.find(arg => /^\d+$/.test(arg));
		if (numeric) return message.reply(numeric);

		const handle = args.find(arg => /^@?[A-Za-z0-9._]{1,30}$/.test(arg));
		if (handle) {
			const username = handle.replace(/^@/, "");
			try {
				const info = await new Promise((resolve, reject) =>
					api.getUserInfo(username, (error, result) => error ? reject(error) : resolve(result)));
				const profile = info && Object.values(info)[0];
				if (profile && profile.userID) return message.reply(String(profile.userID));
				return message.reply(`Could not find @${username}.`);
			}
			catch (_) {
				return message.reply(`Could not find @${username}.`);
			}
		}

		const replied = event.messageReply;
		if (replied && replied.senderID) return message.reply(String(replied.senderID));
		return message.reply(String(event.senderID));
	}
};
