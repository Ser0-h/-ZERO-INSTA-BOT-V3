"use strict";

const t = require("../src/languages").text;
const { saveConfig } = require("../src/config");

const ROLE_ADMIN_BOT = 2;

module.exports = {
	config: {
		name: "prefix",
		aliases: ["setprefix"],
		author: "Idle×Saow",
		category: "admin",
		cooldown: 2,
		role: 0,
		noPrefix: true,
		noPrefixRole: 0,
		description: {
			en: "Show the command prefix (bot admins can change it)"
		},
		usage: {
			en: "{p}prefix [newPrefix] — or just `prefix` / `prefix !`"
		}
	},

	onStart: async function ({ message, args, config, role }) {
		const lang = config.language;

		// Show current prefix
		if (!args.length) {
			const prefix = config.prefix;

			return message.reply(
				`𝗜𝗱𝗹𝗲×𝗦𝗮𝗼𝘄!

» 𝗚𝗹𝗼𝗯𝗮𝗹 𝗣𝗿𝗲𝗳𝗶𝘅 : ${prefix}
» 𝗖𝗵𝗮𝘁 𝗣𝗿𝗲𝗳𝗶𝘅    : ${prefix}

» 𝗔𝗱𝗺𝗶𝗻 👑
» 𝗜𝗱𝗹𝗲×𝗦𝗮𝗼𝘄

» 𝗛𝗲𝗹𝗽 : ${prefix}help

𝗧𝘆𝗽𝗲 ${prefix}help 𝘁𝗼 𝘀𝗲𝗲 𝗮𝗹𝗹 𝗰𝗼𝗺𝗺𝗮𝗻𝗱𝘀.`
			);
		}

		// Only bot admins can change prefix
		if (Number(role) < ROLE_ADMIN_BOT)
			return message.reply(
				t(lang, "prefixOnlyAdmin", config.prefix)
			);

		const next = args[0];

		if (next.length > 3)
			return message.reply("The prefix must be 1–3 characters.");

		config.prefix = next;
		saveConfig(config);

		return message.reply(
			t(lang, "prefixChanged", next)
		);
	}
};
