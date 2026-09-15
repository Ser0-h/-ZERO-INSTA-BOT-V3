"use strict";

/**
 * onLeave — say goodbye when a member leaves (or is removed from) a thread.
 *
 * Author: Idle×Saow
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
		description: {
			en: "Say goodbye when a member leaves a group thread"
		}
	},

	onEvent: async function ({
		api,
		event,
		message,
		config,
		threadsData,
		usersData
	}) {
		const settings = config.leave || {};

		if (settings.enable === false) return;

		const threadID = event.threadID;

		if (
			Array.isArray(settings.threadIDs) &&
			settings.threadIDs.length &&
			!settings.threadIDs.map(String).includes(String(threadID))
		) {
			return;
		}

		/*
		 * `usernames` contains the affected member.
		 * `userIDs` / `participantID` also refer to the affected member.
		 *
		 * Do not use senderID/userID as a fallback because those can
		 * represent the actor who removed the member.
		 */

		const usernames = Array.isArray(event.usernames)
			? event.usernames.map(String).filter(Boolean)
			: [];

		const ids = (
			event.userIDs && event.userIDs.length
				? event.userIDs
				: event.participantID
					? [event.participantID]
					: []
		)
			.filter(Boolean)
			.map(String);

		if (!usernames.length && !ids.length) return;

		const targets = [];

		for (const name of usernames) {
			targets.push({
				username: name,
				userID: null
			});
		}

		for (const id of ids) {
			if (targets.some(target => target.userID === id)) continue;

			targets.push({
				username: null,
				userID: id
			});
		}

		if (!targets.length) return;

		// Get group name
		const thread = threadsData.get(threadID) || {};
		let threadName = thread.name;

		if (!threadName) {
			try {
				const info = await new Promise((resolve, reject) =>
					api.getThreadInfo(threadID, (error, result) =>
						error ? reject(error) : resolve(result)
					)
				);

				threadName = info && (info.name || info.threadName);

				if (threadName) {
					threadsData.update(threadID, {
						name: threadName
					});
				}
			}
			catch (_) {
				// Group name is optional
			}
		}

		/*
		 * Classic 5 / Idle×Saow leave message
		 */
		const defaultMessage = [
			"𝗜𝗱𝗹𝗲×𝗦𝗮𝗼𝘄!",
			"",
			"» 𝗚𝗼𝗼𝗱𝗯𝘆𝗲, %1. 👋",
			"",
			"» Some people stay for a moment,",
			"» some leave a memory behind. 🌿",
			"",
			"» Your time here may have ended,",
			"» but the moments you shared",
			"» will remain part of this little world. ✨",
			"",
			"» 𝗚𝗿𝗼𝘂𝗽 : %2"
		].join("\n");

		// Custom config message can still override the default
		const template = settings.message || defaultMessage;

		const seen = new Set();

		for (const target of targets) {
			let username = target.username;
			let display = null;

			// Try stored user data first
			if (!username && target.userID) {
				try {
					const stored = usersData.get(target.userID) || {};

					username = stored.username || null;
					display = stored.name || null;
				}
				catch (_) {
					// Continue with API lookup
				}
			}

			// Try API lookup if username is unavailable
			if (!username && target.userID) {
				try {
					const info = await new Promise((resolve, reject) =>
						api.getUserInfo(target.userID, (error, result) =>
							error ? reject(error) : resolve(result)
						)
					);

					const profile = info && info[target.userID];

					username =
						(profile &&
							(profile.vanity || profile.username)) ||
						username;

					display =
						(profile &&
							(profile.name || profile.firstName)) ||
						display;
				}
				catch (_) {
					// Name is optional
				}
			}

			const handle = username
				? "@" + String(username).replace(/^@/, "")
				: null;

			const mention =
				handle ||
				display ||
				target.userID;

			if (!mention) continue;

			if (seen.has(mention)) continue;
			seen.add(mention);

			try {
				await message.send(
					fill(template, [
						mention,
						threadName || threadID
					])
				);
			}
			catch (error) {
				log.warn(
					"LEAVE",
					`Could not announce ${mention}: ${error.message}`
				);
			}
		}
	}
};
