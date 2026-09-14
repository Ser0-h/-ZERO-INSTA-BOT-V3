"use strict";
const API_BASE = "https://noobs-api.top/dipto";
const ALIASES = ["baby", "bbe", "babe", "sam"];
const RANDOM_REPLIES = [
	"Bolo baby 😚",
	"Hum 😚",
	"Type bby help for examples",
	"Bolo jaan, ki korte pari tomar jonno?"
];

async function getJson(pathname, params = {}) {
	const url = new URL(`${API_BASE}${pathname}`);
	for (const [key, value] of Object.entries(params)) {
		if (value != null && String(value) !== "") url.searchParams.set(key, String(value));
	}
	const response = await fetch(url, {
		headers: { "Accept": "application/json", "User-Agent": "InstaBOT" }
	});
	if (!response.ok) throw new Error(`baby API responded HTTP ${response.status}`);
	const data = await response.json();
	if (data && data.error) throw new Error(String(data.error));
	return data || {};
}

function responseText(data, fallback = "The baby API returned no reply.") {
	const value = data && (data.reply != null ? data.reply : data.message != null ? data.message : data.data);
	return value == null ? fallback : String(value);
}

function senderName(usersData, senderID) {
	try {
		const user = usersData && usersData.get && usersData.get(senderID);
		return (user && (user.name || user.username)) || "Unknown";
	}
	catch (_) {
		return "Unknown";
	}
}

async function sendAttachmentReply(message, event) {
	const attachment = Array.isArray(event.attachments) && event.attachments[0];
	if (!attachment) return false;
	let endpoint = null;
	if (attachment.type === "sticker") endpoint = "sticker";
	else if (attachment.type === "photo" || attachment.type === "animated_image") endpoint = "picture";
	if (!endpoint) return false;
	const data = await getJson(`/baby/${endpoint}`, { senderID: event.senderID });
	await message.reply(responseText(data));
	return true;
}

async function answer(message, event, text) {
	const data = await getJson("/baby", {
		text,
		senderID: event.senderID,
		threadID: event.threadID,
		font: 1
	});
	return responseText(data);
}

function armReply(setReplyHandler, sent) {
	if (typeof setReplyHandler !== "function" || !sent || !sent.messageID) return;
	setReplyHandler(async ({ message, event }) => {
		if (await sendAttachmentReply(message, event)) return;
		const text = String(event.body || "").trim();
		if (!text) return message.reply("Say something to bby.");
		return message.reply(await answer(message, event, text.toLowerCase()));
	}, sent.messageID);
}

async function replyAndArm(message, event, text, setReplyHandler) {
	const sent = await message.reply(text);
	armReply(setReplyHandler, sent);
	return sent;
}

async function runSpecial(message, event, args, usersData) {
	const raw = args.join(" ").trim();
	const lower = raw.toLowerCase();
	const uid = event.senderID;

	if (lower.startsWith("remove ")) {
		const key = raw.slice("remove ".length).trim();
		if (!key) return "Usage: bby remove <message>";
		return responseText(await getJson("/baby", { remove: key, senderID: uid }));
	}

	if (lower.startsWith("rm ")) {
		const parts = raw.slice(3).split(/\s*-\s*/).map(item => item.trim());
		if (parts.length < 2 || !parts[0] || !parts[1]) return "Usage: bby rm <message> - <index>";
		return responseText(await getJson("/baby", { remove: parts[0], index: parts[1] }));
	}

	if (lower === "list") {
		const data = await getJson("/baby", { list: "all" });
		const total = data && data.length != null ? data.length : data && data.teacher && data.teacher.teacherList
			? data.teacher.teacherList.length : "api off";
		return `❇️ | Total Teach = ${total}\n♻️ | Total Response = ${data.responseLength || "api off"}`;
	}

	if (lower.startsWith("list all")) {
		const parts = raw.split(/\s+/);
		const limit = Math.min(100, Math.max(1, Number(parts[2]) || 100));
		const data = await getJson("/baby", { list: "all" });
		const list = data && data.teacher && Array.isArray(data.teacher.teacherList) ? data.teacher.teacherList : [];
		const teachers = list.slice(0, limit).map((item, index) => {
			const key = Object.keys(item || {})[0];
			return `${index + 1}/ ${key || "Unknown"}: ${key ? item[key] : 0}`;
		});
		return `👑 | List of Teachers of bby\n${teachers.join("\n") || "No teachers found."}`;
	}

	if (lower.startsWith("msg ")) {
		const key = raw.slice(4).trim();
		if (!key) return "Usage: bby msg <message>";
		const data = await getJson("/baby", { list: key });
		return `Message ${key} = ${responseText(data, "Not found")}`;
	}

	if (lower.startsWith("edit ")) {
		const parts = raw.slice(5).split(/\s*-\s*/).map(item => item.trim());
		if (parts.length < 2 || !parts[0] || !parts[1])
			return "❌ Use: bby edit <message> - <new reply>";
		const data = await getJson("/baby", {
			edit: parts[0],
			replace: parts[1],
			senderID: uid
		});
		return responseText(data);
	}

	if (lower === "teach sticker" || lower.startsWith("teach sticker -")) {
		const reply = raw.slice("teach sticker".length).replace(/^\s*-\s*/, "").trim();
		if (!reply) return "❌ Use: bby teach sticker - <reply>";
		const data = await getJson("/baby/sticker", { teach: 1, reply, senderID: uid });
		return `✅ ${responseText(data)}`;
	}

	if (lower === "teach picture" || lower.startsWith("teach picture -")) {
		const reply = raw.slice("teach picture".length).replace(/^\s*-\s*/, "").trim();
		if (!reply) return "❌ Use: bby teach picture - <reply>";
		const data = await getJson("/baby/picture", { teach: 1, reply, senderID: uid });
		return `✅ ${responseText(data)}`;
	}

	if (lower.startsWith("teach react ")) {
		const parts = raw.slice("teach react".length).split(/\s*-\s*/).map(item => item.trim());
		if (parts.length < 2 || !parts[0] || !parts[1]) return "❌ Use: bby teach react <message> - <reaction>";
		const data = await getJson("/baby", { teach: parts[0], react: parts[1] });
		return `✅ ${responseText(data)}`;
	}

	if (lower.startsWith("teach amar ")) {
		const parts = raw.slice("teach amar".length).split(/\s*-\s*/).map(item => item.trim());
		if (parts.length < 2 || !parts[0] || !parts[1]) return "❌ Use: bby teach amar <message> - <reply>";
		const data = await getJson("/baby", { teach: parts[0], reply: parts[1], key: "intro" });
		return `✅ ${responseText(data)}`;
	}

	if (lower.startsWith("teach ")) {
		const parts = raw.slice(6).split(/\s*-\s*/).map(item => item.trim());
		if (parts.length < 2 || !parts[0] || !parts[1]) return "❌ Use: bby teach <message> - <reply>";
		const data = await getJson("/baby", {
			teach: parts[0],
			reply: parts[1],
			senderID: uid,
			threadID: event.threadID
		});
		return `✅ Replies added ${responseText(data)}\nTeacher: ${senderName(usersData, uid)}\nTeachs: ${data.teachs || "—"}`;
	}

	if (["amar name ki", "amr nam ki", "amar nam ki", "amr name ki", "whats my name"].includes(lower)) {
		return responseText(await getJson("/baby", { text: "amar name ki", senderID: uid, key: "intro" }));
	}

	return null;
}

module.exports = {
	config: {
		name: "bby",
		aliases: ALIASES,
		author: "DiPTO",
		cooldown: 0,
		role: 0,
		noPrefix: true,
		noPrefixRole: 0,
		category: "chat",
		description: { en: "Chat with bby and teach custom replies" },
		usage: { en: "{p}bby <message> | {p}bby teach <message> - <reply> | {p}bby list" }
	},

	onStart: async function ({ message, args, event, usersData, setReplyHandler }) {
		if (!args.length) {
			if (await sendAttachmentReply(message, event)) return;
			return replyAndArm(message, event, RANDOM_REPLIES[Math.floor(Math.random() * RANDOM_REPLIES.length)], setReplyHandler);
		}

		const special = await runSpecial(message, event, args, usersData);
		if (special != null) return message.reply(special);
		return replyAndArm(message, event, await answer(message, event, args.join(" ").toLowerCase()), setReplyHandler);
	}
};
