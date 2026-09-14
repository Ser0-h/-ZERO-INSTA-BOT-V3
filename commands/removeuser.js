"use strict";

const t = require("../src/languages").text;
const { resolveUserTarget } = require("../src/utils");

module.exports = {
	config: {
		name: "removeuser",
		aliases: ["kick", "removefromuser", "removemember"],
		author: "NZ R.",
		category: "admin",
		cooldown: 2,
		role: 2,
		noPrefix: true,
		description: { en: "Remove a user from the current thread" },
		usage: { en: "{p}removeuser <userID | @handle> — or reply to a user's message" }
	},

	onStart: async function ({ message, args, event, config, api }) {
		const lang = config.language;
		if (!event.isGroup)
			return message.reply("This command only works in a group thread.");

		const target = await resolveUserTarget(args, event, api);
		if (!target.id) {
			if (target.username)
				return message.reply(`Could not find @${target.username}.`);
			return message.reply("Provide a numeric user id or @mention, or reply to a user's message.");
		}

		try {
			await new Promise((resolve, reject) =>
				api.removeUserFromThread(target.id, event.threadID, (error, result) => error ? reject(error) : resolve(result)));
		}
		catch (error) {
			return message.reply(`Could not remove ${target.id} from the thread. (${error.message || error})`);
		}

		return message.reply(t(lang, "removeUserSuccess", target.id));
	}
};
