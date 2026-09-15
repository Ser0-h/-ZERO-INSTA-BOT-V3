"use strict";

/**
 * onJoin — greet people who are added to a group thread.
 *
 * Configure in config.json:
 *   "welcome": {
 *     "enable": true,
 *     "message": "Welcome %1 to %2! 👋",
 *     "selfMessage": "Thanks for inviting me to %2.",
 *     "threadIDs": []
 *   }
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
		name: "onJoin",
		category: "system",
		eventType: "join",
		description: {
			en: "Welcome members added to a group thread"
		}
	},

	onEvent: async function ({
		api,
		event,
		message,
		config,
		threadsData
	}) {
		const settings = config.welcome || {};

		if (settings.enable === false) return;

		const threadID = event.threadID;

		if (
			Array.isArray(settings.threadIDs) &&
			settings.threadIDs.length &&
			!settings.threadIDs.map(String).includes(String(threadID))
		) {
			return;
		}

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

		/* -------------------- THREAD NAME -------------------- */

		const thread = threadsData.get(threadID) || {};
		let threadName = thread.name;

		if (!threadName) {
			try {
				const info = await new Promise((resolve, reject) =>
					api.getThreadInfo(
						threadID,
						(error, result) =>
							error ? reject(error) : resolve(result)
					)
				);

				threadName =
					info && (info.name || info.threadName);

				if (threadName) {
					threadsData.update(threadID, {
						name: threadName
					});
				}
			}
			catch (_) {
				/* Group name is optional */
			}
		}

		threadName = threadName || threadID;

		/* -------------------- BOT ID -------------------- */

		let selfID = null;

		try {
			selfID = String(
				api.getCurrentUserID() ||
				api._userID ||
				""
			) || null;
		}
		catch (_) {
			selfID = null;
		}

		const selfHandles = new Set();

		try {
			const info = selfID
				? await new Promise(resolve =>
					api.getUserInfo(
						selfID,
						(error, result) =>
							resolve(error ? null : result)
					)
				)
				: null;

			const self = info && info[selfID];

			if (self && (self.vanity || self.username)) {
				selfHandles.add(
					String(
						self.vanity || self.username
					)
						.replace(/^@/, "")
						.toLowerCase()
				);
			}
		}
		catch (_) {
			/* Best effort */
		}

		const isSelf = target =>
			(selfID &&
				target.userID &&
				String(target.userID) === selfID) ||
			(
				target.username &&
				selfHandles.has(
					String(target.username)
						.replace(/^@/, "")
						.toLowerCase()
				)
			);

		/* -------------------- TARGETS -------------------- */

		const targets = [];

		for (const name of usernames) {
			targets.push({
				username: name,
				userID: null
			});
		}

		for (const id of ids) {
			if (targets.some(t => t.userID === id)) continue;

			targets.push({
				username: null,
				userID: id
			});
		}

		if (!targets.length) return;

		/* -------------------- BOT WAS ADDED -------------------- */

		const selfTargets = targets.filter(isSelf);
		const memberTargets = targets.filter(t => !isSelf(t));

		if (selfTargets.length) {
			const prefix = String(
				config.prefix == null
					? "!"
					: config.prefix
			);

			const selfMessage = [
				"𝗜𝗱𝗹𝗲×𝗦𝗮𝗼𝘄!",
				"",
				"» 𝗪𝗮𝗿𝗺𝗹𝘆 𝗪𝗲𝗹𝗰𝗼𝗺𝗲, 𝗜𝗱𝗹𝗲×𝗦𝗮𝗼𝘄! 🌸",
				"",
				"» Every new place begins with a first step,",
				"» and today, I've found my way into yours. ✨",
				"",
				"» May I bring a little laughter to your conversations,",
				"» a little warmth to your moments,",
				"» and something memorable to your days. 🕊️",
				"",
				"» From this moment on,",
				"» let our little journey begin. 🌿",
				"",
				`» 𝗚𝗿𝗼𝘂𝗽 : ${threadName}`,
				`» 𝗧𝘆𝗽𝗲 : ${prefix}help`
			].join("\n");

			try {
				await message.send(selfMessage);
			}
			catch (error) {
				log.warn(
					"JOIN",
					`Could not send bot welcome: ${error.message}`
				);
			}
		}

		if (!memberTargets.length) return;

		/* -------------------- MEMBER WELCOME -------------------- */

		const seen = new Set();

		for (const target of memberTargets) {
			let username = target.username;
			let display = null;

			/* Resolve ID → username */
			if (!username && target.userID) {
				try {
					const info = await new Promise(
						(resolve, reject) =>
							api.getUserInfo(
								target.userID,
								(error, result) =>
									error
										? reject(error)
										: resolve(result)
							)
					);

					const profile =
						info && info[target.userID];

					username =
						(profile &&
							(profile.vanity ||
								profile.username)) ||
						null;

					display =
						profile &&
						(profile.name ||
							profile.firstName) ||
						null;
				}
				catch (_) {
					/* Fall back below */
				}
			}

			const handle = username
				? "@" +
					String(username).replace(/^@/, "")
				: null;

			const mention =
				handle ||
				display ||
				target.userID;

			if (!mention) continue;
			if (seen.has(mention)) continue;

			seen.add(mention);

			const welcomeMessage = [
				"𝗜𝗱𝗹𝗲×𝗦𝗮𝗼𝘄!",
				"",
				`» 𝗪𝗮𝗿𝗺𝗹𝘆 𝗪𝗲𝗹𝗰𝗼𝗺𝗲, ${mention}! 🌸`,
				"",
				"» Every new face brings a new story,",
				"» every presence leaves a little warmth behind. ✨",
				"",
				"» Today, you step into our little world,",
				"» where strangers slowly become familiar,",
				"» and moments quietly turn into memories. 🕊️",
				"",
				"» Make yourself at home,",
				"» and let the journey begin. 🌿",
				"",
				`» 𝗚𝗿𝗼𝘂𝗽 : ${threadName}`
			].join("\n");

			try {
				await message.send(welcomeMessage);
			}
			catch (error) {
				log.warn(
					"JOIN",
					`Could not welcome ${mention}: ${error.message}`
				);
			}
		}
	}
};
