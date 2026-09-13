"use strict";

/**
 * uid — return an Instagram numeric user id and nothing else.
 *
 * Target resolution, in order:
 *   1. a numeric id in the arguments            (uid 24268962575)
 *   2. an @handle or bare username in the args  (uid @__neo.nnn)
 *   3. the sender of the message being replied to (reply + uid)
 *   4. the sender of the command                 (uid)
 *
 * The reply is always a single number (or a one-line error), never labels,
 * thread ids or the caller's own id when another user is targeted.
 *
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

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
		// A numeric id is already the answer.
		const numeric = args.find(arg => /^\d+$/.test(arg));
		if (numeric) return message.reply(numeric);

		// @handle or bare username: resolve it to a numeric id.
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

		// Reply target, then the caller.
		const replied = event.messageReply;
		if (replied && replied.senderID) return message.reply(String(replied.senderID));
		return message.reply(String(event.senderID));
	}
};
