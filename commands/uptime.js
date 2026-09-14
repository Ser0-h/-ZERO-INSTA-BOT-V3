"use strict";

/**
 * uptime — show how long the bot has been running.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const utils = require("../src/utils");

/** "2d 3h 4m 5s" from a millisecond duration. */
function human(ms) {
	return utils.formatTime(Math.max(0, Number(ms) || 0));
}

/** A short, readable local timestamp for when the bot started. */
function startedAt(ms) {
	const date = new Date(ms);
	return date.toISOString().replace("T", " ").replace(/\..+$/, " UTC");
}

module.exports = {
	config: {
		name: "uptime",
		aliases: ["up", "runtime"],
		author: "Neoaz 🐊",
		category: "info",
		cooldown: 2,
		role: 0,
		description: { en: "Show how long the bot has been running" },
		usage: { en: "{p}uptime" }
	},

	onStart: async function ({ message, config }) {
		const since = global.instabotStartedAt || Date.now();
		const elapsed = Date.now() - since;
		const lines = [
			`⏱️ ${(config && config.botName) || "InstaBOT"} uptime`,
			`Running for: ${human(elapsed)}`,
			`Started: ${startedAt(since)}`,
			`Process uptime: ${human(process.uptime() * 1000)}`
		];
		return message.reply(lines.join("\n"));
	}
};
