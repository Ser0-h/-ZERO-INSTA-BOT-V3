"use strict";

/**
 * ============================================================
 * bby.js — Instagram Direct non-prefix AI chatbot
 * Author : Idle×Saow
 *
 * Repo-compatible with:
 * lazyneoaz/Insta-Bot
 *
 * Uses native setReplyHandler() for reply-chain.
 * ============================================================
 */


/* ============================ CONFIG ============================ */

const DEBUG = true;

const BASE_API_URL =
	"https://raw.githubusercontent.com/mahmud-aura/HINATA/main/baseApiUrl.json";

const BBY_TIMEOUT_MS = 20000;

const BBY_FALLBACK_MESSAGE =
	"bby is a little busy right now. try again in a bit 🥺";

const BBY_TRIGGER = "bby";


/*
 * Reply handler-এর নিজের TTL dispatcher-এ 30 min।
 * তাই এখানে আলাদা session timer দরকার নেই।
 */


/* ============================ DEBUG ============================ */

function log(...args) {
	if (DEBUG) {
		console.log("[bby]", ...args);
	}
}


/* ============================ TIMEOUT ============================ */

function makeTimeoutSignal() {
	const controller = new AbortController();

	const timer = setTimeout(() => {
		controller.abort();
	}, BBY_TIMEOUT_MS);

	timer.unref?.();

	return controller.signal;
}


/* ======================= MESSAGE ID ============================== */

function messageIDOf(sent) {
	if (!sent) return null;

	if (typeof sent === "string") {
		return sent;
	}

	if (sent.messageID) {
		return sent.messageID;
	}

	if (sent.messageId) {
		return sent.messageId;
	}

	if (sent.id) {
		return sent.id;
	}

	if (sent.message?.messageID) {
		return sent.message.messageID;
	}

	if (sent.message?.messageId) {
		return sent.message.messageId;
	}

	if (Array.isArray(sent)) {
		if (sent[0]) {
			return (
				sent[0].messageID ??
				sent[0].messageId ??
				sent[0].id ??
				null
			);
		}
	}

	return null;
}


/* ========================== BBY API =============================== */

async function babyAPI(text, attachments = []) {

	/* -------- Get base API -------- */

	const baseRes = await fetch(
		BASE_API_URL,
		{
			signal: makeTimeoutSignal()
		}
	);

	if (!baseRes.ok) {
		throw new Error(
			`base URL HTTP ${baseRes.status}`
		);
	}

	const baseData = await baseRes.json();

	if (
		!baseData ||
		!baseData.mahmud
	) {
		throw new Error(
			"Invalid base API response"
		);
	}


	/* -------- BBY API -------- */

	const url =
		`${baseData.mahmud}/api/baby` +
		`?text=${encodeURIComponent(text)}` +
		`&font=3`;


	const res = await fetch(
		url,
		{
			method: "POST",

			headers: {
				"Content-Type": "application/json"
			},

			body: JSON.stringify({
				attachments
			}),

			signal: makeTimeoutSignal()
		}
	);


	if (!res.ok) {
		throw new Error(
			`baby API HTTP ${res.status}`
		);
	}


	const data = await res.json();


	if (
		!data ||
		typeof data.reply !== "string" ||
		!data.reply.trim()
	) {
		throw new Error(
			"baby API returned empty reply"
		);
	}


	return data.reply.trim();
}


/* ======================= SEND + ARM REPLY ========================= */

/*
 * এটা সবচেয়ে গুরুত্বপূর্ণ function।
 *
 * Bot message পাঠানোর পরে সেই message-এর ID নিয়ে
 * setReplyHandler() দিয়ে আবার নতুন handler arm করা হয়।
 *
 * ফলে:
 *
 * User -> Bby
 * Bot -> Reply #1
 *
 * User -> reply to #1
 * Bot -> Reply #2
 *
 * User -> reply to #2
 * Bot -> Reply #3
 *
 * এভাবেই চলতে থাকবে।
 */

async function sendAndArm({
	message,
	userText,
	setReplyHandler
}) {

	let output;


	/* ---------------- API ---------------- */

	try {

		output = await babyAPI(
			userText
		);

		log(
			"API reply:",
			output
		);

	} catch (error) {

		log(
			"API ERROR:",
			error?.message || error
		);

		output =
			BBY_FALLBACK_MESSAGE;
	}


	/* ---------------- SEND ---------------- */

	let sent;

	try {

		sent = await message.reply(
			output
		);

	} catch (error) {

		log(
			"SEND ERROR:",
			error?.message || error
		);

		return;
	}


	/* ---------------- MESSAGE ID ---------------- */

	const botMessageID =
		messageIDOf(sent);


	log(
		"bot message ID:",
		botMessageID
	);


	/*
	 * Bot message ID পাওয়া গেলে
	 * ওই message-এর reply-এর জন্য
	 * নতুন handler register করব।
	 */

	if (
		botMessageID &&
		typeof setReplyHandler ===
			"function"
	) {

		setReplyHandler(
			async function ({
				message: replyMessage,
				event: replyEvent,
				setReplyHandler: nextSetReplyHandler
			}) {

				const text =
					typeof replyEvent.body ===
					"string"
						? replyEvent.body.trim()
						: "";


				if (!text) {
					return;
				}


				log(
					"conversation reply:",
					text
				);


				/*
				 * নতুন reply-এর উত্তর পাঠাও।
				 *
				 * এবং নতুন bot message-এর জন্য
				 * আবার handler arm হবে।
				 */

				return sendAndArm({
					message: replyMessage,

					userText: text,

					setReplyHandler:
						nextSetReplyHandler
				});
			},

			botMessageID
		);


		log(
			"reply handler armed:",
			botMessageID
		);
	}


	return sent;
}


/* ============================ START =============================== */

async function onStart({
	message,
	args,
	event,
	setReplyHandler
}) {

	const text =
		args.join(" ").trim();


	/*
	 * Empty হলে কিছু করবে না।
	 */
	if (!text) {
		return;
	}


	log(
		"onStart:",
		text,
		"| sender:",
		event?.senderID,
		"| thread:",
		event?.threadID
	);


	/*
	 * এখানে প্রথম message-এর জন্য
	 * API call হবে।
	 *
	 * এরপর sendAndArm() bot-এর reply ID ধরে
	 * reply-chain শুরু করবে।
	 */

	return sendAndArm({
		message,

		userText: text,

		setReplyHandler
	});
}


/* ============================ EXPORT ============================== */

module.exports = {

	config: {

		name: "bby",

		author: "Idle×Saow",

		version: "1.0.8",

		description:
			"Non-prefix BBY AI chatbot with continuous reply conversation",

		category: "ai",

		/*
		 * Prefix ছাড়া "Bby ..." চালু।
		 */
		noPrefix: true,

		/*
		 * Normal users-কেও prefix ছাড়া
		 * command ব্যবহার করতে দেবে।
		 */
		noPrefixRole: 0,

		/*
		 * User command.
		 */
		role: 0,

		cooldown: 3
	},


	onStart
};
