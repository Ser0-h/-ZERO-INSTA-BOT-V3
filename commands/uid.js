"use strict";

const { instagramUsername, resolveInstagramUserID } = require("../src/utils");

/** A single argument as a username: an @handle, a bare handle, or a profile URL. */
function asUsername(arg) {
	return instagramUsername(arg) || (/^@?[A-Za-z0-9._]{1,30}$/.test(arg) ? arg.replace(/^@/, "") : null);
}

module.exports = {
	config: {
		name: "uid",
		aliases: ["id"],
		author: "Neoaz 🐊",
		category: "info",
		cooldown: 2,
		role: 0,
		description: { en: "Return an Instagram numeric user id" },
		usage: { en: "{p}uid [@handle | userID | profile URL] — or reply to a message" }
	},

	onStart: async function ({ message, args, event, api }) {

		const numeric = args.find(arg => /^\d+$/.test(arg));
		if (numeric) return message.reply(numeric);

		// Accept an @handle, a bare handle, or a profile URL such as
		// https://www.instagram.com/name?stkn=…
		const username = args.map(asUsername).find(Boolean);
		if (username) {
			// The session's getUserInfo only accepts numeric ids, so a username
			// is resolved through Instagram's public profile endpoint. Fall back
			// to getUserInfo for servers that do support handle lookups.
			const id = await resolveInstagramUserID(username);
			if (id) return message.reply(id);
			try {
				const info = await new Promise((resolve, reject) =>
					api.getUserInfo(username, (error, result) => error ? reject(error) : resolve(result)));
				const profile = info && Object.values(info)[0];
				if (profile && profile.userID) return message.reply(String(profile.userID));
			}
			catch (_) { }
			return message.reply(`Could not find @${username}.`);
		}

		const replied = event.messageReply;
		if (replied && replied.senderID) return message.reply(String(replied.senderID));
		return message.reply(String(event.senderID));
	}
};
