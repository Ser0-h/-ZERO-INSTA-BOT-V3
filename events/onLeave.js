"use strict";

/**
 * onLeave — say goodbye when a member leaves (or is removed from) a thread.
 *
 * Configure in config.json:
 *   "leave": {
 *     "enable": true,
 *     "message": "%1 left %2. 👋",   // %1 = user, %2 = thread name
 *     "threadIDs": []                 // empty = every thread
 *   }
 *
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const log = require("../src/logger");

function fill(template, values) {
	return String(template).replace(/%(\d+)/g, (match, index) => {
		const value = values[Number(index) - 1];
		return value == null ? "" : String(value);
	});
}

module.exports = {
	config: {
		name: "onLeave",
		category: "system",
		eventType: "leave",
		description: { en: "Notify when a member leaves a group thread" }
	},

	onEvent: async function ({ api, event, message, config, threadsData, usersData }) {
		const settings = config.leave || {};
		if (settings.enable === false) return;

		const threadID = event.threadID;
		if (Array.isArray(settings.threadIDs) && settings.threadIDs.length &&
			!settings.threadIDs.map(String).includes(String(threadID))) return;

		// Prefer explicit ids; fall back to the usernames an action_log event
		// carries (Instagram exposes the affected member as @handles there).
		const usernames = Array.isArray(event.usernames) ? event.usernames.map(String).filter(Boolean) : [];
		let userIDs = (event.userIDs && event.userIDs.length ? event.userIDs : [event.participantID || event.senderID || event.userID])
			.filter(Boolean).map(String);
		if (!userIDs.length && usernames.length) userIDs = usernames.slice();
		if (!userIDs.length) return;

		const thread = threadsData.get(threadID) || {};
		let threadName = thread.name;
		if (!threadName) {
			try {
				const info = await new Promise((resolve, reject) =>
					api.getThreadInfo(threadID, (error, result) => error ? reject(error) : resolve(result)));
				threadName = info && info.name;
				if (threadName) threadsData.update(threadID, { name: threadName });
			}
			catch (_) { /* name is optional */ }
		}

		const template = settings.message || "%1 left %2. 👋";

		for (const userID of userIDs) {
			// Prefer a stored name so we can still name someone who just left.
			const stored = usersData.get(userID) || {};
			let name = stored.name || stored.username || null;
			if (!name && usernames.includes(userID)) name = userID;
			if (!name) {
				try {
					const info = await new Promise((resolve, reject) =>
						api.getUserInfo(userID, (error, result) => error ? reject(error) : resolve(result)));
					const profile = info && info[userID];
					name = profile && (profile.name || profile.firstName || profile.vanity);
				}
				catch (_) { /* name is optional */ }
			}

			try {
				await message.send(fill(template, [name || userID, threadName || threadID]));
			}
			catch (error) {
				log.warn("LEAVE", `Could not announce ${userID}: ${error.message}`);
			}
		}
	}
};
