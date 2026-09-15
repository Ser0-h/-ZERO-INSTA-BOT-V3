"use strict";

const os = require("os");
const utils = require("../src/utils");

const AVATAR_EFFECTS = ["love", "angry", "laugh", "cry"];

function formatBytes(bytes) {
	if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
	if (bytes === 0) return "0 B";

	const units = ["B", "KB", "MB", "GB", "TB"];
	const index = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1
	);

	return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(seconds) {
	seconds = Math.max(0, Math.floor(seconds));

	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remainingSeconds = seconds % 60;

	return [
		days && `${days}d`,
		hours && `${hours}h`,
		minutes && `${minutes}m`,
		`${remainingSeconds}s`
	]
		.filter(Boolean)
		.join(" ");
}

function randomAvatarEffect() {
	return AVATAR_EFFECTS[
		Math.floor(Math.random() * AVATAR_EFFECTS.length)
	];
}

module.exports = {
	config: {
		name: "uptime",
		aliases: ["up", "upt", "runtime"],
		author: "Idle×Saow",
		category: "INFO",
		cooldown: 2,
		role: 0,
		description: {
			en: "View bot runtime, host, and memory information"
		},
		usage: {
			en: "{p}uptime"
		}
	},

	onStart: async function ({ message, config }) {
		let version = "1.0.0";

		try {
			version = require("../package.json").version;
		}
		catch (_) {}

		const memory = process.memoryUsage();

		const totalMemory = os.totalmem();
		const freeMemory = os.freemem();
		const usedMemory = totalMemory - freeMemory;

		const since = global.instabotStartedAt || Date.now();

		const startedAt = new Date(since)
			.toISOString()
			.replace("T", " ")
			.replace(/\..+$/, " UTC");

		const botName = String(
			(config && config.botName) || "InstaBOT"
		);

		const body = [
			"𝗜𝗱𝗹𝗲×𝗦𝗮𝗼𝘄!",
			"",
			`» 𝗕𝗼𝘁 𝗡𝗮𝗺𝗲 : ${botName}`,
			"",
			"» 𝗥𝘂𝗻𝘁𝗶𝗺𝗲",
			`» 𝗨𝗽𝘁𝗶𝗺𝗲 : ${utils.formatTime(Date.now() - since)}`,
			`» 𝗣𝗿𝗼𝗰𝗲𝘀𝘀 : ${formatDuration(process.uptime())}`,
			`» 𝗦𝘁𝗮𝗿𝘁𝗲𝗱 : ${startedAt}`,
			"",
			"» 𝗛𝗼𝘀𝘁",
			`» 𝗡𝗮𝗺𝗲 : ${os.hostname()}`,
			`» 𝗣𝗹𝗮𝘁𝗳𝗼𝗿𝗺 : ${process.platform}/${process.arch}`,
			`» 𝗖𝗣𝗨 : ${os.cpus().length} cores`,
			"",
			"» 𝗠𝗲𝗺𝗼𝗿𝘆",
			`» 𝗛𝗼𝘀𝘁 𝗨𝘀𝗲𝗱 : ${formatBytes(usedMemory)}`,
			`» 𝗛𝗼𝘀𝘁 𝗙𝗿𝗲𝗲 : ${formatBytes(freeMemory)}`,
			`» 𝗛𝗼𝘀𝘁 𝗧𝗼𝘁𝗮𝗹 : ${formatBytes(totalMemory)}`,
			`» 𝗕𝗼𝘁 𝗥𝗦𝗦 : ${formatBytes(memory.rss)}`,
			`» 𝗕𝗼𝘁 𝗛𝗲𝗮𝗽 : ${formatBytes(memory.heapUsed)} / ${formatBytes(memory.heapTotal)}`,
			"",
			`» 𝗡𝗼𝗱𝗲 : ${process.version}`,
			`» 𝗩𝗲𝗿𝘀𝗶𝗼𝗻 : v${version}`
		].join("\n");

		try {
			return await message.send({
				body,
				avatarEffect: randomAvatarEffect()
			});
		}
		catch (_) {
			return message.send(body);
		}
	}
};
