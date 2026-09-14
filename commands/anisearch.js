"use strict";

/**
 * anisearch — find a random TikTok anime edit for a query and send it.
 * Author: Neoaz 🐊
 */

const API_BASE = "https://alldl.neokex.xyz/api";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Media travels bot -> server as base64 (+33%), and the server caps the body at
// IG_MAX_BODY_BYTES (8 MB by default). Keep comfortably under that. Override
// with IG_MAX_MEDIA_BYTES if the server is configured for larger uploads.
const MAX_BYTES = Math.max(256 * 1024, Number(process.env.IG_MAX_MEDIA_BYTES) || 5 * 1024 * 1024);

// How many different search results to try when a video is too large to send.
const MAX_ATTEMPTS = 4;

function headersFor(url) {
	const headers = {
		"User-Agent": USER_AGENT,
		"Accept": "*/*",
		"Accept-Language": "en-US,en;q=0.9"
	};
	try {
		if (new URL(url).hostname.includes("tiktok")) headers.Referer = "https://www.tiktok.com/";
	}
	catch (_) { /* not a URL; leave defaults */ }
	return headers;
}

/** Fetch and parse JSON, failing loudly on a non-2xx response. */
async function requestJSON(url, timeout = 45000) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(url, { headers: headersFor(url), signal: controller.signal });
		if (!response.ok) throw new Error(`Media service returned HTTP ${response.status}`);
		return await response.json();
	}
	finally {
		clearTimeout(timer);
	}
}

/** Search TikTok and return every candidate video URL, in random order. */
async function searchVideos(query) {
	const payload = await requestJSON(`${API_BASE}/tik-sr?q=${encodeURIComponent(query)}`);
	const results = (payload && (payload.results || (payload.data && payload.data.results))) || [];
	const videos = results.map(item => item && item.url).filter(Boolean);
	if (!videos.length) throw new Error("No matching anime videos were found.");
	// Shuffle so "random" is genuinely random and a retry tries a new video.
	for (let i = videos.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[videos[i], videos[j]] = [videos[j], videos[i]];
	}
	return videos;
}

/** Resolve a TikTok URL to a direct, watermarked-free mp4 link. */
async function resolveVideo(url) {
	const payload = await requestJSON(`${API_BASE}/alldl?url=${encodeURIComponent(url)}`);
	const data = (payload && (payload.metadata && payload.metadata.data)) || (payload && payload.data) || payload;
	const downloads = (data && data.downloads) || [];
	const notAudio = item => !String(item && item.label).toLowerCase().includes("audio");
	const download =
		downloads.find(item => item && item.url && item.ext === "mp4" && notAudio(item)) ||
		downloads.find(item => item && item.url && notAudio(item));
	if (!data || !data.title || !download)
		throw new Error("The media service did not return a usable video.");
	return { title: data.title, url: download.url, ext: String(download.ext || "mp4").toLowerCase() };
}

/**
 * Download the video on the bot and send the bytes.
 *
 * Passing the URL straight through makes the *server* fetch TikTok. TikTok's
 * CDN frequently refuses a datacenter host (or needs browser headers the
 * library does not send), so the upload fails even though the search worked.
 * Fetching here, where the request can carry a real User-Agent and Referer,
 * is far more reliable; the server just receives bytes it can upload.
 */
async function fetchVideoBuffer(url, timeout = 60000) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(url, { headers: headersFor(url), signal: controller.signal, redirect: "follow" });
		if (!response.ok) throw new Error(`Video download failed (HTTP ${response.status})`);
		const declared = Number(response.headers.get("content-length")) || 0;
		if (declared && declared > MAX_BYTES)
			throw new Error(`The video is ${Math.round(declared / 1048576)} MB, above the send limit.`);
		const buffer = Buffer.from(await response.arrayBuffer());
		if (!buffer.length) throw new Error("The video download was empty.");
		if (buffer.length > MAX_BYTES)
			throw new Error(`The video is ${Math.round(buffer.length / 1048576)} MB, above the send limit.`);
		return buffer;
	}
	finally {
		clearTimeout(timer);
	}
}

/** Send a video, falling back to plain text if the host is too large or unreadable. */
async function sendVideo(message, video) {
	const caption = String(video.title || "Here is your video.").slice(0, 200);
	// TikTok CDN links carry no file extension, so name it explicitly as an mp4.
	const buffer = await fetchVideoBuffer(video.url);
	return message.reply({ body: caption, attachment: { buffer, fileName: "anisearch.mp4" } });
}

/**
 * Error text that is actually useful.
 *
 * The API server wraps failures in an object whose `.error` holds the reason
 * while `.message` is often empty (or just "Error"), so reading `.message`
 * alone loses the cause.
 */
function describeError(error) {
	if (!error) return "Unknown error";
	const parts = [error.message, error.error, error.type]
		.map(value => (value == null ? "" : String(value).trim()))
		.filter(Boolean);
	const unique = [...new Set(parts)];
	return unique.length ? unique.join(" — ") : "Unknown error";
}

module.exports = {
	config: {
		name: "anisearch",
		aliases: ["anivid", "animevid"],
		author: "Neoaz 🐊",
		category: "media",
		cooldown: 5,
		role: 0,
		description: { en: "Find and send a random TikTok anime video for a query" },
		usage: { en: "{p}anisearch <anime or character>" }
	},

	onStart: async function ({ args, message }) {
		const query = args.join(" ").trim();
		if (!query)
			return message.reply("Usage: anisearch <anime or character>\nExample: anisearch naruto");

		let candidates;
		try {
			candidates = await searchVideos(query);
		}
		catch (error) {
			return message.reply(`Could not find a video: ${describeError(error)}`);
		}

		// Try a few results: a video that is too large (or whose CDN link has
		// expired) is common, and another candidate usually works.
		let lastError = null;
		let lastUrl = null;
		let oversize = 0;
		for (const url of candidates.slice(0, MAX_ATTEMPTS)) {
			try {
				const video = await resolveVideo(url);
				lastUrl = video.url;
				await sendVideo(message, video);
				return;
			}
			catch (error) {
				lastError = error;
				if (/above the send limit|too large/i.test(describeError(error))) oversize++;
			}
		}

		const detail = describeError(lastError);
		if (oversize && oversize >= Math.min(MAX_ATTEMPTS, candidates.length)) {
			return message.reply(
				"Every matching video was too large to send. " +
				"Raise the limit with IG_MAX_MEDIA_BYTES (and IG_MAX_BODY_BYTES on the server) to allow bigger files."
			);
		}
		if (lastUrl) {
			// The video was found and downloaded; only the upload failed. Send the
			// link so the result is still useful, and say why the file did not go.
			return message.reply(
				`Found a video but Instagram refused the upload: ${detail}\n${lastUrl}\n` +
				"(If this keeps happening, the account is likely challenged — open Instagram and clear any prompt.)"
			);
		}
		return message.reply(`Could not find a video: ${detail}`);
	}
};
