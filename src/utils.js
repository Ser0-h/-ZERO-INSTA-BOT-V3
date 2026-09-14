"use strict";

/**
 * Shared helpers for InstaBOT.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const MIME_EXT = {
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/png": "png",
	"image/gif": "gif",
	"image/webp": "webp",
	"video/mp4": "mp4",
	"video/quicktime": "mov",
	"video/webm": "webm",
	"audio/mpeg": "mp3",
	"audio/mp4": "m4a",
	"audio/aac": "aac",
	"audio/ogg": "ogg",
	"audio/wav": "wav"
};

const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
const VIDEO_EXT = ["mp4", "mov", "mkv", "webm", "avi"];
const AUDIO_EXT = ["mp3", "m4a", "aac", "ogg", "wav", "opus"];

function getType(value) {
	return Object.prototype.toString.call(value).slice(8, -1);
}

function isStream(value) {
	return Boolean(value) && typeof value === "object" && (value._readableState !== undefined || typeof value.pipe === "function");
}

function isBuffer(value) {
	return Buffer.isBuffer(value) || getType(value) === "Uint8Array";
}

function isUrl(value) {
	return typeof value === "string" && /^https?:\/\//i.test(value);
}

function extensionOf(source) {
	if (source == null) return "";
	if (typeof source === "string") {
		const clean = source.split("?")[0].split("#")[0];
		const dot = clean.lastIndexOf(".");
		return dot > -1 ? clean.slice(dot + 1).toLowerCase() : "";
	}
	return extensionOf(source.path || source.fileName || source.name || "");
}

/**
 * Classify a media source as "image", "video" or "audio".
 * Looks at MIME type first, then the file extension, defaulting to image.
 */
function mediaKind(source) {
	if (source == null) return "image";
	if (typeof source === "object") {
		const mime = source.mimetype || source.mimeType || "";
		if (/^video\//i.test(mime)) return "video";
		if (/^audio\//i.test(mime)) return "audio";
		if (/^image\//i.test(mime)) return "image";
	}
	const ext = extensionOf(source);
	if (VIDEO_EXT.includes(ext)) return "video";
	if (AUDIO_EXT.includes(ext)) return "audio";
	if (IMAGE_EXT.includes(ext)) return "image";
	return "image";
}

/**
 * Turn any supported source (URL/path/Buffer/stream/{url|path|buffer|stream})
 * into a value ig-chat-api's media senders accept directly.
 */
function toSource(value) {
	if (value == null) return value;
	if (isUrl(value) || typeof value === "string" || isBuffer(value) || isStream(value)) return value;
	if (typeof value === "object") {
		if (value.url) return value.url;
		if (value.path) return value.path;
		if (value.buffer) return value.buffer;
		if (value.stream) return value.stream;
	}
	return value;
}

function download(url, options = {}) {
	return new Promise((resolve, reject) => {
		const client = url.startsWith("https:") ? https : http;
		const request = client.get(url, { headers: options.headers || {} }, response => {
			if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
				response.resume();
				return resolve(download(new URL(response.headers.location, url).toString(), options));
			}
			if (response.statusCode < 200 || response.statusCode >= 300) {
				response.resume();
				return reject(new Error(`Download failed with HTTP ${response.statusCode}`));
			}
			const chunks = [];
			response.on("data", chunk => chunks.push(chunk));
			response.on("end", () => resolve(Buffer.concat(chunks)));
			response.on("error", reject);
		});
		request.on("error", reject);
		request.setTimeout(options.timeout || 60000, () => request.destroy(new Error("Download timed out")));
	});
}

function extensionFromMime(mime) {
	if (!mime) return "bin";
	return MIME_EXT[String(mime).split(";")[0].trim().toLowerCase()] || "bin";
}

function randomString(length = 10, allow = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") {
	let out = "";
	for (let i = 0; i < length; i++)
		out += allow[Math.floor(Math.random() * allow.length)];
	return out;
}

function formatTime(milliseconds) {
	if (!milliseconds || milliseconds < 0) milliseconds = 0;
	const seconds = Math.floor(milliseconds / 1000);
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	const parts = [];
	if (days) parts.push(`${days}d`);
	if (hours || days) parts.push(`${hours}h`);
	if (minutes || hours || days) parts.push(`${minutes}m`);
	parts.push(`${secs}s`);
	return parts.join(" ");
}

function replaceArgs(template, ...args) {
	let text = String(template == null ? "" : template);
	args.forEach((value, index) => {
		text = text.split(`%${index + 1}`).join(value == null ? "" : String(value));
	});
	return text;
}

function isNumericID(value) {
	return value != null && String(value).length > 0 && !Number.isNaN(Number(value));
}

/**
 * Avatar effects send `power_up_data={style:1000..1003}` together with an
 * avatar sticker id as `attachment_fbid`. Instagram scopes that sticker id to
 * the conversation: the same id is accepted in the thread it belongs to and
 * refused (403 error_code 1545003) in any other, whichever effect is used, and
 * whichever style it is paired with. There is no universal id — the app reads
 * the thread's id from its own state and Instagram has no public endpoint that
 * returns it, so a thread's id has to be learned from one captured send in that
 * thread.
 *
 * `config.avatarEffects.stickers` therefore maps a thread id to its sticker id.
 * One id per thread covers all four effects. A "*" entry is used as a fallback
 * for threads with no specific entry.
 *
 * Shape:
 *   "avatarEffects": {
 *     "stickers": {
 *       "340282366841710301281153722859304413646": "1008287245559346",
 *       "*": "2601937316988106"
 *     }
 *   }
 *
 * Returns the sticker id string for the thread, or null to use the built-in
 * default. `effect` is accepted for call compatibility but does not change the
 * result: the id is per thread, not per effect.
 */
function resolveAvatarSticker(config, threadID, effect) { // eslint-disable-line no-unused-vars
	const table = config && config.avatarEffects && config.avatarEffects.stickers;
	if (!table || typeof table !== "object") return null;

	const pick = (entry) => {
		if (entry == null) return null;
		if (typeof entry === "object") {
			return entry.stickerId != null ? String(entry.stickerId)
				: (entry.attachmentFbid != null ? String(entry.attachmentFbid) : null);
		}
		return String(entry);
	};

	return pick(table[String(threadID)]) || pick(table["*"]);
}

/**
 * Pull an Instagram username out of user input: a profile URL
 * (https://www.instagram.com/name?…, /name/, /name), an @handle, or a bare
 * handle. Returns the bare username, or null when the input is not a handle.
 */
function instagramUsername(input) {
	if (input == null) return null;
	let value = String(input).trim();
	if (!value) return null;

	if (/^https?:\/\//i.test(value) || /^(www\.)?instagram\.com\//i.test(value)) {
		let url = value;
		if (!/^https?:\/\//i.test(url)) url = "https://" + url;
		try {
			const parsed = new URL(url);
			if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null;
			const segment = parsed.pathname.split("/").filter(Boolean)[0] || "";
			const reserved = ["p", "reel", "reels", "stories", "explore", "tv", "accounts", "direct"];
			if (!segment || reserved.includes(segment.toLowerCase())) return null;
			return segment.replace(/^@/, "");
		}
		catch (_) {
			return null;
		}
	}

	if (/^@[A-Za-z0-9._]{1,30}$/.test(value)) return value.slice(1);

	return null;
}

/**
 * Fetch a public Instagram profile (username or profile URL) via
 * web_profile_info. Returns a normalized profile, or null.
 *
 * The endpoint is unauthenticated and gets rate limited ("Please wait a few
 * minutes before you try again", HTTP 401) under bursts, so successful
 * username -> id lookups are cached on disk and reused.
 */
const USERNAME_CACHE_FILE = path.join(__dirname, "..", "data", "username-cache.json");
let usernameCache = null;

function loadUsernameCache() {
	if (usernameCache) return usernameCache;
	try {
		usernameCache = JSON.parse(fs.readFileSync(USERNAME_CACHE_FILE, "utf8")) || {};
	}
	catch (_) {
		usernameCache = {};
	}
	return usernameCache;
}

function saveUsernameCache() {
	try {
		fs.mkdirSync(path.dirname(USERNAME_CACHE_FILE), { recursive: true });
		fs.writeFileSync(USERNAME_CACHE_FILE, JSON.stringify(usernameCache));
	}
	catch (_) { }
}

async function fetchInstagramProfile(username, timeout = 15000) {
	const handle = instagramUsername(username) || (username ? String(username).replace(/^@/, "") : null);
	if (!handle) return null;

	const cache = loadUsernameCache();
	const cached = cache[handle.toLowerCase()];
	if (cached && cached.userID) return Object.assign({}, cached);

	const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`;
	const headers = {
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
		"Accept": "application/json, text/plain, */*",
		"X-IG-App-ID": "936619743392459"
	};
	let buffer;
	try {
		buffer = await module.exports.download(url, { headers, timeout });
	}
	catch (_) {
		return null;
	}
	try {
		const data = JSON.parse(buffer.toString("utf8"));
		const user = data && data.data && data.data.user;
		if (!user) return null;
		const profile = {
			userID: user.id != null ? String(user.id) : null,
			username: user.username || handle,
			name: user.full_name || user.username || null,
			biography: user.biography || "",
			followers: user.edge_followed_by ? user.edge_followed_by.count : undefined,
			following: user.edge_follow ? user.edge_follow.count : undefined,
			posts: user.edge_owner_to_timeline_media ? user.edge_owner_to_timeline_media.count : undefined,
			isPrivate: !!user.is_private,
			isVerified: !!user.is_verified,
			profilePicture: user.profile_pic_url_hd || user.profile_pic_url || null
		};
		if (profile.userID) {
			cache[handle.toLowerCase()] = profile;
			saveUsernameCache();
		}
		return profile;
	}
	catch (_) {
		return null;
	}
}

/**
 * Resolve a username to an Instagram numeric user id via the public web
 * profile endpoint. This needs no login and works even though the underlying
 * ig-chat-api `getUserInfo` only accepts numeric ids.
 */
async function resolveInstagramUserID(username, timeout = 15000) {
	const profile = await fetchInstagramProfile(username, timeout);
	return profile ? profile.userID : null;
}

/**
 * Resolve a target user id from command arguments, in order: a reply, an
 * explicit numeric id, then a username — given as an @handle, a bare handle,
 * or an Instagram profile URL. Instagram events do not carry a parsed
 * mentions list, so a mention arrives as the literal "@handle" text.
 *
 * Returns `{ id }` on success, else `{ id: null, username? }` where username
 * is set when a handle was given but could not be found.
 */
async function resolveUserTarget(args, event, api) {
	if (event && event.messageReply && event.messageReply.senderID)
		return { id: String(event.messageReply.senderID), source: "reply" };

	const numeric = (args || []).find(arg => /^\d+$/.test(arg));
	if (numeric) return { id: String(numeric), source: "id" };

	const raw = (args || []).find(arg => /^@?[A-Za-z0-9._]{1,30}$/.test(arg) || /instagram\.com\//i.test(arg));
	const username = instagramUsername(raw) || (raw && /^@?[A-Za-z0-9._]{1,30}$/.test(raw) ? raw.replace(/^@/, "") : null);
	if (username) {
		// Prefer the authenticated session (uses the server's cookies, so it is
		// not rate limited the way the anonymous endpoint is). Fall back to the
		// public endpoint for servers that cannot resolve usernames.
		if (api) {
			try {
				const info = await new Promise((resolve, reject) =>
					api.getUserInfo(username, (error, result) => error ? reject(error) : resolve(result)));
				const profile = info && Object.values(info)[0];
				if (profile && profile.userID) return { id: String(profile.userID), source: "mention" };
			}
			catch (_) { }
		}
		const id = await resolveInstagramUserID(username);
		if (id) return { id, source: "mention" };
		return { id: null, username };
	}

	return { id: null };
}

/**
 * Resolve a full profile from command arguments: a reply to a user, a numeric
 * user id, or a username / @handle / profile URL. Returns a normalized profile
 * (`{ userID, username, name, biography, followers, following, posts,
 * isPrivate, isVerified, profilePicture }`), or null when nothing is found.
 */
async function resolveProfile(args, event, api) {
	const target = await resolveUserTarget(args, event, api);
	if (!target.id) return null;

	// The authenticated session is the reliable source of truth for a numeric
	// id (and is not rate limited like the public endpoint).
	if (api) {
		try {
			const info = await new Promise((resolve, reject) =>
				api.getUserInfo(String(target.id), (error, result) => error ? reject(error) : resolve(result)));
			const profile = info && Object.values(info)[0];
			if (profile) {
				return {
					userID: String(profile.userID || target.id),
					username: profile.vanity || null,
					name: profile.name || profile.firstName || null,
					biography: profile.biography || "",
					followers: profile.followerCount,
					following: profile.followingCount,
					posts: undefined,
					isPrivate: profile.isPrivate,
					isVerified: profile.isVerified,
					profilePicture: profile.profilePicture || profile.thumbSrc || null
				};
			}
		}
		catch (_) { }
	}

	// Fall back to the public profile (also covers handle-only lookups).
	const raw = (args || []).find(arg => instagramUsername(arg) || /^@?[A-Za-z0-9._]{1,30}$/.test(arg) && !/^\d+$/.test(arg));
	const username = raw ? (instagramUsername(raw) || raw.replace(/^@/, "")) : null;
	if (target.source === "mention" && username) {
		const profile = await fetchInstagramProfile(username);
		if (profile) return profile;
	}

	return { userID: String(target.id) };
}

module.exports = {
	getType,
	isStream,
	isBuffer,
	isUrl,
	isNumericID,
	resolveAvatarSticker,
	extensionOf,
	extensionFromMime,
	mediaKind,
	toSource,
	download,
	randomString,
	formatTime,
	replaceArgs,
	instagramUsername,
	fetchInstagramProfile,
	resolveInstagramUserID,
	resolveUserTarget,
	resolveProfile,
	_resetUsernameCache() {
		usernameCache = {};
		try { fs.rmSync(USERNAME_CACHE_FILE, { force: true }); }
		catch (_) { }
	}
};
