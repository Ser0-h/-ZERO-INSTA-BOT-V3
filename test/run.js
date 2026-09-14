"use strict";

/**
 * InstaBOT test runner — no external dependencies.
 * Exercises config parsing, event normalization, the message context and the
 * dispatcher against a fake ig-chat-api client.
 *
 *   node test/run.js
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");
const log = require(path.join(root, "src/logger"));
log.setQuiet(true);

const { normalizeEvent } = require(path.join(root, "src/bot"));
const { normalizeCookies, netScapeToCookies, cookieHeaderToCookies, isNetScapeCookie } = require(path.join(root, "src/config"));
const utils = require(path.join(root, "src/utils"));
const { createMessageContext } = require(path.join(root, "src/message"));
const { createRegistry, loadAll } = require(path.join(root, "src/commandLoader"));
const { createDispatcher } = require(path.join(root, "src/dispatcher"));

let count = 0;
const results = [];
async function test(name, fn) {
	try {
		await fn();
		count++;
		results.push({ name, ok: true });
	}
	catch (error) {
		results.push({ name, ok: false, error });
	}
}

function fakeApi(overrides = {}) {
	const calls = [];
	const api = Object.assign({
		calls,
		getCurrentUserID: () => "100",
		getUserInfo: (id, cb) => cb(null, { [id]: { userID: id, name: "Test User", vanity: "tester" } }),
		getThreadInfo: (id, cb) => cb(null, { threadID: id, isGroup: true, userInfo: [], adminIDs: [] }),
		sendMessage: (form, threadID, cb, reply) => {
			calls.push({ method: "sendMessage", form, threadID, reply });
			cb && cb(null, { threadID, messageID: "m" + calls.length });
			return Promise.resolve({ threadID, messageID: "m" + calls.length });
		},
		sendImage: (img, threadID, caption, cb, reply) => {
			calls.push({ method: "sendImage", caption, reply, threadID });
			cb && cb(null, { threadID, messageID: "img" + calls.length });
		},
		sendAudio: (a, threadID, cb) => { calls.push({ method: "sendAudio", threadID }); cb && cb(null, {}); },
		sendVideo: (v, threadID, cb) => { calls.push({ method: "sendVideo", threadID }); cb && cb(null, {}); },
		unsendMessage: (id, threadID, cb) => { calls.push({ method: "unsendMessage", id, threadID }); cb && cb(null, {}); },
		setMessageReaction: (r, id, threadID, cb) => { calls.push({ method: "setMessageReaction", r, id, threadID }); cb && cb(null, {}); },
		sendTextEffect: (text, threadID, effect, cb) => { calls.push({ method: "sendTextEffect", text, effect }); cb && cb(null, {}); },
		sendAvatarTextEffect: (text, threadID, effect, cb) => { calls.push({ method: "sendAvatarTextEffect", text, effect }); cb && cb(null, {}); },
		sendMusic: (threadID, track, cb) => { calls.push({ method: "sendMusic", threadID, track }); cb && cb(null, { threadID, messageID: "music" }); },
		musicSearch: (query, cb) => {
			calls.push({ method: "musicSearch", query });
			cb && cb(null, { query, tracks: [{ title: "Song A", artist: "Artist A", durationMs: 210000, audioClusterID: "111" }, { title: "Song B", artist: "Artist B", durationMs: 180000, audioClusterID: "222" }] });
		},
		sendTypingIndicator: () => () => { },
		changeProfilePicture: (src, cb) => { calls.push({ method: "changeProfilePicture", src }); cb && cb(null, {}); },
		changeBio: (b, cb) => { calls.push({ method: "changeBio", b }); cb && cb(null, {}); },
		listenMqtt: () => () => { }
	}, overrides);
	return api;
}

function makeConfig(overrides = {}) {
	return Object.assign({
		botName: "InstaBOT",
		prefix: "-",
		language: "en",
		adminBot: ["999"],
		antiInbox: false,
		noPrefix: false,
		adminOnly: { enable: false, ignoreCommands: [] },
		whiteList: { enable: false, userIDs: [], threadIDs: [] },
		hideNotiMessage: {},
		cooldown: { default: 0 },
		logEvents: { disableAll: true },
		listenEvents: true
	}, overrides);
}

function makeDatabase() {
	const users = new Map();
	const threads = new Map();
	return {
		users: {
			ensure(id, patch) { if (!users.has(id)) users.set(id, Object.assign({ userID: id, banned: { status: false }, settings: {}, data: {} }, patch)); return users.get(id); },
			get: id => users.get(id) || null,
			update(id, patch) { const u = users.get(id); if (u) Object.assign(u, patch); return u; },
			set(id, patch) { users.set(id, patch); return patch; },
			count: () => users.size,
			flush() { }
		},
		threads: {
			ensure(id, patch) { if (!threads.has(id)) threads.set(id, Object.assign({ threadID: id, adminIDs: [], members: [], settings: {}, data: {} }, patch)); return threads.get(id); },
			get: id => threads.get(id) || null,
			update(id, patch) { const t = threads.get(id); if (t) Object.assign(t, patch); return t; },
			count: () => threads.size,
			flush() { }
		}
	};
}

async function main() {
	/* ── event normalization ── */
	await test("normalizeEvent: reply becomes message_reply + messageReply", () => {
		const ev = normalizeEvent({
			type: "message", threadID: "t", messageID: "m", senderID: "42", body: "hi",
			attachments: [{ type: "image", url: "u" }],
			repliedToMessage: { messageID: "o", senderID: "9", body: "bot" }
		});
		assert.strictEqual(ev.type, "message_reply");
		assert.strictEqual(ev.messageReply.messageID, "o");
		assert.strictEqual(ev.messageReply.senderID, "9");
		assert.strictEqual(ev.attachments[0].type, "photo");
		assert.strictEqual(ev.userID, "42");
	});

	await test("normalizeEvent: plain message keeps type", () => {
		const ev = normalizeEvent({ type: "message", threadID: "t", messageID: "m", senderID: "42", body: "hi", attachments: [] });
		assert.strictEqual(ev.type, "message");
		assert.strictEqual(ev.messageReply, undefined);
	});

	/* ── config parsing ── */
	await test("config: JSON array cookies", () => {
		const list = normalizeCookies([{ key: "sessionid", value: "a" }, { key: "ds_user_id", value: "1" }]);
		assert.strictEqual(list.length, 2);
		assert.strictEqual(list[0].domain, "instagram.com");
	});

	await test("config: cookie header string", () => {
		const list = cookieHeaderToCookies("sessionid=a; ds_user_id=1; csrftoken=x");
		assert.strictEqual(list.length, 3);
	});

	await test("config: loadConfig fills every field the dispatcher reads", () => {
		const { loadConfig } = require(path.join(root, "src/config"));
		const config = loadConfig();
		assert.ok(config.hideNotiMessage && typeof config.hideNotiMessage === "object");
		assert.ok(config.adminOnly && typeof config.adminOnly.enable === "boolean");
		assert.ok(Array.isArray(config.adminOnly.ignoreCommands));
		assert.ok(config.cooldown && typeof config.cooldown.default === "number");
		assert.ok(config.logEvents && typeof config.logEvents === "object");
		assert.ok(config.server && "url" in config.server && "token" in config.server);
		assert.ok(typeof config.server.timeout === "number");
		assert.ok(typeof config.prefix === "string" && config.prefix.length > 0);
	});

	await test("config: netscape file", () => {
		const text = ".instagram.com\tTRUE\t/\tTRUE\t1735689600\tsessionid\tabc";
		assert.ok(isNetScapeCookie(text));
		const list = netScapeToCookies(text);
		assert.strictEqual(list[0].key, "sessionid");
	});

	await test("config: netscape #HttpOnly_ lines are not skipped", () => {
		// Cookie-Editor exports sessionid as an HttpOnly cookie, i.e. a
		// `#HttpOnly_` line. Skipping it (as a comment) drops the login cookie.
		const text = [
			"# Netscape HTTP Cookie File",
			"#HttpOnly_.instagram.com\tTRUE\t/\tTRUE\t1823895835\tcsrftoken\tTOKEN",
			"#HttpOnly_.instagram.com\tTRUE\t/\tTRUE\t1823746805\tsessionid\tSID123",
			".instagram.com\tTRUE\t/\tTRUE\t1797111835\tds_user_id\t42"
		].join("\n");
		const list = netScapeToCookies(text);
		const keys = list.map(c => c.key);
		assert.ok(keys.includes("sessionid"), "sessionid must survive the #HttpOnly_ prefix");
		assert.ok(keys.includes("csrftoken"), "csrftoken must survive");
		assert.ok(keys.includes("ds_user_id"), "ds_user_id must survive");
	});

	/* ── utils ── */
	await test("utils: mediaKind by extension and mime", () => {
		assert.strictEqual(utils.mediaKind("a.mp4"), "video");
		assert.strictEqual(utils.mediaKind("a.m4a"), "audio");
		assert.strictEqual(utils.mediaKind("a.png"), "image");
		assert.strictEqual(utils.mediaKind({ path: "x", mimeType: "video/mp4" }), "video");
	});

	/* ── message context ── */
	await test("message: send text", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "m" } });
		const result = await message.send("hello");
		assert.strictEqual(api.calls[0].form.body, "hello");
		assert.strictEqual(result.messageID, "m1");
	});

	await test("message: reply threads to the event message", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "evt" } });
		await message.reply("hi");
		assert.strictEqual(api.calls[0].reply, "evt");
	});

	await test("message: attachment routes to sendImage/sendAudio/sendVideo", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "m" } });
		await message.send({ body: "cap", attachment: [{ _readableState: {}, path: "a.png" }, { _readableState: {}, path: "b.m4a" }, { _readableState: {}, path: "c.mp4" }] });
		const methods = api.calls.map(c => c.method);
		assert.deepStrictEqual(methods, ["sendImage", "sendAudio", "sendVideo"]);
		assert.strictEqual(api.calls[0].caption, "cap");
	});

	await test("message: a video caption is sent as a separate message", async () => {
		// Instagram's video broadcast is media-only, so the caption must follow
		// as its own message or it is lost.
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "evt" } });
		await message.reply({ body: "anime edit", attachment: { _readableState: {}, path: "c.mp4" } });
		const video = api.calls.find(c => c.method === "sendVideo");
		const text = api.calls.find(c => c.method === "sendMessage");
		assert.ok(video, "the video must be sent");
		assert.ok(text, "the caption must be sent as a separate message");
		assert.strictEqual(text.form.body, "anime edit");
		assert.strictEqual(text.reply, "evt");
	});

	await test("message: unsend and react use the thread", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "evt" } });
		await message.unsend();
		await message.react("❤");
		assert.ok(api.calls.some(c => c.method === "unsendMessage" && c.threadID === "t" && c.id === "evt"));
		assert.ok(api.calls.some(c => c.method === "setMessageReaction" && c.threadID === "t" && c.r === "❤"));
	});

	/* ── dispatcher ── */
	const registry = createRegistry();
	const loaded = loadAll(registry);

	await test("loader: commands and events registered", () => {
		assert.ok(registry.commands.size >= 8, `only ${registry.commands.size} commands`);
		assert.ok(registry.events.length >= 2, `only ${registry.events.length} events`);
		assert.ok(registry.resolve("h"), "alias h should resolve to help");
	});

	await test("dispatcher: runs a command with prefix", async () => {
		const api = fakeApi();
		const config = makeConfig();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-ping", isGroup: false });
		assert.ok(api.calls.some(c => c.method === "sendMessage"), "expected a reply");
	});

	await test("dispatcher: ignores non-command text", async () => {
		const api = fakeApi();
		const config = makeConfig();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "just chatting", isGroup: false });
		assert.strictEqual(api.calls.filter(c => c.method === "sendMessage").length, 0);
	});

	await test("dispatcher: blocks banned users", async () => {
		const api = fakeApi();
		const config = makeConfig();
		const db = makeDatabase();
		db.users.set("5", { userID: "5", banned: { status: true, reason: "spam" }, settings: {}, data: {} });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-ping", isGroup: false });
		const replies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.ok(/banned/i.test(replies), "expected a ban notice");
	});

	await test("dispatcher: honours bot-admin-only mode", async () => {
		const api = fakeApi();
		const config = makeConfig({ adminOnly: { enable: true, ignoreCommands: [] } });
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-ping", isGroup: false });
		const replies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join(" ");
		assert.ok(/admin/i.test(replies), "expected an admin-only notice");
	});

	await test("dispatcher: reply handler is invoked", async () => {
		const api = fakeApi();
		const config = makeConfig();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		let handled = false;
		dispatcher.registerOnReply("bot1", "test", () => { handled = true; });
		await dispatcher.handle({ type: "message_reply", threadID: "t", messageID: "m", senderID: "5", body: "-x", isGroup: false, messageReply: { messageID: "bot1", senderID: "100" } });
		assert.ok(handled, "reply handler should have run");
	});

	/* ── effects & music (message context) ── */
	await test("message: effect routes to sendTextEffect", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "m" } });
		await message.effect("boom", "fire");
		assert.ok(api.calls.some(c => c.method === "sendTextEffect" && c.text === "boom" && c.effect === "fire"));
	});

	await test("message: avatarEffect routes to sendAvatarTextEffect", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "m" } });
		await message.avatarEffect("yay", "laugh");
		assert.ok(api.calls.some(c => c.method === "sendAvatarTextEffect" && c.text === "yay" && c.effect === "laugh"));
	});

	await test("message: music routes to sendMusic with the track", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "m" } });
		await message.music({ audioClusterID: "111" });
		assert.ok(api.calls.some(c => c.method === "sendMusic" && c.track.audioClusterID === "111"));
	});

	await test("message: musicSearch returns track list", async () => {
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "m" } });
		const result = await message.musicSearch("hello");
		assert.strictEqual(result.tracks.length, 2);
		assert.ok(api.calls.some(c => c.method === "musicSearch" && c.query === "hello"));
	});

	/* ── new commands through the dispatcher ── */
	async function runCommand(body, { config, db, api, senderID = "999" } = {}) {
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "evt", senderID, body, isGroup: false });
		return api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
	}

	await test("sing: searches and lists results with numbers", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-sing testing song", { api, db, config: makeConfig() });
		assert.ok(/1\./.test(out) && /2\./.test(out), "expected a numbered list");
		assert.ok(api.calls.some(c => c.method === "musicSearch" && c.query === "testing song"));
	});

	await test("sing: numeric pick sends the chosen track", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig();
		// Seed a cached search result for the sender.
		db.users.set("999", { userID: "999", banned: { status: false }, settings: {}, data: { lastMusic: { query: "x", tracks: [{ title: "A", artist: "B", audioClusterID: "111" }] } } });
		await runCommand("-sing 1", { api, db, config });
		assert.ok(api.calls.some(c => c.method === "sendMusic" && c.track.audioClusterID === "111"));
	});

	await test("sing: uses a custom music server when configured", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const originalFetch = global.fetch;
		let requested = null;
		global.fetch = async (url, opts) => {
			requested = { url, headers: opts && opts.headers };
			return { ok: true, json: async () => ({ tracks: [{ title: "Server Song", artist: "Server Artist", audio_cluster_id: "999", duration_ms: 1000 }] }) };
		};
		try {
			const config = makeConfig({ music: { enable: true, apiUrl: "https://music.example/search?q={query}", apiToken: "tok" } });
			await runCommand("-sing server test", { api, db, config });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(requested && requested.url.includes("server%20test"), "expected the server to be queried");
		assert.strictEqual(requested.headers.Authorization, "Bearer tok");
		assert.ok(api.calls.some(c => c.method === "sendMusic" && c.track.audioClusterID === "999"));
	});

	await test("avatarfx: rejects an unknown effect", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-avatarfx bogus hi", { api, db, config: makeConfig() });
		assert.ok(/pick an effect/i.test(out));
		assert.strictEqual(api.calls.filter(c => c.method === "sendAvatarTextEffect").length, 0);
	});

	await test("avatarfx: sends a known effect", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		await runCommand("-avatarfx laugh nice", { api, db, config: makeConfig() });
		assert.ok(api.calls.some(c => c.method === "sendAvatarTextEffect" && c.effect === "laugh"));
	});

	await test("effect: sends a known power-up effect", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		await runCommand("-effect fire boom", { api, db, config: makeConfig() });
		assert.ok(api.calls.some(c => c.method === "sendTextEffect" && c.effect === "fire" && c.text === "boom"));
	});

	await test("cmd: only bot admins may use it", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-cmd list", { api, db, config: makeConfig(), senderID: "5" });
		assert.ok(/admin/i.test(out), "expected an admin-only notice");
	});

	await test("cmd: lists loaded commands for a bot admin", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-cmd list", { api, db, config: makeConfig() });
		assert.ok(/Loaded commands/.test(out));
		assert.ok(/ping/.test(out));
	});

	await test("cmd: unload then reload a command", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		let out = await runCommand("-cmd unload joke", { api, db, config: makeConfig() });
		assert.ok(/Unloaded/.test(out));
		assert.strictEqual(registry.resolve("joke"), null);
		out = await runCommand("-cmd reload joke", { api, db, config: makeConfig() });
		assert.ok(/Reloaded/.test(out));
		assert.ok(registry.resolve("joke"), "joke should be back");
	});

	await test("eval: evaluates an expression for a bot admin", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-eval 1 + 2", { api, db, config: makeConfig() });
		assert.ok(/3/.test(out));
	});

	await test("shell: runs a command and returns stdout", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-shell echo instabot_ok", { api, db, config: makeConfig() });
		assert.ok(/instabot_ok/.test(out));
	});

	await test("sing: replying to the results message sends the picked track", async () => {
		// Regression: the reply handler must be armed against the results
		// message, not the triggering -sing message the user replies to.
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig();
		const dispatcher = createDispatcher({ api, config, registry, database: db });

		await dispatcher.handle({ type: "message", threadID: "t", messageID: "USER_1", senderID: "999", body: "-sing testing song", isGroup: false });
		const resultIndex = api.calls.findIndex(c => c.method === "sendMessage" && /Results for/.test(c.form.body));
		assert.ok(resultIndex !== -1, "expected a results message");
		// fakeApi returns "m" + (number of calls so far) as the messageID.
		const results = api.calls[resultIndex];

		await dispatcher.handle({
			type: "message_reply", threadID: "t", messageID: "USER_2", senderID: "999", body: "1", isGroup: false,
			messageReply: { messageID: "m" + (resultIndex + 1), senderID: "100", body: results.form.body, attachments: [] }
		});
		const music = api.calls.filter(c => c.method === "sendMusic").pop();
		assert.ok(music, "expected the picked track to be sent");
		assert.strictEqual(music.track.audioClusterID, "111");
	});

	await test("uid: replying to a message returns only the replied user's id", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "message_reply", threadID: "t", messageID: "m", senderID: "5", body: "-uid", isGroup: false,
			messageReply: { messageID: "orig", senderID: "777", body: "hi", attachments: [] }
		});
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "777");
	});

	await test("uid: no arguments returns only the sender's own id", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-uid", isGroup: false });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "5");
	});

	await test("uid: a numeric argument is returned as-is", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-uid 999888777", isGroup: false });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "999888777");
	});

	await test("uid: an @handle is resolved to that user's id only", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(null, { "424242": { userID: "424242", name: "Neo", vanity: "__neo.nnn" } });
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-uid @__neo.nnn", isGroup: false });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "424242");
	});

	await test("avatar: uses an image from the replied message (largePreviewUrl)", async () => {
		const api = fakeApi();
		let changed = null;
		api.changeProfilePicture = (src, cb) => { changed = src; cb && cb(null, { ok: true }); };
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig({ adminBot: ["999"] }), registry, database: db });
		await dispatcher.handle({
			type: "message_reply", threadID: "t", messageID: "m", senderID: "999", body: "-avatar", isGroup: false,
			messageReply: {
				messageID: "orig", senderID: "999", body: "", attachments: [
					// url is null on real payloads; the usable link is largePreviewUrl.
					{ type: "photo", url: null, largePreviewUrl: "https://example.com/pic.jpg" }
				]
			}
		});
		assert.strictEqual(changed, "https://example.com/pic.jpg");
	});

	await test("prefix: runs without the prefix for a bot admin", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ prefix: "!", adminBot: ["999"] });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "999", body: "prefix", isGroup: false });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/current prefix/i.test(reply), "expected the current prefix");
	});

	await test("prefix: bare invocation from a normal user is ignored", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ prefix: "!", adminBot: ["999"] });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "prefix", isGroup: false });
		assert.strictEqual(api.calls.filter(c => c.method === "sendMessage").length, 0);
	});

	await test("dispatcher: suggests a close command on a typo", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-pign", isGroup: false });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "Command not found! Did you mean -ping or try -help");
	});

	await test("dispatcher: unknown command uses the configured prefix via {pn}", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig({ prefix: "!" }), registry, database: db });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "!zzzzzz", isGroup: false });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "Command not found! Try !help");
	});

	await test("join: welcomes a new member with the configured message", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ welcome: { enable: true, message: "Welcome %1 to %2!", threadIDs: [] } });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "join", threadID: "t", participantID: "5", userIDs: ["5"], senderID: "5", userID: "5" });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/Welcome/.test(reply), "expected a welcome message");
	});

	await test("leave: announces a member leaving", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ leave: { enable: true, message: "%1 left %2.", threadIDs: [] } });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "leave", threadID: "t", participantID: "5", userIDs: ["5"], senderID: "5", userID: "5" });
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/left/.test(reply), "expected a leave message");
	});

	await test("join: disabled welcome sends nothing", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ welcome: { enable: false, message: "Welcome %1", threadIDs: [] } });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "join", threadID: "t", participantID: "5", userIDs: ["5"] });
		assert.strictEqual(api.calls.filter(c => c.method === "sendMessage").length, 0);
	});

	/* ── server bridge: callback position ── */
	await test("auth: node callback in the middle keeps trailing reply", async () => {
		// Reproduces sendMessage(form, threadID, cb, reply): the callback is not
		// the last argument, so it must be located by scan, not by position.
		const auth = require(path.join(root, "auth"));
		const http = require("http");

		const received = [];
		const server = http.createServer((req, res) => {
			let body = "";
			req.on("data", c => { body += c; });
			req.on("end", () => {
				received.push(JSON.parse(body));
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true, result: { sent: true } }));
			});
		});
		await new Promise(r => server.listen(0, "127.0.0.1", r));
		const port = server.address().port;

		try {
			const api = await auth({ server: "http://127.0.0.1:" + port, token: "t" });
			let called = null;
			await new Promise((resolve, reject) => {
				api.sendMessage({ body: "hi" }, "thread", (error, result) => {
					if (error) return reject(error);
					called = result;
					resolve();
				}, "reply-target-id");
			});
			assert.ok(called && called.sent, "callback should have been invoked");
			const rpc = received.find(r => r.method === "sendMessage");
			assert.ok(rpc, "expected a sendMessage rpc");
			assert.deepStrictEqual(rpc.args, [{ body: "hi" }, "thread", "reply-target-id"]);
			assert.strictEqual(rpc.callbackIndex, 2, "callback index should be reported");
		}
		finally {
			server.close();
		}
	});

	/* ── multi-bot: bot id plumbing ── */
	await test("auth: sends X-Bot-Id and scopes /events by botId", async () => {
		const auth = require(path.join(root, "auth"));
		const http = require("http");
		const seen = [];
		const server = http.createServer((req, res) => {
			seen.push({ url: req.url, botId: req.headers["x-bot-id"] });
			if (req.url.startsWith("/events")) {
				res.writeHead(200, { "Content-Type": "text/event-stream" });
				res.write("retry: 3000\n\n");
				return; // keep the stream open
			}
			let body = "";
			req.on("data", c => { body += c; });
			req.on("end", () => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true, result: "123" }));
			});
		});
		await new Promise(r => server.listen(0, "127.0.0.1", r));
		const port = server.address().port;
		let stream = null;
		try {
			const api = await auth({ server: "http://127.0.0.1:" + port, token: "t", botId: "botA" });
			await api.getCurrentUserID();
			stream = api.listenMqtt(() => { });
			await new Promise(r => setTimeout(r, 150));
			const rpc = seen.find(s => s.url === "/rpc");
			assert.strictEqual(rpc.botId, "botA", "rpc must carry X-Bot-Id");
			const events = seen.find(s => s.url.startsWith("/events"));
			assert.ok(events, "expected an /events request");
			assert.strictEqual(events.botId, "botA", "events must carry X-Bot-Id");
			assert.ok(/botId=botA/.test(events.url), "events URL must scope the bot id");
		}
		finally {
			if (stream) stream();
			server.close();
		}
	});

	await test("auth: rejects media above the size cap before sending", async () => {
		const auth = require(path.join(root, "auth"));
		const http = require("http");
		let hits = 0;
		const server = http.createServer((req, res) => {
			hits++;
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: true, result: "123" }));
		});
		await new Promise(r => server.listen(0, "127.0.0.1", r));
		const port = server.address().port;
		try {
			const api = await auth({ server: "http://127.0.0.1:" + port, token: "t", botId: "botA" });
			hits = 0;
			const big = Buffer.alloc(6 * 1024 * 1024);
			await assert.rejects(
				() => api.sendVideo(big, "1"),
				/MB limit/,
				"oversized media must be rejected locally"
			);
			assert.strictEqual(hits, 0, "no request should reach the server for oversized media");
		}
		finally { server.close(); }
	});

	await test("config: server.botId defaults to 'default'", () => {
		const { loadConfig } = require(path.join(root, "src/config"));
		const config = loadConfig();
		assert.strictEqual(config.server.botId, "default");
	});

	/* ── anisearch ── */
	await test("anisearch: registered with the Neoaz author", () => {
		const command = registry.resolve("anisearch");
		assert.ok(command, "anisearch should be registered");
		assert.strictEqual(command.config.author, "Neoaz 🐊");
		assert.strictEqual(command.config.category, "media");
	});

	await test("anisearch: missing query asks for usage", async () => {
		const command = registry.resolve("anisearch");
		const sent = [];
		const message = { reply: form => { sent.push(form); return Promise.resolve({ messageID: "x" }); } };
		await command.onStart({ args: [], message });
		assert.ok(/usage/i.test(String(sent[0])), "expected a usage hint");
	});

	await test("anisearch: searches, downloads and sends the video bytes", async () => {
		const command = registry.resolve("anisearch");
		const originalFetch = global.fetch;
		const seen = [];
		global.fetch = async (url, options) => {
			seen.push(String(url));
			if (String(url).includes("/tik-sr")) {
				return { ok: true, status: 200, json: async () => ({ results: [{ url: "https://www.tiktok.com/@a/video/1" }] }) };
			}
			if (String(url).includes("/alldl")) {
				return {
					ok: true, status: 200,
					json: async () => ({ metadata: { data: { title: "Naruto edit", downloads: [{ label: "MP4 (No Watermark)", ext: "mp4", url: "https://cdn.example/v.mp4" }] } } })
				};
			}
			// The actual video download: small enough to send.
			return {
				ok: true, status: 200,
				headers: { get: name => (name === "content-length" ? "1024" : null) },
				arrayBuffer: async () => new Uint8Array(1024).buffer
			};
		};
		let sent = null;
		const message = { reply: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		try {
			await command.onStart({ args: ["naruto"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(sent, "expected a reply");
		assert.strictEqual(sent.body, "Naruto edit");
		assert.ok(Buffer.isBuffer(sent.attachment.buffer), "the video must be sent as bytes, not a URL");
		assert.strictEqual(sent.attachment.buffer.length, 1024);
		assert.strictEqual(sent.attachment.fileName, "anisearch.mp4", "mp4 extension hint must be attached");
		assert.ok(seen.some(u => u.includes("/tik-sr?q=naruto")), "search endpoint hit");
		assert.ok(seen.some(u => u.includes("/alldl?url=")), "download endpoint hit");
		assert.ok(seen.some(u => u.includes("cdn.example/v.mp4")), "video fetched by the bot, not the server");
	});

	await test("anisearch: retries the next result when a video is too large", async () => {
		const command = registry.resolve("anisearch");
		const originalFetch = global.fetch;
		let downloadCount = 0;
		global.fetch = async (url) => {
			if (String(url).includes("/tik-sr")) {
				return {
					ok: true, status: 200,
					json: async () => ({ results: [{ url: "https://www.tiktok.com/@a/video/1" }, { url: "https://www.tiktok.com/@a/video/2" }] })
				};
			}
			if (String(url).includes("/alldl")) {
				return {
					ok: true, status: 200,
					json: async () => ({ metadata: { data: { title: "Edit", downloads: [{ label: "MP4", ext: "mp4", url: "https://cdn.example/v.mp4" }] } } })
				};
			}
			downloadCount++;
			// First download is oversized; the retry is small.
			const size = downloadCount === 1 ? 50 * 1024 * 1024 : 2048;
			return {
				ok: true, status: 200,
				headers: { get: name => (name === "content-length" ? String(size) : null) },
				arrayBuffer: async () => new Uint8Array(size).buffer
			};
		};
		let sent = null;
		const message = { reply: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		try {
			await command.onStart({ args: ["naruto"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(sent && Buffer.isBuffer(sent.attachment.buffer), "expected a video on the retry");
		assert.strictEqual(sent.attachment.buffer.length, 2048);
		assert.strictEqual(downloadCount, 2, "the oversized first download must be retried");
	});

	await test("anisearch: a bare 'Error' from the server is surfaced usefully", async () => {
		const command = registry.resolve("anisearch");
		const originalFetch = global.fetch;
		global.fetch = async (url) => {
			if (String(url).includes("/tik-sr")) {
				return { ok: true, status: 200, json: async () => ({ results: [{ url: "https://www.tiktok.com/@a/video/1" }] }) };
			}
			if (String(url).includes("/alldl")) {
				return {
					ok: true, status: 200,
					json: async () => ({ metadata: { data: { title: "Edit", downloads: [{ label: "MP4", ext: "mp4", url: "https://cdn.example/v.mp4" }] } } })
				};
			}
			throw new Error("Video download failed (HTTP 403)");
		};
		let sent = null;
		const message = { reply: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		try {
			await command.onStart({ args: ["naruto"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(/HTTP 403/.test(String(sent)), "the real reason must be shown, not a bare 'Error'");
	});

	await test("anisearch: no matches reports an error", async () => {
		const command = registry.resolve("anisearch");
		const originalFetch = global.fetch;
		global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) });
		let sent = null;
		const message = { reply: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		try {
			await command.onStart({ args: ["nothing"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(/Could not find a video/.test(String(sent)), "expected an error reply");
	});

	/* ── uptime ── */
	await test("uptime: registered and reports the running time", async () => {
		const command = registry.resolve("uptime");
		assert.ok(command, "uptime should be registered");
		const previous = global.instabotStartedAt;
		global.instabotStartedAt = Date.now() - (2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000);
		let sent = null;
		const message = { reply: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		try {
			await command.onStart({ message, config: { botName: "InstaBOT" } });
		}
		finally {
			global.instabotStartedAt = previous;
		}
		const text = String(sent);
		assert.ok(/InstaBOT uptime/.test(text), "should name the bot");
		assert.ok(/2d 3h 4m/.test(text), "should show the elapsed time, got: " + text);
		assert.ok(/Process uptime:/.test(text), "should include process uptime");
	});

	await test("uptime: aliases resolve to the command", () => {
		assert.ok(registry.resolve("up"), "alias 'up' should resolve");
		assert.ok(registry.resolve("runtime"), "alias 'runtime' should resolve");
	});

	await test("auth: pushes bot cookies to POST /cookies before connecting", async () => {
		const auth = require(path.join(root, "auth"));
		const http = require("http");
		const seen = [];
		const server = http.createServer((req, res) => {
			let body = "";
			req.on("data", c => { body += c; });
			req.on("end", () => {
				seen.push({ url: req.url, botId: req.headers["x-bot-id"], body });
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true, result: req.url === "/cookies" ? { accepted: true } : "123" }));
			});
		});
		await new Promise(r => server.listen(0, "127.0.0.1", r));
		const port = server.address().port;
		try {
			const cookies = [
				{ key: "sessionid", value: "SID", domain: "instagram.com", path: "/" },
				{ key: "ds_user_id", value: "42", domain: "instagram.com", path: "/" }
			];
			const api = await auth({ server: "http://127.0.0.1:" + port, token: "t", botId: "botA", cookies });
			assert.strictEqual(api.getCurrentUserID(), "123");
			const push = seen.find(s => s.url === "/cookies");
			assert.ok(push, "expected a POST /cookies");
			assert.strictEqual(push.botId, "botA", "the push must carry X-Bot-Id");
			const parsed = JSON.parse(push.body);
			assert.ok(Array.isArray(parsed.cookies), "cookies must be sent as an array");
			const idx = seen.findIndex(s => s.url === "/cookies");
			const rpc = seen.findIndex(s => s.url === "/rpc");
			assert.ok(idx < rpc, "cookies must be pushed before the first RPC");
		}
		finally { server.close(); }
	});

	await test("boot: retries instead of exiting when the server has no session", async () => {
		const { createBot } = require(path.join(root, "src/bot"));
		const http = require("http");
		const os = require("os");
		let requests = 0;
		const server = http.createServer((req, res) => {
			requests++;
			if (req.url.startsWith("/events")) { res.writeHead(200, { "Content-Type": "text/event-stream" }); return; }
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: false, error: { message: 'Unknown bot id "default". No sessions are configured' } }));
		});
		await new Promise(r => server.listen(0, "127.0.0.1", r));
		const port = server.address().port;
		const config = {
			botName: "TestBot", prefix: "/", adminBot: [], env: {},
			server: { url: "http://127.0.0.1:" + port, token: "t", botId: "default", timeout: 2000 },
			account: {}, database: { dir: path.join(os.tmpdir(), "igbot-test-" + process.pid) },
			logEvents: { disableAll: true },
			onlineStatus: { enable: false },
			welcome: { enable: false }, leave: { enable: false }
		};
		const bot = createBot(config);
		let settled = false;
		const startPromise = bot.start().then(() => { settled = true; }, () => { settled = true; });
		await new Promise(r => setTimeout(r, 1500));
		assert.strictEqual(settled, false, "start() must stay pending while retrying");
		assert.ok(requests >= 1, "the bot should have attempted at least one connect");
		await bot.stop();
		await Promise.race([startPromise, new Promise(r => setTimeout(r, 3000))]);
		server.close();
	});

	await test("shutdown: never logs the account out (redeploy must not kill the session)", async () => {
		const { createBot } = require(path.join(root, "src/bot"));
		const http = require("http");
		const os = require("os");
		// A fake server that would receive a `logout` RPC if the bot sent one.
		let logoutCalls = 0;
		const server = http.createServer((req, res) => {
			let body = "";
			req.on("data", c => { body += c; });
			req.on("end", () => {
				if (String(req.url).startsWith("/events")) {
					res.writeHead(200, { "Content-Type": "text/event-stream" });
					return;
				}
				if (/logout/.test(body)) logoutCalls++;
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true, result: "BOT123" }));
			});
		});
		await new Promise(r => server.listen(0, "127.0.0.1", r));
		const port = server.address().port;
		const config = {
			botName: "TestBot", prefix: "/", adminBot: [], env: {},
			server: { url: "http://127.0.0.1:" + port, token: "t", botId: "default", timeout: 2000 },
			account: {}, database: { dir: path.join(os.tmpdir(), "igbot-test-logout-" + process.pid) },
			logEvents: { disableAll: true },
			onlineStatus: { enable: false },
			welcome: { enable: false }, leave: { enable: false },
			autoMarkRead: false, autoMarkDelivery: false
		};
		const bot = createBot(config);
		try {
			await Promise.race([bot.start(), new Promise(r => setTimeout(r, 2500))]);
			await bot.stop();
		}
		finally {
			server.close();
		}
		assert.strictEqual(logoutCalls, 0, "stop() must never send a logout — it invalidates the cookies");
	});

	await test("loader: loadAll is idempotent (no duplicate commands/events)", () => {
		const reg = createRegistry();
		const first = loadAll(reg);
		assert.ok(first.commandCount > 0, "expected commands to load");
		const firstEvents = reg.events.length;
		const second = loadAll(reg);
		assert.strictEqual(second.commandCount, first.commandCount, "command count must not change on reload");
		assert.strictEqual(reg.events.length, firstEvents, "events must not duplicate on reload");
	});

	await test("status server: serves /health on the given port and stops", async () => {
		const { createStatusServer } = require(path.join(root, "src/statusServer"));
		const http = require("http");

		// PORT=0 disables it (pure worker mode).
		assert.strictEqual(createStatusServer({ port: 0 }).enabled, false);

		// Grab a free ephemeral port, release it, then bind our server there.
		const probe = http.createServer();
		await new Promise(r => probe.listen(0, "127.0.0.1", r));
		const port = probe.address().port;
		await new Promise(r => probe.close(r));

		const live = createStatusServer({ port, host: "127.0.0.1", info: () => ({ online: true, botId: "botA" }) });
		await live.start();
		try {
			const res = await new Promise((resolve, reject) => {
				http.get({ host: "127.0.0.1", port, path: "/health" }, r => {
					let b = "";
					r.on("data", d => { b += d; });
					r.on("end", () => resolve({ status: r.statusCode, body: b }));
				}).on("error", reject);
			});
			assert.strictEqual(res.status, 200);
			const parsed = JSON.parse(res.body);
			assert.strictEqual(parsed.ok, true);
			assert.strictEqual(parsed.service, "instabot");
			assert.strictEqual(parsed.online, true);
			assert.strictEqual(parsed.botId, "botA");
		}
		finally { await live.stop(); }
	});

	/* ── summary ── */
	const failed = results.filter(r => !r.ok);
	for (const r of results)
		console.log(`${r.ok ? "  ok " : "FAIL "} - ${r.name}`);
	console.log(`\n${count}/${results.length} tests passed`);
	if (failed.length) {
		for (const f of failed) console.error("\n" + f.name + ":\n", f.error);
		process.exit(1);
	}
}

main().catch(error => { console.error(error); process.exit(1); });
