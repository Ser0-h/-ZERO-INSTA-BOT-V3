"use strict";

/**
 * info — show bot runtime information.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const utils = require("../src/utils");

module.exports = {
	config: {
		name: "info",
		aliases: ["stats", "about"],
		author: "Neoaz 🐊",
		category: "info",
		cooldown: 3,
		role: 0,
		description: { en: "Show bot runtime information" },
		usage: { en: "{p}info" }
	},

	onStart: async function ({ message, config, registry, usersData, threadsData, api }) {
		const uptime = utils.formatTime(Date.now() - (global.instabotStartedAt || Date.now()));
		const lines = [
			`🤖 ${config.botName}`,
			`Uptime: ${uptime}`,
			`Prefix: ${config.prefix}`,
			`Commands: ${registry.commands.size}`,
			`Events: ${registry.events.length}`,
			`Users tracked: ${usersData.count()}`,
			`Threads tracked: ${threadsData.count()}`,
			`Bot id: ${api.getCurrentUserID()}`
		];
		return message.reply(lines.join("\n"));
	}
};
