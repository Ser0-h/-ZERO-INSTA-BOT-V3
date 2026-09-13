"use strict";

/**
 * sing — search Instagram's music catalogue and attach a track as a music sticker.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

function formatDuration(ms) {
	if (!ms || ms < 0) return "0:00";
	const total = Math.round(ms / 1000);
	const minutes = Math.floor(total / 60);
	const seconds = String(total % 60).padStart(2, "0");
	return `${minutes}:${seconds}`;
}

/**
 * Search a custom music server when one is configured, otherwise fall back to
 * Instagram's own music catalogue.
 */
async function searchTracks(query, message, config) {
	const music = (config && config.music) || {};
	if (music.enable !== false && music.apiUrl) {
		const url = music.apiUrl.includes("{query}")
			? music.apiUrl.replace("{query}", encodeURIComponent(query))
			: `${music.apiUrl}${music.apiUrl.includes("?") ? "&" : "?"}query=${encodeURIComponent(query)}`;
		const headers = { "Accept": "application/json" };
		if (music.apiToken) headers["Authorization"] = `Bearer ${music.apiToken}`;
		const res = await fetch(url, { headers });
		if (!res.ok) throw new Error(`music server responded ${res.status}`);
		const data = await res.json();
		return normalizeTracks(data);
	}

	const result = await message.musicSearch(query);
	return (result && result.tracks) || [];
}

/** Accept { tracks }, { data }, { results } or a bare array from a music server. */
function normalizeTracks(data) {
	const list = Array.isArray(data) ? data
		: Array.isArray(data && data.tracks) ? data.tracks
			: Array.isArray(data && data.results) ? data.results
				: Array.isArray(data && data.data) ? data.data : [];
	return list.map(entry => ({
		audioAssetID: entry.audioAssetID || entry.audio_asset_id || null,
		audioClusterID: entry.audioClusterID || entry.audio_cluster_id || entry.id || null,
		id: entry.id || entry.audioClusterID || entry.audio_cluster_id || null,
		title: entry.title || entry.name || "Unknown",
		artist: entry.artist || entry.display_artist || "Unknown",
		durationMs: entry.durationMs || entry.duration_ms || entry.duration || 0,
		coverArt: entry.coverArt || entry.cover || entry.thumbnail || null
	})).filter(track => track.audioClusterID || track.audioAssetID);
}

module.exports = {
	config: {
		name: "sing",
		aliases: ["music", "song"],
		author: "Neoaz 🐊",
		category: "media",
		cooldown: 5,
		role: 0,
		description: { en: "Search a song and send it as an Instagram music sticker" },
		usage: { en: "{p}sing <song name or artist> | {p}sing <number> to pick from the last search" }
	},

	onStart: async function ({ message, args, event, config, usersData, setReplyHandler }) {
		const query = args.join(" ").trim();
		if (!query)
			return message.reply(`Usage: sing <song name>\nExample: sing blinding lights`);

		// A bare number re-uses the previous search results for this user.
		const last = usersData.get(event.senderID) || {};
		const cached = last.data && last.data.lastMusic;

		if (/^\d+$/.test(query) && cached && Array.isArray(cached.tracks) && cached.tracks.length) {
			const index = Number(query) - 1;
			const track = cached.tracks[index];
			if (!track)
				return message.reply(`Pick a number between 1 and ${cached.tracks.length}.`);
			return sendTrack(message, track);
		}

		let tracks;
		try {
			tracks = await searchTracks(query, message, config);
		}
		catch (error) {
			return message.reply(`Music search failed: ${String(error.message || error)}`);
		}

		if (!tracks.length)
			return message.reply(`No songs found for "${query}".`);

		const top = tracks.slice(0, 10);
		usersData.update(event.senderID, { data: Object.assign({}, last.data, { lastMusic: { query, tracks: top } }) });

		if (top.length === 1 || args.includes("--top"))
			return sendTrack(message, top[0]);

		const lines = top.map((track, index) =>
			`${index + 1}. ${track.title || "Unknown"} — ${track.artist || "Unknown"} (${formatDuration(track.durationMs)})`
		);
		const sent = await message.reply(
			`Results for "${query}"\n${lines.join("\n")}\n\nReply with sing <number> to send one.`
		);

		if (typeof setReplyHandler === "function") {
			// Arm the picker against the results message the user will reply to.
			setReplyHandler(async ({ message: replyMessage, event: replyEvent }) => {
				const pick = String(replyEvent.body || "").trim().split(/\s+/).pop();
				if (!/^\d+$/.test(pick)) return;
				const chosen = top[Number(pick) - 1];
				if (!chosen) return replyMessage.reply(`Pick a number between 1 and ${top.length}.`);
				await sendTrack(replyMessage, chosen);
			}, sent && sent.messageID);
		}
		return sent;
	}
};

async function sendTrack(message, track) {
	if (!track) return message.reply("That track is no longer available. Search again.");
	try {
		await message.music(track);
	}
	catch (error) {
		return message.reply(`Could not send "${track.title || "the track"}": ${String(error.message || error)}`);
	}
}
