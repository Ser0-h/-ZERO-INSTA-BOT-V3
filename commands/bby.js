"use strict";

/**
 * Native InstaBOT port of dipto's Goat-Bot-V2 baby command.
 */

const API_BASE = "https://noobs-api.top/dipto";
const API_PATH = "/baby";

async function request(params = {}) {
	const url = new URL(`${API_BASE}${API_PATH}`);

	for (const [key, value] of Object.entries(params)) {
		if (value != null && String(value) !== "") {
			url.searchParams.set(key, String(value));
		}
	}

	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
			"User-Agent": "InstaBOT"
		}
	});

	let data = {};

	try {
		data = await response.json();
	} catch (_) {}

	if (!response.ok) {
		const detail =
			data && (data.error || data.message)
				? `: ${data.error || data.message}`
				: "";

		throw new Error(
			`baby API returned HTTP ${response.status}${detail}`
		);
	}

	return data || {};
}

function textOf(
	data,
	fallback = "The baby API returned no reply."
) {
	const value =
		data &&
		(
			data.reply != null
				? data.reply
				: data.message != null
					? data.message
					: data.data
		);

	return value == null ? fallback : String(value);
}

async function answer(event, value) {
	const data = await request({
		text: String(value).toLowerCase(),
		senderID: event.senderID,
		font: 1
	});

	return textOf(data);
}

/*
 * GoatBot-style continuous reply system
 */
function armReply(setReplyHandler, sent) {
	if (
		typeof setReplyHandler !== "function" ||
		!sent ||
		!sent.messageID
	) {
		return;
	}

	setReplyHandler(
		async ({
			api,
			message,
			event,
			setReplyHandler: nextSetReplyHandler
		}) => {
			if (
				event.type &&
				event.type !== "message_reply"
			) {
				return;
			}

			try {
				// Ignore bot's own messages
				const selfID =
					api &&
					typeof api.getCurrentUserID === "function"
						? api.getCurrentUserID()
						: null;

				if (
					selfID &&
					String(selfID) === String(event.senderID)
				) {
					return;
				}

				const body =
					typeof event.body === "string"
						? event.body.trim()
						: "";

				if (!body) {
					return message.reply(
						"Say something to bby."
					);
				}

				/*
				 * User replied to previous BBY message
				 */
				const reply = await answer(
					event,
					body
				);

				/*
				 * Send new BBY message
				 */
				const next = await message.reply(reply);

				/*
				 * IMPORTANT:
				 * Attach listener to NEW bot message.
				 */
				armReply(
					nextSetReplyHandler ||
						setReplyHandler,
					next
				);

				return next;
			} catch (error) {
				return message.reply(
					`Error: ${
						error.message || error
					}`
				);
			}
		},
		sent.messageID
	);
}

/*
 * Send message + immediately listen for reply
 */
async function replyAndArm(
	message,
	text,
	setReplyHandler
) {
	const sent = await message.reply(text);

	armReply(
		setReplyHandler,
		sent
	);

	return sent;
}

module.exports = {
	config: {
		name: "bby",

		aliases: [
			"baby",
			"bbe",
			"babe",
			"sam"
		],

		author: "Idle×Saow",

		version: "2.0.0",

		cooldown: 0,

		role: 0,

		noPrefix: true,

		noPrefixRole: 0,

		category: "chat",

		description: {
			en: "Chat with baby"
		},

		usage: {
			en: "{p}bby <message>"
		}
	},

	onStart: async function ({
		message,
		args,
		event,
		setReplyHandler
	}) {
		try {
			/*
			 * Just "Bby"
			 */
			if (!args.length) {
				return replyAndArm(
					message,
					"Bolo baby",
					setReplyHandler
				);
			}

			/*
			 * "Bby hello"
			 */
			const reply = await answer(
				event,
				args.join(" ")
			);

			return replyAndArm(
				message,
				reply,
				setReplyHandler
			);
		} catch (error) {
			return message.reply(
				`Error: ${
					error.message || error
				}`
			);
		}
	}
};
