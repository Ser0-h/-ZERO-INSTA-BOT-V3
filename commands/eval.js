"use strict";

/**
 * eval — evaluate JavaScript in the bot process (bot admins only).
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const util = require("util");

function chunk(text, size = 1500) {
	const parts = [];
	for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
	return parts.length ? parts : [""];
}

module.exports = {
	config: {
		name: "eval",
		aliases: ["ev", "js"],
		author: "Neoaz 🐊",
		category: "admin",
		cooldown: 0,
		role: 2,
		noPrefix: true,
		hidden: true,
		description: { en: "Evaluate JavaScript in the bot process" },
		usage: { en: "{p}eval <code>" }
	},

	onStart: async function (ctx) {
		const { message, args, api, event, config, registry, database, usersData, threadsData } = ctx;
		if (!args.length) return message.reply("Usage: eval <code>");

		let code = args.join(" ");
		const isStatement = /^(const|let|var|return|if|for|while|switch|try|class|function|async)\b/.test(code) || code.includes(";");
		if (!isStatement && !code.includes("await")) code = "return " + code;

		let output;
		try {
			// eslint-disable-next-line no-new-func
			const fn = new Function("api", "event", "config", "registry", "database", "usersData", "threadsData", "message", "require", `"use strict"; return (async () => { ${code} })();`);
			const result = await fn(api, event, config, registry, database, usersData, threadsData, message, require);
			output = util.inspect(result, { depth: 2, colors: false, maxArrayLength: 50 });
		}
		catch (error) {
			output = `Error: ${error && error.stack ? error.stack : String(error)}`;
		}

		for (const part of chunk(String(output))) await message.reply(part);
	}
};
