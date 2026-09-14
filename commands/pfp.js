"use strict";

const { resolveUserTarget, resolveProfile } = require("../src/utils");

module.exports = {
	config: {
		name: "pfp",
		aliases: ["pp", "profilepic", "avatarof"],
		author: "Neoaz 🐊",
		category: "info",
		cooldown: 3,
		role: 0,
		description: { en: "Send a user's profile picture" },
		usage: { en: "{p}pfp [userID | @handle | username | profile URL] — or reply to a message" }
	},

	onStart: async function ({ message, args, event, api }) {
		const target = await resolveUserTarget(args, event, api);
		if (!target.id) {
			if (target.username) return message.reply(`Could not find @${target.username}.`);
			return message.reply("Provide a numeric user id or @mention, or reply to a user's message.");
		}

		const profile = await resolveProfile(args, event, api);
		const picture = profile && profile.profilePicture;
		if (!picture)
			return message.reply(`Could not find a profile picture for ${target.id}.`);

		const name = (profile && (profile.name || profile.username)) || target.id;
		await message.reply({ attachment: picture, body: `🖼️ ${name} (${target.id})` });
	}
};
