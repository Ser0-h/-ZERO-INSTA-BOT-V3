"use strict";

/**
 * InstaBOT — a modular Instagram Direct chat bot.
 *
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 * GitHub: https://github.com/lazyneoaz
 * License: MIT
 *
 * Usage:
 *   1. npm install
 *   2. put your Instagram cookies in account.txt
 *   3. npm start
 */

const log = require("./src/logger");
const { loadConfig } = require("./src/config");
const { createBot } = require("./src/bot");

const BANNER = [
	" ___           _        ____   ___ _____",
	"|_ _|_ __  ___| |_ __ _| __ ) / _ \\_   _|",
	" | || '_ \\/ __| __/ _` |  _ \\| | | || |",
	" | || | | \\__ \\ || (_| | |_) | |_| || |",
	"|___|_| |_|___/\\__\\__,_|____/ \\___/ |_|"
];

function printBanner() {
	const version = require("./package.json").version;
	const author = "by Saifullah Al Neoaz — https://github.com/lazyneoaz";
	log.plain("");
	for (const line of BANNER) log.plain(log.paint("magenta", line));
	log.plain(log.paint("dim", ` ${author}  ·  v${version}`));
	log.plain("");
}

async function main() {
	printBanner();

	let config;
	try {
		config = loadConfig();
	}
	catch (error) {
		log.error("CONFIG", error.message);
		process.exit(1);
	}

	const bot = createBot(config);

	const shutdown = async (signal) => {
		log.warn("SYSTEM", `Received ${signal}; shutting down…`);
		await bot.stop();
		process.exit(0);
	};
	process.once("SIGINT", () => shutdown("SIGINT"));
	process.once("SIGTERM", () => shutdown("SIGTERM"));

	process.on("unhandledRejection", (reason) => log.error("PROCESS", "Unhandled promise rejection", reason));
	process.on("uncaughtException", (error) => log.error("PROCESS", "Uncaught exception", error));

	try {
		await bot.start();
	}
	catch (error) {
		log.error("BOOT", "Failed to start", error);
		process.exit(1);
	}
}

main();
