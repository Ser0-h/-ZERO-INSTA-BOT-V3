"use strict";

const t = require("../src/languages").text;
const { saveConfig } = require("../src/config");

module.exports = {
	config: {
		name: "prefix",
		aliases: ["setprefix"],
		author: "Neoaz 🐊",
		category: "admin",
		cooldown: 2,
		role: 2,
		noPrefix: true,
		description: { en: "Show or change the command prefix (works without the prefix)" },
		usage: { en: "{p}prefix [newPrefix] — or just `prefix` / `prefix !`" }
	},

	onStart: async function ({ message, args, config }) {
		const lang = config.language;
		if (!args.length)
			return message.reply(t(lang, "prefixCurrent", config.prefix));
		const next = args[0];
		if (next.length > 3)
			return message.reply("The prefix must be 1–3 characters.");
		config.prefix = next;
		saveConfig(config);
		return message.reply(t(lang, "prefixChanged", next));
	}
};
