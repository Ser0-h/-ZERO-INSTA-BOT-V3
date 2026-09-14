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

	// Optional secrets/endpoints for custom commands.
	//
	// Only the namespaced INSTABOT_* variables are read: hosts like Render set a
	// bare `URL` (the service's own public URL) and `PORT`, and picking those up
	// as an API endpoint silently broke commands (e.g. `sing` hitting the bot's
	// own host and getting a 404).
	config.env = config.env || {};
	config.env.token = config.env.token || process.env.INSTABOT_TOKEN || "";
	config.env.url = config.env.url || process.env.INSTABOT_URL || "";

	// Music: blank apiUrl means "use Instagram's own catalogue". NEVER fall back
	// to env.url — that is not a music server, and a host like Render/Railway
	// that sets URL/INSTABOT_URL for its own service would make `sing` query the
	// bot's own host and get a 404.
	config.music = config.music || {};
	config.music.enable = config.music.enable !== false;
	config.music.apiUrl = config.music.apiUrl || "";
	config.music.apiToken = config.music.apiToken || "";

	// Private ig-chat-api server: config.json wins, then environment variables.
	config.server = config.server || {};
	config.server.url = config.server.url || process.env.IG_API_SERVER || "";
	config.server.token = config.server.token || process.env.IG_API_TOKEN || "";
	// Which account this bot owns on a multi-bot server. The server now keys each
	// session by the Instagram account id, so the bot defaults to its own
	// `ds_user_id` (read straight from account.txt, before any login). An
	// explicit botId in config.json / IG_BOT_ID still wins for operators who
	// filed their session under a different name.
	const explicitBotId = String(config.server.botId || process.env.IG_BOT_ID || "").trim();
	if (explicitBotId) config.server.botId = explicitBotId;
	else {
		let accountId = null;
		try { accountId = accountIdFromAccount(); }
		catch (_) { /* account.txt may be absent at config time; login will complain */ }
		config.server.botId = accountId || "default";
	}
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
		// `#HttpOnly_` lines are real cookies, not comments; only skip the rest.
		if (!line || (line.startsWith("#") && !/^#HttpOnly_/i.test(line))) continue;
		const fields = line.replace(/^#HttpOnly_/i, "").split("\t").map(f => f.trim()).filter(Boolean);
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

/**
 * The Instagram account id this bot signs in as, read from its own cookies
 * (`ds_user_id`). Available before login, which is what lets the bot identify
 * its server session by the account id. Returns null if it is not present.
 */
function accountIdFromAccount() {
	const cookies = loadAccount();
	const found = cookies.find(cookie => cookie.key === "ds_user_id" || cookie.key === "userid");
	const value = found && found.value != null ? String(found.value).trim() : "";
	return value || null;
}

module.exports = {
	ROOT,
	configPath,
	accountPath,
	loadConfig,
	saveConfig,
	loadAccount,
	accountIdFromAccount,
	normalizeCookies,
	netScapeToCookies,
	cookieHeaderToCookies,
	isNetScapeCookie
};
