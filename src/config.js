"use strict";

/**
 * Configuration + Instagram cookie loading.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const configPath = path.join(ROOT, "config.json");
const accountPath = path.join(ROOT, "account.txt");

function readJSON(file) {
	const raw = fs.readFileSync(file, "utf8");
	try {
		return JSON.parse(raw);
	}
	catch (error) {
		throw new Error(`Invalid JSON in ${path.basename(file)}: ${error.message}`);
	}
}

function loadConfig() {
	if (!fs.existsSync(configPath))
		throw new Error("config.json not found");
	const config = readJSON(configPath);

	config.botName = config.botName || "InstaBOT";
	config.prefix = typeof config.prefix === "string" ? config.prefix : "-";
	config.language = config.language || "en";
	config.adminBot = Array.isArray(config.adminBot) ? config.adminBot.map(String).filter(Boolean) : [];
	config.whiteList = config.whiteList || { enable: false, userIDs: [], threadIDs: [] };
	config.whiteList.userIDs = (config.whiteList.userIDs || []).map(String);
	config.whiteList.threadIDs = (config.whiteList.threadIDs || []).map(String);
	config.onlineStatus = config.onlineStatus || {};
	config.database = config.database || {};
	config.database.dir = config.database.dir || "data";

	// These are read unconditionally by the dispatcher, so guarantee their shape
	// even when an operator trims them out of config.json.
	config.hideNotiMessage = config.hideNotiMessage || {};
	config.adminOnly = config.adminOnly || {};
	config.adminOnly.enable = config.adminOnly.enable === true;
	config.adminOnly.ignoreCommands = Array.isArray(config.adminOnly.ignoreCommands)
		? config.adminOnly.ignoreCommands.map(String)
		: [];
	config.cooldown = config.cooldown || {};
	config.cooldown.default = Number(config.cooldown.default) || 0;
	config.logEvents = config.logEvents || {};
	config.antiInbox = config.antiInbox === true;
	config.noPrefix = config.noPrefix === true;

	// Optional secrets/endpoints: config.json wins, then environment variables.
	config.env = config.env || {};
	config.env.token = config.env.token || process.env.INSTABOT_TOKEN || process.env.TOKEN || "";
	config.env.url = config.env.url || process.env.INSTABOT_URL || process.env.URL || "";

	config.music = config.music || {};
	config.music.enable = config.music.enable !== false;
	config.music.apiUrl = config.music.apiUrl || config.env.url || "";
	config.music.apiToken = config.music.apiToken || config.env.token || "";

	// Private ig-chat-api server: config.json wins, then environment variables.
	config.server = config.server || {};
	config.server.url = config.server.url || process.env.IG_API_SERVER || "";
	config.server.token = config.server.token || process.env.IG_API_TOKEN || "";
	config.server.timeout = Number(config.server.timeout) || 60000;

	// Welcome / leave announcements for group threads.
	config.welcome = config.welcome || {};
	if (config.welcome.enable == null) config.welcome.enable = true;
	if (!config.welcome.message) config.welcome.message = "Welcome %1 to %2! 👋";
	if (!Array.isArray(config.welcome.threadIDs)) config.welcome.threadIDs = [];

	config.leave = config.leave || {};
	if (config.leave.enable == null) config.leave.enable = true;
	if (!config.leave.message) config.leave.message = "%1 left %2. 👋";
	if (!Array.isArray(config.leave.threadIDs)) config.leave.threadIDs = [];

	return config;
}

function saveConfig(config) {
	fs.writeFileSync(configPath, JSON.stringify(config, null, "\t") + "\n");
}

function isNetScapeCookie(text) {
	return /(.+)\t(1|TRUE|true)\t([\w/.-]*)\t(1|TRUE|true)\t\d+\t([\w-]+)\t(.+)/i.test(text);
}

function netScapeToCookies(text) {
	const cookies = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const fields = line.replace(/^#HttpOnly_/, "").split("\t").map(f => f.trim()).filter(Boolean);
		if (fields.length < 7) continue;
		cookies.push({
			key: fields[5],
			value: fields[6],
			domain: fields[0].replace(/^\./, ""),
			path: fields[2] || "/"
		});
	}
	return cookies;
}

function cookieHeaderToCookies(text) {
	return String(text)
		.replace(/^cookie\s*:/i, "")
		.replace(/\r?\n/g, " ")
		.split(";")
		.map(part => part.trim())
		.filter(Boolean)
		.map(part => {
			const index = part.indexOf("=");
			if (index < 1) return null;
			return {
				key: part.slice(0, index).trim(),
				value: part.slice(index + 1).trim(),
				domain: "instagram.com",
				path: "/"
			};
		})
		.filter(Boolean);
}

function normalizeCookies(list) {
	return (Array.isArray(list) ? list : [])
		.map(item => {
			if (!item || typeof item !== "object") return null;
			const key = item.key || item.name;
			return key ? { key, value: item.value, domain: item.domain || "instagram.com", path: item.path || "/" } : null;
		})
		.filter(item => item && item.key && item.value !== undefined);
}

/**
 * Parse account.txt into an Instagram cookie list.
 * Accepts: JSON array, JSON object, cookie header string, Netscape file.
 */
function loadAccount() {
	if (!fs.existsSync(accountPath))
		throw new Error("account.txt not found. Add your Instagram cookies to it.");
	const text = fs.readFileSync(accountPath, "utf8").trim();
	if (!text) throw new Error("account.txt is empty");

	let cookies = [];

	if (text.startsWith("[") || text.startsWith("{")) {
		let parsed;
		try {
			parsed = JSON.parse(text);
		}
		catch (error) {
			throw new Error(`account.txt is invalid JSON: ${error.message}`);
		}
		if (!Array.isArray(parsed)) {
			const obj = parsed.cookies || parsed.appState || parsed;
			parsed = Array.isArray(obj) ? obj : Object.keys(obj).map(key => ({ key, value: obj[key] }));
		}
		cookies = normalizeCookies(parsed);
	}
	else if (isNetScapeCookie(text)) {
		cookies = netScapeToCookies(text);
	}
	else {
		cookies = cookieHeaderToCookies(text);
	}

	const has = key => cookies.some(cookie => cookie.key === key);
	if (!has("sessionid") || !(has("ds_user_id") || has("userid")))
		throw new Error("account.txt must contain Instagram `sessionid` and `ds_user_id` cookies");

	return cookies;
}

module.exports = {
	ROOT,
	configPath,
	accountPath,
	loadConfig,
	saveConfig,
	loadAccount,
	normalizeCookies,
	netScapeToCookies,
	cookieHeaderToCookies,
	isNetScapeCookie
};
