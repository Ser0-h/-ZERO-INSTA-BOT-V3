"use strict";

/**
 * help — list commands or show details for one command.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const t = require("../src/languages").text;

module.exports = {
	config: {
		name: "help",
		aliases: ["h", "menu"],
		author: "Neoaz 🐊",
		category: "info",
		cooldown: 3,
		role: 0,
		description: {
			en: "List all commands or show how to use one"
		},
		usage: {
			en: "{p}help [command]"
		}
	},

	onStart: async function ({ message, args, config, registry, event }) {
		const lang = config.language;
		const prefix = config.prefix;
		const query = (args[0] || "").toLowerCase();

		if (query) {
			const command = registry.resolve(query);
			if (!command)
				return message.reply(t(lang, "helpNotFound", query));
			const c = command.config;
			const description = (c.description && (c.description[lang] || c.description.en)) || "—";
			const usage = (c.usage && (c.usage[lang] || c.usage.en)) || `${prefix}${c.name}`;
			const lines = [
				t(lang, "helpCommandTitle", c.name),
				t(lang, "helpDescription", description),
				t(lang, "helpUsage", usage.replace(/\{p\}/g, prefix)),
				t(lang, "helpRole", c.role || 0),
				t(lang, "helpCategory", c.category)
			];
			if (c.aliases && c.aliases.length) lines.splice(3, 0, `Aliases: ${c.aliases.join(", ")}`);
			if (c.author) lines.push(`Author: ${c.author}`);
			return message.reply(lines.join("\n"));
		}

		const byCategory = {};
		for (const command of registry.commands.values()) {
			if (command.config.hidden) continue;
			const category = command.config.category || "misc";
			(byCategory[category] = byCategory[category] || []).push(command.config.name);
		}

		const lines = [t(lang, "helpTitle", config.botName.toUpperCase())];
		for (const category of Object.keys(byCategory).sort()) {
			lines.push(`\n▸ ${category}`);
			lines.push(byCategory[category].sort().map(name => `${prefix}${name}`).join("  "));
		}
		lines.push("\n" + t(lang, "helpFooter", prefix));
		return message.reply(lines.join("\n"));
	}
};
