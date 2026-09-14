"use strict";

const EFFECTS = {
	love: ["love", "heart"],
	angry: ["angry", "mad"],
	laugh: ["laugh", "lol"],
	cry: ["cry", "sad"]
};

module.exports = {
	config: {
		name: "avatarfx",
		aliases: ["avfx", "avatar-effect"],
		author: "Neoaz 🐊",
		category: "utility",
		cooldown: 3,
		role: 0,
		description: { en: "Send text with an animated avatar character effect" },
		usage: { en: "{p}avatarfx <love|angry|laugh|cry> <text>" }
	},

	onStart: async function ({ message, args }) {
		const key = (args.shift() || "").toLowerCase();
		const effect = Object.keys(EFFECTS).find(name => EFFECTS[name].includes(key));
		if (!effect)
			return message.reply(`Pick an effect: ${Object.keys(EFFECTS).join(", ")}.\nExample: avatarfx laugh Nice one!`);

		const text = args.join(" ") || "✨";
		try {
			await message.avatarEffect(text, effect);
		}
		catch (error) {
			const raw = String(error && error.message || error);
			if (/1545003/.test(raw))
				return message.reply("Instagram did not allow the avatar effect in this chat right now. It is enabled per chat and can be unavailable for a while — try again later or use a normal text effect.");
			return message.reply(raw);
		}
	}
};
