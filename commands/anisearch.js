"use strict";

/**
 * anisearch — find a random TikTok anime edit for a query and send it.
 * Author: Neoaz 🐊
 */

const API_BASE = "https://alldl.neokex.xyz/api";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MAX_BYTES = 64 * 1024 * 1024;

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

/** Pick a random video URL from a tik-sr search response. */
async function randomMatch(query) {
	const payload = await requestJSON(`${API_BASE}/tik-sr?q=${encodeURIComponent(query)}`);
	const results = (payload && (payload.results || (payload.data && payload.data.results))) || [];
	const videos = results.map(item => item && item.url).filter(Boolean);
	if (!videos.length) throw new Error("No matching anime videos were found.");
	return videos[Math.floor(Math.random() * videos.length)];
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

/** Send a video, falling back to plain text if the host is too large or unreadable. */
async function sendVideo(message, video) {
	const caption = String(video.title || "Here is your video.").slice(0, 200);
	const head = await fetch(video.url, { method: "HEAD", headers: headersFor(video.url) }).catch(() => null);
	const size = head && head.ok ? Number(head.headers.get("content-length")) : 0;
	if (size && size > MAX_BYTES)
		throw new Error("The video is too large to send here.");
	// TikTok CDN links carry no file extension, so tell the sender this is an mp4.
	return message.reply({ body: caption, attachment: { url: video.url, fileName: "anisearch.mp4" } });
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
		try {
			const match = await randomMatch(query);
			return await sendVideo(message, await resolveVideo(match));
		}
		catch (error) {
			return message.reply(`Could not find a video: ${String(error.message || error)}`);
		}
	}
};
