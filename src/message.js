"use strict";

/**
 * Message context handed to every command.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const utils = require("./utils");

/** Avatar effect name (or numeric style) -> Instagram power_up_data style id. */
const AVATAR_STYLES = { love: 1000, heart: 1000, angry: 1001, mad: 1001, laugh: 1002, lol: 1002, cry: 1003, sad: 1003 };
function avatarStyleOf(effect) {
	if (effect != null && typeof effect === "object") {
		if (effect.style != null) return Number(effect.style);
		effect = effect.name;
	}
	if (effect != null && /^\d+$/.test(String(effect))) return Number(effect);
	return AVATAR_STYLES[String(effect).toLowerCase()] || 1000;
}

/**
 * Build the message helper for an event. It exposes:
 *   message.send(form)          send to the thread
 *   message.reply(form)         reply to the triggering message
 *   message.unsend(id?)         remove a message for everyone
 *   message.react(emoji, id?)   react to a message
 *   message.effect(text, style) animated text effect
 *   message.typing()            typing indicator (returns a stop fn)
 *
 * `form` may be a string, or `{ body, attachment, url, effect, avatarEffect }`.
 * Media attachments are routed to sendImage / sendAudio / sendVideo based on
 * their type, and each media source may be a URL, path, Buffer or stream.
 */
function createMessageContext({ api, event, log, config }) {
	const threadID = event.threadID;
	const eventMessageID = event.messageID;

	function sendPlain(form, replyTarget) {
		const body = typeof form === "string" ? form : (form && form.body != null ? String(form.body) : "");
		const payload = { body };
		if (form && typeof form === "object") {
			if (form.url) payload.url = form.url;
			if (form.effect != null) payload.effect = form.effect;
			if (form.avatarEffect != null) payload.avatarEffect = form.avatarEffect;
		}
		return new Promise((resolve, reject) => {
			api.sendMessage(payload, threadID, (error, result) => error ? reject(error) : resolve(result), replyTarget);
		});
	}

	function sendWithMedia(form, replyTarget) {
		const sources = (Array.isArray(form.attachment) ? form.attachment : [form.attachment]).filter(Boolean);
		if (!sources.length) return sendPlain(form, replyTarget);

		return new Promise((resolve, reject) => {
			let index = 0;
			let firstResult = null;
			const sendNext = () => {
				if (index >= sources.length) return resolve(firstResult);
				const current = index++;
				const raw = sources[current];
				const kind = utils.mediaKind(raw);
				const source = utils.toSource(raw);
				const caption = current === 0 && form.body != null ? String(form.body) : "";
				const done = (error, result) => {
					if (error) return reject(error);
					if (current === 0) firstResult = result;
					sendNext();
				};
				try {
					// Instagram's video_attachment broadcast is media-only: captions
					// are silently dropped. Send the clip, then the caption as its
					// own plain message (the documented way to caption a video).
					if (kind === "video") {
						return api.sendVideo(source, threadID, (error, result) => {
							if (error || !caption) return done(error, result);
							api.sendMessage({ body: caption }, threadID, () => done(null, result), replyTarget);
						});
					}
					if (kind === "audio") {
						// The voice_attachment broadcast is also media-only: send the
						// clip, then its caption as a separate plain message.
						const audioReply = current === 0 ? replyTarget : undefined;
						return api.sendAudio(source, threadID, (error, result) => {
							if (error || !caption) return done(error, result);
							api.sendMessage({ body: caption }, threadID, () => done(null, result), audioReply);
						}, audioReply);
					}
					return api.sendImage(source, threadID, "", (error, result) => {
						if (error || !caption) return done(error, result);
						api.sendMessage({ body: caption }, threadID, () => done(null, result), current === 0 ? replyTarget : undefined);
					}, current === 0 ? replyTarget : undefined);
				}
				catch (error) {
					return reject(error);
				}
			};
			sendNext();
		});
	}

	function dispatch(form, replyTarget) {
		if (form == null) return Promise.reject(new Error("Nothing to send"));
		if (typeof form === "object" && !Array.isArray(form) && form.attachment != null)
			return sendWithMedia(form, replyTarget);
		return sendPlain(form, replyTarget);
	}

	const context = {
		threadID,
		event,

		/** Send to the thread. Accepts an optional node-style callback. */
		send(form, callback) {
			if (typeof callback === "function")
				return dispatch(form, undefined).then(r => callback(null, r), e => callback(e));
			return dispatch(form, undefined);
		},

		/** Reply to the message that triggered this command. */
		reply(form, callback) {
			if (typeof callback === "function")
				return dispatch(form, eventMessageID).then(r => callback(null, r), e => callback(e));
			return dispatch(form, eventMessageID);
		},

		/** Remove a message for everyone (defaults to the triggering message). */
		unsend(messageID = eventMessageID, callback) {
			if (typeof callback === "function")
				return api.unsendMessage(messageID, threadID, callback);
			return new Promise((resolve, reject) => {
				api.unsendMessage(messageID, threadID, (error, result) => error ? reject(error) : resolve(result));
			});
		},

		/** React to a message ("" removes the reaction). */
		react(emoji, messageID = eventMessageID, callback) {
			const reaction = emoji == null ? "" : emoji;
			if (typeof callback === "function")
				return api.setMessageReaction(reaction, messageID, threadID, callback);
			return new Promise((resolve, reject) => {
				api.setMessageReaction(reaction, messageID, threadID, (error, result) => error ? reject(error) : resolve(result));
			});
		},

		/** Animated text effect ("love", "gift", "celebration", "fire"). */
		effect(text, effect, callback) {
			if (typeof callback === "function")
				return api.sendTextEffect(text, threadID, effect, callback);
			return new Promise((resolve, reject) => {
				api.sendTextEffect(text, threadID, effect, (error, result) => error ? reject(error) : resolve(result));
			});
		},

		/** Avatar character text effect ("love", "angry", "laugh", "cry"). */
		avatarEffect(text, effect, callback) {
			// Send the standard avatar power-up request: power_up_data
			// style 1000..1003 plus an avatar sticker id. Instagram scopes the
			// sticker id to the conversation (403 error_code 1545003 in any
			// other thread), so when config.avatarEffects.stickers has an id for
			// this thread the server is asked for that id with the effect's
			// style. Otherwise the effect name is passed and the server uses its
			// built-in id. Report the real error rather than downgrading.
			const sticker = utils.resolveAvatarSticker(config, threadID, effect);
			const target = sticker != null ? { style: avatarStyleOf(effect), attachmentFbid: sticker } : effect;

			const attempt = new Promise((resolve, reject) => {
				api.sendAvatarTextEffect(text, threadID, target, (error, result) => error ? reject(error) : resolve(result));
			});
			if (typeof callback === "function")
				attempt.then(result => callback(null, result), error => callback(error));
			return attempt;
		},

		/** Attach an Instagram music sticker. Accepts a track id or musicSearch result. */
		music(track, callback) {
			if (typeof callback === "function")
				return api.sendMusic(threadID, track, callback);
			return new Promise((resolve, reject) => {
				api.sendMusic(threadID, track, (error, result) => error ? reject(error) : resolve(result));
			});
		},

		/** Search Instagram's music catalogue. */
		musicSearch(query, callback) {
			if (typeof callback === "function")
				return api.musicSearch(query, callback);
			return new Promise((resolve, reject) => {
				api.musicSearch(query, (error, result) => error ? reject(error) : resolve(result));
			});
		},

		/** Show a typing indicator. Returns a stop function. */
		typing() {
			return api.sendTypingIndicator(threadID, () => { });
		}
	};

	return context;
}

module.exports = { createMessageContext };
