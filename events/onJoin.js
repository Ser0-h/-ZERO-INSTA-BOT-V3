"use strict";

/**
 * onJoin — greet people who are added to a group thread.
 *
 * Configure in config.json:
 *   "welcome": {
 *     "enable": true,
 *     "message": "Welcome %1 to %2! 👋",   // %1 = user, %2 = thread name
 *     "threadIDs": []                        // empty = every thread
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
		name: "onJoin",
		category: "system",
		eventType: "join",
		description: { en: "Welcome members added to a group thread" }
	},

	onEvent: async function ({ api, event, message, config, threadsData }) {
		const settings = config.welcome || {};
		if (settings.enable === false) return;

		const threadID = event.threadID;
		if (Array.isArray(settings.threadIDs) && settings.threadIDs.length &&
			!settings.threadIDs.map(String).includes(String(threadID))) return;

		// Instagram's action_log carries the affected member as an @handle in
		// `usernames`; some payloads also carry numeric ids. Greet by USERNAME,
		// not the numeric id, so the welcome reads "@someone" rather than a long
		// number.
		//
		// `senderID`/`userID` in a membership event is the ACTOR (who added the
		// member), NOT the member — using it as a fallback greeted the actor as
		// well. Only `participantID`/`userIDs` name the affected member.
		const usernames = Array.isArray(event.usernames) ? event.usernames.map(String).filter(Boolean) : [];
		const ids = (event.userIDs && event.userIDs.length
			? event.userIDs
			: (event.participantID ? [event.participantID] : []))
			.filter(Boolean).map(String);

		if (!usernames.length && !ids.length) return;

		// One entry per affected member: a known handle when we have one, else
		// the numeric id to be resolved to a username below.
		const targets = [];
		for (const name of usernames) targets.push({ username: name, userID: null });
		for (const id of ids) {
			if (targets.some(t => t.userID === id)) continue;
			// Skip an id whose username we already have from the same event only
			// when they are provably the same member; otherwise keep both and
			// dedupe after resolving.
			targets.push({ username: null, userID: id });
		}
		if (!targets.length) return;

		const thread = threadsData.get(threadID) || {};
		let threadName = thread.name;
		if (!threadName) {
			try {
				const info = await new Promise((resolve, reject) =>
					api.getThreadInfo(threadID, (error, result) => error ? reject(error) : resolve(result)));
				threadName = info && (info.name || (info.threadName));
				if (threadName) threadsData.update(threadID, { name: threadName });
			}
			catch (_) { /* name is optional */ }
		}

		const template = settings.message || "Welcome %1 to %2! 👋";
		const seen = new Set();

		for (const target of targets) {
			let username = target.username;
			let display = null;

			// Resolve a numeric id to its username so the greet never shows an id.
			if (!username && target.userID) {
				try {
					const info = await new Promise((resolve, reject) =>
						api.getUserInfo(target.userID, (error, result) => error ? reject(error) : resolve(result)));
					const profile = info && info[target.userID];
					username = (profile && (profile.vanity || profile.username)) || null;
					display = profile && (profile.name || profile.firstName) || null;
				}
				catch (_) { /* fall back below */ }
			}

			// Prefer the username; keep the full name only as a last resort so a
			// lookup that returns nothing still greets a human rather than a number.
			const handle = username ? "@" + String(username).replace(/^@/, "") : null;
			const mention = handle || display || target.userID;
			if (!mention) continue;
			if (seen.has(mention)) continue;
			seen.add(mention);

			try {
				await message.send(fill(template, [mention, threadName || threadID]));
			}
			catch (error) {
				log.warn("JOIN", `Could not welcome ${mention}: ${error.message}`);
			}
		}
	}
};
