"use strict";

/**
 * Shared helpers for InstaBOT.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const https = require("https");
const http = require("http");
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

module.exports = {
	getType,
	isStream,
	isBuffer,
	isUrl,
	isNumericID,
	extensionOf,
	extensionFromMime,
	mediaKind,
	toSource,
	download,
	randomString,
	formatTime,
	replaceArgs
};
