"use strict";

/**
 * roll — example custom command (see the README "Custom commands & events").
 *
 * Rolls a dice and lets the user reply "pick <n>" to save a favourite number.
 * This file is loaded automatically on boot; you can also live-load it with
 * `-cmd load roll` and reload after edits with `-cmd reload roll`.
 */

module.exports = {
	config: {
		name: "roll",
		aliases: ["dice"],
		author: "you",
		category: "custom",
		cooldown: 3,
		role: 0,
		description: { en: "Roll a dice and remember a favourite number" },
		usage: { en: "{p}roll [sides]" }
	},

	onStart: async function ({ message, args, event, usersData, setReplyHandler }) {
		const sides = Number(args[0]) > 1 ? Math.floor(Number(args[0])) : 6;
		const value = 1 + Math.floor(Math.random() * sides);

		// Ask the user to reply to THIS message, then arm the handler for it.
		const sent = await message.reply(`Rolled a d${sides}: ${value}\nReply "pick <n>" to save a favourite.`);

		setReplyHandler(async ({ event: replyEvent, message: replyMessage }) => {
			const [action, n] = String(replyEvent.body || "").trim().split(/\s+/);
			if (action !== "pick" || !/^\d+$/.test(n)) return;
			const data = (usersData.get(replyEvent.senderID) || {}).data || {};
			usersData.update(replyEvent.senderID, { data: Object.assign({}, data, { favourite: Number(n) }) });
			await replyMessage.reply(`Saved your favourite number: ${n}`);
		}, sent && sent.messageID);
	}
};
