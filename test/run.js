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
			calls.push({ method: "sendImage", img, caption, reply, threadID });
			cb && cb(null, { threadID, messageID: "img" + calls.length });
		},
		sendAudio: (a, threadID, cb, reply) => { calls.push({ method: "sendAudio", threadID, reply }); cb && cb(null, { threadID, messageID: "aud" + calls.length }); },
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
		addUserToThread: (uid, threadID, cb) => { calls.push({ method: "addUserToThread", uid, threadID }); cb && cb(null, {}); },
		removeUserFromThread: (uid, threadID, cb) => { calls.push({ method: "removeUserFromThread", uid, threadID }); cb && cb(null, {}); },
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
	// Username lookups are cached on disk; start every run clean.
	utils._resetUsernameCache();

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

	await test("config: there is no bot id to configure", () => {
		// The server identifies each session by the account's Instagram id and
		// tells the bot what it is; the bot must not carry a botId setting.
		const { loadConfig, configPath } = require(path.join(root, "src/config"));
		const config = loadConfig();
		assert.strictEqual(config.server.botId, undefined, "server.botId must not exist");

		const before = process.env.IG_BOT_ID;
		process.env.IG_BOT_ID = "should-be-ignored";
		try {
			assert.strictEqual(loadConfig().server.botId, undefined, "IG_BOT_ID must not resurrect botId");
		}
		finally {
			if (before === undefined) delete process.env.IG_BOT_ID;
			else process.env.IG_BOT_ID = before;
		}
	});

	await test("config: the environment overrides a committed server url and token", () => {
		// Regression: forkers set IG_API_SERVER in their host dashboard, but a
		// committed config.json still pointed the bot at the original author's
		// server (and so at that author's Instagram account). The environment
		// must always win.
		const { loadConfig } = require(path.join(root, "src/config"));
		const urlBefore = process.env.IG_API_SERVER;
		const tokenBefore = process.env.IG_API_TOKEN;
		process.env.IG_API_SERVER = "https://my-own-server.example";
		process.env.IG_API_TOKEN = "my-own-token";
		try {
			const config = loadConfig();
			assert.strictEqual(config.server.url, "https://my-own-server.example",
				"IG_API_SERVER must override config.server.url");
			assert.strictEqual(config.server.token, "my-own-token",
				"IG_API_TOKEN must override config.server.token");
		}
		finally {
			if (urlBefore === undefined) delete process.env.IG_API_SERVER;
			else process.env.IG_API_SERVER = urlBefore;
			if (tokenBefore === undefined) delete process.env.IG_API_TOKEN;
			else process.env.IG_API_TOKEN = tokenBefore;
		}
	});

	await test("config: ships with no personal server, token or admin id", () => {
		// A fork must not inherit anyone else's endpoint or admin account.
		const { loadConfig } = require(path.join(root, "src/config"));
		const urlBefore = process.env.IG_API_SERVER;
		const tokenBefore = process.env.IG_API_TOKEN;
		delete process.env.IG_API_SERVER;
		delete process.env.IG_API_TOKEN;
		try {
			const config = loadConfig();
			assert.strictEqual(config.server.url, "", "config.json must not ship a server url");
			assert.strictEqual(config.server.token, "", "config.json must not ship a server token");
			assert.deepStrictEqual(config.adminBot, [], "config.json must not ship an admin account id");
		}
		finally {
			if (urlBefore !== undefined) process.env.IG_API_SERVER = urlBefore;
			if (tokenBefore !== undefined) process.env.IG_API_TOKEN = tokenBefore;
		}
	});

	await test("config: a thrown loadAccount error tells you to copy the example file", () => {
		const { loadConfig } = require(path.join(root, "src/config"));
		assert.ok(loadConfig(), "config must load");
		const source = require("fs").readFileSync(path.join(root, "src", "config.js"), "utf8");
		assert.match(source, /account\.example\.txt/, "the missing-cookie error must point at the example file");
	});

	await test("bot: adopts the session id the server assigns (not a configured one)", async () => {
		// The bot starts with no id, posts its cookies, and adopts result.botId.
		const { pushCookies } = require(path.join(root, "auth.js"));
		assert.strictEqual(typeof pushCookies, "function", "pushCookies must be exported");

		const http = require("http");
		const original = http.request;
		http.request = (options, cb) => {
			const res = {
				statusCode: 200,
				on(event, handler) {
					if (event === "data") handler(Buffer.from(JSON.stringify({ ok: true, result: { botId: "24268962575", accepted: true } })));
					if (event === "end") handler();
					return this;
				}
			};
			if (cb) cb(res);
			return { on() { return this; }, write() { }, end() { }, destroy() { } };
		};
		try {
			const outcome = await pushCookies(
				{ base: new URL("http://127.0.0.1:9999"), token: "t", botId: "" },
				"sessionid=a; ds_user_id=24268962575"
			);
			assert.strictEqual(outcome.botId, "24268962575", "the server-assigned id must be returned");
		}
		finally {
			http.request = original;
		}
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
		const methods = api.calls.map(c => c.method).filter(m => m !== "sendMessage");
		assert.deepStrictEqual(methods, ["sendImage", "sendAudio", "sendVideo"]);
	});

	await test("message: an image caption is sent as a separate message", async () => {
		// photo_attachment is media-only, so the caption follows as its own
		// message or it is silently dropped.
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "evt" } });
		await message.reply({ body: "a picture", attachment: { _readableState: {}, path: "a.png" } });
		const image = api.calls.find(c => c.method === "sendImage");
		const text = api.calls.find(c => c.method === "sendMessage");
		assert.ok(image, "the image must be sent");
		assert.strictEqual(image.caption, "");
		assert.ok(text, "the caption must be sent as a separate message");
		assert.strictEqual(text.form.body, "a picture");
		assert.strictEqual(text.reply, "evt");
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

	await test("message: an audio caption is sent as a separate reply", async () => {
		// voice_attachment is media-only too: the caption follows as its own
		// message and the reply target must survive on both sends.
		const api = fakeApi();
		const message = createMessageContext({ api, event: { threadID: "t", messageID: "evt" } });
		await message.reply({ body: "listen", attachment: { _readableState: {}, path: "b.m4a" } });
		const audio = api.calls.find(c => c.method === "sendAudio");
		const text = api.calls.find(c => c.method === "sendMessage");
		assert.ok(audio, "the audio must be sent");
		assert.ok(text, "the caption must be sent as a separate message");
		assert.strictEqual(text.form.body, "listen");
		assert.strictEqual(text.reply, "evt");
		assert.strictEqual(audio.reply, "evt");
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

	await test("dispatcher: reply handlers chain across repeated replies", async () => {
		// Regression for the `ai` command stopping after the second exchange:
		// the continuation must receive setReplyHandler from the handler
		// argument object (it is a sibling of `event`), so every bot reply arms
		// the handler for the next user reply.
		const api = fakeApi();
		const config = makeConfig();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		const botMessageIDs = [];
		const continuation = () => async ({ message, event, setReplyHandler }) => {
			const sent = await message.reply("bot: " + event.body);
			const id = sent && sent.messageID;
			botMessageIDs.push(id);
			setReplyHandler(continuation(), id);
		};
		registry.registerCommand({ script: {
			config: { name: "aichain", aliases: [], cooldown: 0, role: 0, category: "ai" },
			onStart: async ({ message, event, setReplyHandler }) => {
				const sent = await message.reply("bot: " + event.body);
				const id = sent && sent.messageID;
				botMessageIDs.push(id);
				setReplyHandler(continuation(), id);
			}
		} });
		await dispatcher.handle({ type: "message", threadID: "t", messageID: "u1", senderID: "5", body: "-aichain", isGroup: false });
		assert.ok(botMessageIDs[0], "first bot reply must expose a message id");
		await dispatcher.handle({ type: "message_reply", threadID: "t", messageID: "u2", senderID: "5", body: "second", isGroup: false, messageReply: { messageID: botMessageIDs[0], senderID: "100" } });
		assert.ok(botMessageIDs[1], "second exchange must produce a bot reply");
		await dispatcher.handle({ type: "message_reply", threadID: "t", messageID: "u3", senderID: "5", body: "third", isGroup: false, messageReply: { messageID: botMessageIDs[1], senderID: "100" } });
		assert.ok(botMessageIDs[2], "third exchange must produce a bot reply");
		await dispatcher.handle({ type: "message_reply", threadID: "t", messageID: "u4", senderID: "5", body: "fourth", isGroup: false, messageReply: { messageID: botMessageIDs[2], senderID: "100" } });
		assert.ok(botMessageIDs[3], "fourth exchange must produce a bot reply");
		registry.unregisterCommand("aichain");
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
	async function runCommand(body, { config, db, api, senderID = "999", extraEvent } = {}) {
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle(Object.assign({ type: "message", threadID: "t", messageID: "evt", senderID, body, isGroup: false }, extraEvent || {}));
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

	await test("sing: falls back to Instagram search when the music server 404s", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const originalFetch = global.fetch;
		global.fetch = async () => ({ ok: false, status: 404 });
		try {
			const config = makeConfig({ music: { enable: true, apiUrl: "https://music.example/search", apiToken: "" } });
			const out = await runCommand("-sing server down", { api, db, config });
			assert.ok(!/music server responded/.test(out), "a dead music server must not surface an error");
			assert.ok(api.calls.some(c => c.method === "musicSearch" && c.query === "server down"), "expected the Instagram fallback");
		}
		finally {
			global.fetch = originalFetch;
		}
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
		assert.ok(/✅ Unloaded/.test(out));
		assert.strictEqual(registry.resolve("joke"), null);
		out = await runCommand("-cmd reload joke", { api, db, config: makeConfig() });
		assert.ok(/✅ Reloaded/.test(out));
		assert.ok(registry.resolve("joke"), "joke should be back");
	});

	await test("cmd: responses carry ✅ / ❌ status icons", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const ok = await runCommand("-cmd list", { api, db, config: makeConfig() });
		assert.ok(/📦/.test(ok), "list should use the package icon");
		const bad = await runCommand("-cmd unload doesnotexist", { api, db, config: makeConfig() });
		assert.ok(/❌/.test(bad), "a missing command should use the cross icon");
	});

	await test("cmd: installs a command from direct code and loads it live", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const fileName = "testinstall_" + Date.now().toString(36) + ".js";
		const code = 'module.exports = { config: { name: "zzztestcmd", category: "custom", description: { en: "x" } }, onStart: async ({ message }) => message.reply("installed ok") };';
		try {
			const out = await runCommand(`-cmd install ${fileName} ${code}`, { api, db, config: makeConfig() });
			assert.ok(/Installed "zzztestcmd"/.test(out), "should report the install, got: " + out);
			assert.ok(registry.resolve("zzztestcmd"), "the command must be live without restart");
			const fs = require("fs");
			assert.ok(fs.existsSync(require("path").join(__dirname, "..", "commands", fileName)), "the file must be written");
		}
		finally {
			registry.unregisterCommand("zzztestcmd");
			try { require("fs").unlinkSync(require("path").join(__dirname, "..", "commands", fileName)); } catch (_) { }
		}
	});

	await test("cmd: installs a command from a replied code message", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const fileName = "testreply_" + Date.now().toString(36) + ".js";
		const code = 'module.exports = { config: { name: "zzzreplycmd", category: "custom", description: { en: "x" } }, onStart: async ({ message }) => message.reply("replied ok") };';
		try {
			const out = await runCommand(`-cmd install ${fileName}`, {
				api, db, config: makeConfig(),
				extraEvent: { messageReply: { messageID: "m2", senderID: "999", body: code, attachments: [] } }
			});
			assert.ok(/Installed "zzzreplycmd"/.test(out), "should install from the reply, got: " + out);
			assert.ok(registry.resolve("zzzreplycmd"), "the replied command must be live");
		}
		finally {
			registry.unregisterCommand("zzzreplycmd");
			try { require("fs").unlinkSync(require("path").join(__dirname, "..", "commands", fileName)); } catch (_) { }
		}
	});

	await test("cmd: installs a command from a URL", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const fileName = "testurl_" + Date.now().toString(36) + ".js";
		const originalFetch = global.fetch;
		const code = 'module.exports = { config: { name: "zzzurlcmd", category: "custom", description: { en: "x" } }, onStart: async ({ message }) => message.reply("url ok") };';
		global.fetch = async () => ({ ok: true, text: async () => code });
		try {
			const out = await runCommand(`-cmd install https://example.com/thing.js ${fileName}`, { api, db, config: makeConfig() });
			assert.ok(/Installed "zzzurlcmd"/.test(out), "should install from the url, got: " + out);
			assert.ok(registry.resolve("zzzurlcmd"), "the url command must be live");
		}
		finally {
			global.fetch = originalFetch;
			registry.unregisterCommand("zzzurlcmd");
			try { require("fs").unlinkSync(require("path").join(__dirname, "..", "commands", fileName)); } catch (_) { }
		}
	});

	await test("cmd: URL install works with the name before the URL too", async () => {
		// Regression: `-cmd install ai.js <url>` treated the URL itself as
		// inline code and wrote the URL text as the file, so the bot failed
		// (or silently kept the old file). The name may come before or after
		// the URL.
		const api = fakeApi();
		const db = makeDatabase();
		const fileName = "testurlorder_" + Date.now().toString(36) + ".js";
		const originalFetch = global.fetch;
		const code = 'module.exports = { config: { name: "zzzurlordercmd", category: "custom", description: { en: "x" } }, onStart: async ({ message }) => message.reply("ok") };';
		let fetched = null;
		global.fetch = async (url) => { fetched = String(url); return { ok: true, text: async () => code }; };
		try {
			const out = await runCommand(`-cmd install ${fileName} https://example.com/thing.js`, { api, db, config: makeConfig() });
			assert.ok(/Installed "zzzurlordercmd"/.test(out), "should install with name-first order, got: " + out);
			assert.strictEqual(fetched, "https://example.com/thing.js", "the URL must be fetched, not treated as code");
			const written = require("fs").readFileSync(require("path").join(__dirname, "..", "commands", fileName), "utf8");
			assert.match(written, /module\.exports/, "the file must contain the downloaded code");
		}
		finally {
			global.fetch = originalFetch;
			registry.unregisterCommand("zzzurlordercmd");
			try { require("fs").unlinkSync(require("path").join(__dirname, "..", "commands", fileName)); } catch (_) { }
		}
	});

	await test("cmd: uninstall removes the file and unloads it live", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const path = require("path");
		const fs = require("fs");
		const fileName = "testuninstall_" + Date.now().toString(36) + ".js";
		const code = 'module.exports = { config: { name: "zzzuninst", category: "custom", description: { en: "x" } }, onStart: async ({ message }) => message.reply("x") };';
		const dest = path.join(__dirname, "..", "commands", fileName);
		try {
			await runCommand(`-cmd install ${fileName} ${code}`, { api, db, config: makeConfig() });
			assert.ok(fs.existsSync(dest), "file should exist after install");
			const out = await runCommand("-cmd uninstall zzzuninst", { api, db, config: makeConfig() });
			assert.ok(/Uninstalled/.test(out), "should report uninstall, got: " + out);
			assert.ok(!registry.resolve("zzzuninst"), "command must be gone live");
			assert.ok(!fs.existsSync(dest), "the file must be deleted");
		}
		finally {
			registry.unregisterCommand("zzzuninst");
			try { fs.unlinkSync(dest); } catch (_) { }
		}
	});

	await test("eval: evaluates an expression for a bot admin", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-eval 1 + 2", { api, db, config: makeConfig() });
		assert.ok(/3/.test(out));
	});

	await test("eval: out(\"hi\") replies hi", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand(`-eval out("hi")`, { api, db, config: makeConfig() });
		assert.strictEqual(out, "hi");
	});

	await test("eval: output() stringifies objects and Map", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const obj = await runCommand(`-eval output({ a: 1, b: 2 })`, { api, db, config: makeConfig() });
		assert.ok(/\"a\": 1/.test(obj), "expected pretty JSON");
		const map = await runCommand(`-eval out(new Map([["k","v"]]))`, { api, db, config: makeConfig() });
		assert.ok(/Map\(1\)/.test(map) && /\"k\": \"v\"/.test(map));
	});

	await test("eval: out() wins over the return value", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand(`-eval out("first"); return "second";`, { api, db, config: makeConfig() });
		assert.ok(/first/.test(out));
		assert.ok(!/second/.test(out), "the return value should be suppressed once out() is used");
	});

	await test("eval: an error is reported", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-eval throw new Error('boom')", { api, db, config: makeConfig() });
		assert.ok(/boom/.test(out));
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
		const original = utils.download;
		utils.download = async () => { throw new Error("no public lookup in this test"); };
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		try {
			await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-uid @__neo.nnn", isGroup: false });
		}
		finally {
			utils.download = original;
		}
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "424242");
	});

	await test("uid: a profile URL resolves through the parsed username", async () => {
		const api = fakeApi();
		let looked = null;
		api.getUserInfo = (id, cb) => { looked = id; cb(null, { "10402267946": { userID: "10402267946" } }); };
		const original = utils.download;
		utils.download = async () => { throw new Error("no public lookup in this test"); };
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		try {
			await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-uid https://www.instagram.com/chistyeee?stkn=bHk2cDAwd2RpOHh6", isGroup: false });
		}
		finally {
			utils.download = original;
		}
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(looked, "chistyeee", "the URL must be reduced to the username");
		assert.strictEqual(reply, "10402267946");
	});

	await test("uid: a profile URL resolves through the public endpoint when the session cannot", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(new Error("handle lookup unsupported"));
		utils._resetUsernameCache();
		const original = utils.download;
		utils.download = async () => Buffer.from(JSON.stringify({ data: { user: { id: "555111" } } }));
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		try {
			await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-uid https://www.instagram.com/chistyeee?stkn=bHk2cDAwd2RpOHh6", isGroup: false });
		}
		finally {
			utils.download = original;
		}
		const reply = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.strictEqual(reply, "555111");
	});

	await test("target: every command resolves a bare username", async () => {
		const cases = [
			{ body: "-uid bob", method: "sendMessage", expect: "222" },
			{ body: "-info bob", method: "sendImage", expect: "Bob" },
			{ body: "-pfp bob", method: "sendImage", expect: "pic.jpg" },
			{ body: "-adduser bob", method: "addUserToThread", expect: "222", extraEvent: { isGroup: true } },
			{ body: "-removeuser bob", method: "removeUserFromThread", expect: "222", extraEvent: { isGroup: true } }
		];
		for (const item of cases) {
			const api = fakeApi();
			// Force the public endpoint so the resolved id is deterministic.
			api.getUserInfo = (id, cb) => cb(new Error("session handle lookup unsupported"));
			utils._resetUsernameCache();
			const original = utils.download;
			utils.download = async () => Buffer.from(JSON.stringify({ data: { user: { id: "222", username: "bob", full_name: "Bob", profile_pic_url_hd: "https://x/pic.jpg" } } }));
			const db = makeDatabase();
			try {
				await runCommand(item.body, { api, db, config: makeConfig(), extraEvent: item.extraEvent });
			}
			finally {
				utils.download = original;
			}
			const call = api.calls.find(c => c.method === item.method);
			assert.ok(call, `expected ${item.method} for "${item.body}"`);
			const haystack = JSON.stringify(api.calls);
			assert.ok(haystack.includes(item.expect), `expected "${item.expect}" for "${item.body}", got ${haystack}`);
		}
	});

	await test("utils: instagramUsername parses URLs, handles and rejects paths", () => {
		assert.strictEqual(utils.instagramUsername("https://www.instagram.com/chistyeee?stkn=abc"), "chistyeee");
		assert.strictEqual(utils.instagramUsername("https://instagram.com/chistyeee/"), "chistyeee");
		assert.strictEqual(utils.instagramUsername("instagram.com/chistyeee"), "chistyeee");
		assert.strictEqual(utils.instagramUsername("@chistyeee"), "chistyeee");
		assert.strictEqual(utils.instagramUsername("https://www.instagram.com/p/ABC123/"), null);
		assert.strictEqual(utils.instagramUsername("https://www.instagram.com/stories/chistyeee/123/"), null);
		assert.strictEqual(utils.instagramUsername("https://example.com/chistyeee"), null);
		assert.strictEqual(utils.instagramUsername("chistyeee"), null);
	});

	await test("utils: resolveInstagramUserID reads the public web_profile_info", async () => {
		const original = utils.download;
		utils._resetUsernameCache();
		utils.download = async url => {
			assert.ok(/web_profile_info\/\?username=chistyeee/.test(url), "expected the profile endpoint");
			return Buffer.from(JSON.stringify({ data: { user: { id: "10402267946" } } }));
		};
		try {
			assert.strictEqual(await utils.resolveInstagramUserID("chistyeee"), "10402267946");
		}
		finally {
			utils.download = original;
		}
	});

	await test("utils: resolveInstagramUserID returns null on failure", async () => {
		const original = utils.download;
		utils.download = async () => { throw new Error("network down"); };
		try {
			assert.strictEqual(await utils.resolveInstagramUserID("nobody"), null);
		}
		finally {
			utils.download = original;
		}
	});

	await test("info: shows a user's details for a replied user", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(null, { "777": { userID: "777", name: "Jane Doe", vanity: "jane", biography: "hi", followerCount: 1234, followingCount: 56, isPrivate: true, profilePicture: "https://example.com/p.jpg" } });
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "message_reply", threadID: "t", messageID: "m", senderID: "5", body: "-info",
			messageReply: { messageID: "o", senderID: "777", body: "", attachments: [] }, isGroup: false
		});
		const text = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/Jane Doe/.test(text) && /@jane/.test(text) && /1,234/.test(text), "expected profile details: " + text);
	});

	await test("info: resolves an @handle through the public profile", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(new Error("handle lookup unsupported"));
		utils._resetUsernameCache();
		const original = utils.download;
		utils.download = async () => Buffer.from(JSON.stringify({ data: { user: {
			id: "10402267946", username: "chistyeee", full_name: "Meheraz", biography: "bio here",
			edge_followed_by: { count: 1106 }, edge_follow: { count: 163 },
			edge_owner_to_timeline_media: { count: 2 }, is_private: false, is_verified: false,
			profile_pic_url_hd: "https://example.com/hd.jpg"
		} } }));
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		try {
			await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-info @chistyeee", isGroup: false });
		}
		finally {
			utils.download = original;
		}
		const image = api.calls.find(c => c.method === "sendImage");
		assert.ok(image && /hd\.jpg/.test(String(image.img)), "expected the profile picture attachment");
		const text = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/Meheraz/.test(text) && /1,106/.test(text) && /bio here/.test(text), "expected the profile details: " + text);
	});

	await test("info: a profile URL resolves to the same user", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(new Error("handle lookup unsupported"));
		utils._resetUsernameCache();
		const original = utils.download;
		utils.download = async url => {
			assert.ok(/web_profile_info\/\?username=chistyeee/.test(url));
			return Buffer.from(JSON.stringify({ data: { user: { id: "10402267946", username: "chistyeee", full_name: "Meheraz" } } }));
		};
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		try {
			await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-info https://www.instagram.com/chistyeee?stkn=abc", isGroup: false });
		}
		finally {
			utils.download = original;
		}
		const text = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/10402267946/.test(text), "expected the resolved id: " + text);
	});

	await test("pfp: sends the user's profile picture", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(null, { "777": { userID: "777", name: "Jane", profilePicture: "https://example.com/jane.jpg" } });
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "message_reply", threadID: "t", messageID: "m", senderID: "5", body: "-pfp",
			messageReply: { messageID: "o", senderID: "777", body: "", attachments: [] }, isGroup: false
		});
		const image = api.calls.find(c => c.method === "sendImage");
		assert.ok(image, "expected an image");
		assert.strictEqual(image.img, "https://example.com/jane.jpg");
	});

	await test("pfp: resolves a profile URL through the public pic", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(new Error("handle lookup unsupported"));
		utils._resetUsernameCache();
		const original = utils.download;
		utils.download = async () => Buffer.from(JSON.stringify({ data: { user: { id: "10402267946", username: "chistyeee", full_name: "Meheraz", profile_pic_url_hd: "https://example.com/chisty.jpg" } } }));
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		try {
			await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-pfp https://www.instagram.com/chistyeee?stkn=abc", isGroup: false });
		}
		finally {
			utils.download = original;
		}
		const image = api.calls.find(c => c.method === "sendImage");
		assert.ok(image, "expected an image");
		assert.strictEqual(image.img, "https://example.com/chisty.jpg");
	});

	await test("pfp: missing user asks for a target", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(new Error("nope"));
		const original = utils.download;
		utils.download = async () => { throw new Error("network"); };
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		try {
			await dispatcher.handle({ type: "message", threadID: "t", messageID: "m", senderID: "5", body: "-pfp @ghost", isGroup: false });
		}
		finally {
			utils.download = original;
		}
		const text = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body).join("\n");
		assert.ok(/@ghost/.test(text));
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

	await test("join: welcomes the affected member from a username-only action_log", async () => {
		// After the server parser drops the actor, a realtime join carries only
		// the added member's username (no numeric id). Exactly one welcome.
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ welcome: { enable: true, message: "Welcome %1 to %2!", threadIDs: [] } });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "join", threadID: "t", usernames: ["botnkx"], userIDs: [] });
		const messages = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.strictEqual(messages.length, 1, "exactly one welcome must be sent");
		assert.ok(/botnkx/.test(messages[0]), "the affected member must be named");
	});

	await test("leave: announces the affected member from a username-only action_log", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const config = makeConfig({ leave: { enable: true, message: "%1 left %2.", threadIDs: [] } });
		const dispatcher = createDispatcher({ api, config, registry, database: db });
		await dispatcher.handle({ type: "leave", threadID: "t", usernames: ["botnkx"], userIDs: [] });
		const messages = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.strictEqual(messages.length, 1, "exactly one leave message must be sent");
		assert.ok(/botnkx/.test(messages[0]), "the affected member must be named");
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
	await test("auth: adopts the server id and scopes later calls by it", async () => {
		// The bot is never configured with an id. It posts its cookies, the
		// server replies with the session id it assigned, and the bot uses that
		// id for the event stream and every later call.
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
				if (req.url === "/cookies") {
					// The server derives the session id from the pushed cookies.
					return res.end(JSON.stringify({ ok: true, result: { botId: "24268962575", accepted: true } }));
				}
				res.end(JSON.stringify({ ok: true, result: "123" }));
			});
		});
		await new Promise(r => server.listen(0, "127.0.0.1", r));
		const port = server.address().port;
		let stream = null;
		try {
			const cookies = "sessionid=a; ds_user_id=24268962575; csrftoken=x";
			const api = await auth({ server: "http://127.0.0.1:" + port, token: "t", cookies });
			await api.getCurrentUserID();
			stream = api.listenMqtt(() => { });
			await new Promise(r => setTimeout(r, 150));

			// The first cookie push must NOT claim an id of its own.
			const push = seen.find(s => s.url === "/cookies");
			assert.ok(push, "expected a /cookies push");
			assert.strictEqual(push.botId, undefined, "the cookie push must not send X-Bot-Id");

			const rpc = seen.find(s => s.url === "/rpc");
			assert.strictEqual(rpc.botId, "24268962575", "rpc must carry the adopted id");
			const events = seen.find(s => s.url.startsWith("/events"));
			assert.ok(events, "expected an /events request");
			assert.strictEqual(events.botId, "24268962575", "events must carry the adopted id");
			assert.ok(/botId=24268962575/.test(events.url), "events URL must scope the adopted id");
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

	await test("config: server has no botId (the server assigns the session id)", () => {
		const { loadConfig } = require(path.join(root, "src/config"));
		const config = loadConfig();
		assert.strictEqual("botId" in config.server, false, "config.server must not carry a botId");
	});

	await test("config: a blank music.apiUrl never falls back to env.url", () => {
		// Regression: a host that sets INSTABOT_URL to its own service URL made
		// `sing` query the bot's own host and get a 404.
		const { loadConfig } = require(path.join(root, "src/config"));
		const previous = process.env.INSTABOT_URL;
		process.env.INSTABOT_URL = "https://the-bot-itself.onrender.com";
		try {
			const config = loadConfig();
			assert.strictEqual(config.music.apiUrl, "", "blank music.apiUrl must stay blank");
		}
		finally {
			if (previous === undefined) delete process.env.INSTABOT_URL;
			else process.env.INSTABOT_URL = previous;
		}
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
		const replies = [];
		const reactions = [];
		const message = {
			reply: form => { replies.push(form); return Promise.resolve({ messageID: "x" }); },
			react: emoji => { reactions.push(emoji); return Promise.resolve({}); }
		};
		try {
			await command.onStart({ args: ["naruto"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.strictEqual(replies.length, 2, "a text then the video");
		assert.strictEqual(String(replies[0]), "Naruto edit", "the title/caption goes first");
		const video = replies[1];
		assert.ok(Buffer.isBuffer(video.attachment.buffer), "the video must be sent as bytes, not a URL");
		assert.strictEqual(video.attachment.buffer.length, 1024);
		assert.strictEqual(video.attachment.fileName, "anisearch.mp4", "mp4 extension hint must be attached");
		assert.deepStrictEqual(reactions, ["⏳", "✅"], "loading then success reactions");
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
		const replies = [];
		const message = {
			reply: form => { replies.push(form); return Promise.resolve({ messageID: "x" }); },
			react: () => Promise.resolve({})
		};
		try {
			await command.onStart({ args: ["naruto"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		const video = replies.find(r => r && r.attachment);
		assert.ok(video && Buffer.isBuffer(video.attachment.buffer), "expected a video on the retry");
		assert.strictEqual(video.attachment.buffer.length, 2048);
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
		const reactions = [];
		const message = {
			reply: form => { sent = form; return Promise.resolve({ messageID: "x" }); },
			react: emoji => { reactions.push(emoji); return Promise.resolve({}); }
		};
		try {
			await command.onStart({ args: ["naruto"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(/HTTP 403/.test(String(sent)), "the real reason must be shown, not a bare 'Error'");
		assert.deepStrictEqual(reactions, ["⏳", "❌"], "loading then failure reactions");
	});

	await test("anisearch: no matches reports an error", async () => {
		const command = registry.resolve("anisearch");
		const originalFetch = global.fetch;
		global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) });
		let sent = null;
		const reactions = [];
		const message = {
			reply: form => { sent = form; return Promise.resolve({ messageID: "x" }); },
			react: emoji => { reactions.push(emoji); return Promise.resolve({}); }
		};
		try {
			await command.onStart({ args: ["nothing"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(/Could not find a video/.test(String(sent)), "expected an error reply");
		assert.deepStrictEqual(reactions, ["⏳", "❌"], "loading then failure reactions");
	});

	/* ── unsend ── */
	await test("unsend: registered with the Neoaz author", () => {
		const command = registry.resolve("unsend");
		assert.ok(command, "unsend should be registered");
		assert.strictEqual(command.config.author, "Neoaz 🐊");
		assert.strictEqual(command.config.category, "utility");
	});

	await test("unsend: removes the message the command replies to", async () => {
		const command = registry.resolve("unsend");
		const calls = [];
		const api = {
			unsendMessage: (id, threadID, cb) => { calls.push({ id, threadID }); cb && cb(null, {}); }
		};
		await command.onStart({
			api,
			message: { reply: () => { throw new Error("unsend must not reply"); } },
			event: { threadID: "t1", messageID: "evt", messageReply: { messageID: "botmsg", senderID: "42" } }
		});
		assert.strictEqual(calls.length, 1, "expected exactly one unsend");
		assert.strictEqual(calls[0].id, "botmsg");
		assert.strictEqual(calls[0].threadID, "t1");
	});

	await test("unsend: does nothing without a reply", async () => {
		const command = registry.resolve("unsend");
		let called = false;
		const api = { unsendMessage: () => { called = true; } };
		await command.onStart({
			api,
			message: { reply: () => { throw new Error("unsend must not reply"); } },
			event: { threadID: "t1", messageID: "evt" }
		});
		assert.strictEqual(called, false, "no reply target means no unsend");
	});

	await test("unsend: swallows a refused unsend without replying", async () => {
		const command = registry.resolve("unsend");
		const api = {
			unsendMessage: (id, threadID, cb) => { cb && cb(new Error("not your message")); }
		};
		await command.onStart({
			api,
			message: { reply: () => { throw new Error("unsend must not reply"); } },
			event: { threadID: "t1", messageID: "evt", messageReply: { messageID: "other", senderID: "99" } }
		});
	});

	/* ── adduser / removeuser ── */
	await test("adduser: registered with the Neoaz author", () => {
		const command = registry.resolve("adduser");
		assert.ok(command, "adduser should be registered");
		assert.strictEqual(command.config.author, "Neoaz 🐊");
		assert.strictEqual(command.config.role, 2);
	});

	await test("adduser: adds a numeric id to the current thread", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-adduser 555", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		assert.ok(api.calls.some(c => c.method === "addUserToThread" && c.uid === "555" && c.threadID === "t"));
		assert.ok(/555/.test(out), "expected a confirmation");
	});

	await test("adduser: resolves an @mention through the public profile", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(new Error("session handle lookup unsupported"));
		utils._resetUsernameCache();
		const original = utils.download;
		utils.download = async () => Buffer.from(JSON.stringify({ data: { user: { id: "777", username: "someone" } } }));
		const db = makeDatabase();
		try {
			await runCommand("-adduser @someone", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		}
		finally {
			utils.download = original;
		}
		assert.ok(api.calls.some(c => c.method === "addUserToThread" && c.uid === "777"), "expected the resolved mention id");
	});

	await test("adduser: falls back to the replied user", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		await runCommand("-adduser", { api, db, config: makeConfig(), extraEvent: { isGroup: true, messageReply: { senderID: "321", messageID: "o" } } });
		assert.ok(api.calls.some(c => c.method === "addUserToThread" && c.uid === "321"));
	});

	await test("adduser: refuses outside a group", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-adduser 555", { api, db, config: makeConfig() });
		assert.ok(/group/i.test(out));
		assert.ok(!api.calls.some(c => c.method === "addUserToThread"));
	});

	await test("adduser: unknown mention reports it", async () => {
		const api = fakeApi({ getUserInfo: (id, cb) => cb(null, {}) });
		const original = utils.download;
		utils.download = async () => Buffer.from(JSON.stringify({ data: {} }));
		const db = makeDatabase();
		let out;
		try {
			out = await runCommand("-adduser @ghost", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		}
		finally {
			utils.download = original;
		}
		assert.ok(/@ghost/.test(out));
	});

	await test("removeuser: registered with the Neoaz author", () => {
		const command = registry.resolve("removeuser");
		assert.ok(command, "removeuser should be registered");
		assert.strictEqual(command.config.author, "Neoaz 🐊");
		assert.strictEqual(command.config.role, 2);
	});

	await test("removeuser: removes the replied user from the thread", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-removeuser", { api, db, config: makeConfig(), extraEvent: { isGroup: true, messageReply: { senderID: "321", messageID: "o" } } });
		assert.ok(api.calls.some(c => c.method === "removeUserFromThread" && c.uid === "321" && c.threadID === "t"));
		assert.ok(/321/.test(out));
	});

	await test("removeuser: resolves an @mention and a numeric id", async () => {
		const api = fakeApi();
		const original = utils.download;
		utils._resetUsernameCache();
		api.getUserInfo = (id, cb) => cb(new Error("session handle lookup unsupported"));
		utils.download = async () => Buffer.from(JSON.stringify({ data: { user: { id: "888", username: "who" } } }));
		const db = makeDatabase();
		try {
			await runCommand("-removeuser @who", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		}
		finally {
			utils.download = original;
		}
		await runCommand("-removeuser 9999", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		assert.ok(api.calls.some(c => c.method === "removeUserFromThread" && c.uid === "888"));
		assert.ok(api.calls.some(c => c.method === "removeUserFromThread" && c.uid === "9999"));
	});

	/* ── ai ── */
	await test("ai: registered to NZ R with the ai alias", () => {
		const command = registry.resolve("ai");
		assert.ok(command, "ai should be registered");
		assert.strictEqual(command.config.author, "NZ R.");
		assert.strictEqual(command.config.category, "ai");
		assert.strictEqual(registry.resolve("ritchi"), command);
	});

	await test("ai: empty input asks for a message", async () => {
		const command = registry.resolve("ai");
		const out = await command.onStart({
			message: { reply: text => text },
			args: [],
			event: { senderID: "1", threadID: "t" },
			config: makeConfig()
		});
		assert.ok(/online|send a message/i.test(out));
	});

	await test("ai: 'clear' resets the session memory", async () => {
		const command = registry.resolve("ai");
		command._internal.sessions.set("t:1", { history: [{ role: "user", content: "hi" }], lastActive: Date.now(), lastBotMessageID: null, lastBotAt: 0 });
		const out = await command.onStart({
			message: { reply: text => text },
			args: ["clear"],
			event: { senderID: "1", threadID: "t" },
			config: makeConfig()
		});
		assert.ok(/cleared/i.test(out));
		assert.ok(!command._internal.sessions.has("t:1"));
	});

	await test("ai: answers, remembers and arms a reply handler", async () => {
		const command = registry.resolve("ai");
		command._internal.sessions.delete("t:2");
		const originalFetch = global.fetch;
		global.fetch = async url => ({
			ok: true,
			json: async () => String(url).includes("kilwa-claude")
				? { status: "success", reply: "Hey there!" }
				: { status: "success", reply: "love" }
		});
		const replies = [];
		let armed = null;
		try {
			await command.onStart({
				message: { reply: text => { replies.push(text); return { messageID: "bot1" }; }, typing: () => () => { }, react: () => { } },
				args: ["hello"],
				event: { senderID: "2", threadID: "t" },
				config: makeConfig(),
				setReplyHandler: (handler, id) => { armed = { handler, id }; }
			});
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(replies.some(r => /Hey there!/.test(r)), "expected the AI reply");
		const session = command._internal.sessions.get("t:2");
		assert.strictEqual(session.history.length, 2, "expected the exchange to be remembered");
		assert.strictEqual(armed && armed.id, "bot1", "expected a reply handler armed on the bot message");
	});

	await test("ai: reports a network failure without breaking memory", async () => {
		const command = registry.resolve("ai");
		command._internal.sessions.delete("t:3");
		const originalFetch = global.fetch;
		global.fetch = async () => ({ ok: false, status: 502 });
		const replies = [];
		try {
			await command.onStart({
				message: { reply: text => { replies.push(text); return {}; }, typing: () => () => { }, react: () => { } },
				args: ["hello"],
				event: { senderID: "3", threadID: "t" },
				config: makeConfig(),
				setReplyHandler: () => { }
			});
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(replies.some(r => /network/i.test(r)), "expected a friendly failure");
		const session = command._internal.sessions.get("t:3");
		assert.strictEqual(session.history.length, 0, "a failed turn must not be remembered");
	});

	/* ── help ── */
	await test("help: lists every category with a text effect", async () => {
		const command = registry.resolve("help");
		assert.ok(command, "help should be registered");
		let sent = null;
		const message = { send: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		await command.onStart({ message, args: [], config: makeConfig(), registry });
		const text = String(sent && sent.body);
		assert.ok(/INSTABOT/.test(text), "should name the bot");
		assert.ok(/INFO/.test(text), "should list the info category");
		assert.ok(/× -help/.test(text), "should list commands with the prefix");
		assert.ok(/➥× -/.test(text), "the ➥ icon should prefix the first command in each category");
		assert.ok(!/』 ➥/.test(text), "the icon must not sit on the category header");
		assert.ok(["love", "gift", "celebration", "fire"].includes(sent.effect), "should send with a random text effect");
	});

	await test("help: shows details for one command with a text effect", async () => {
		const command = registry.resolve("help");
		let sent = null;
		const message = { send: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		await command.onStart({ message, args: ["ping"], config: makeConfig(), registry });
		const text = String(sent && sent.body);
		assert.ok(/Name: ping/.test(text), "should name the command");
		assert.ok(/Usage: -ping/.test(text), "should render usage with the prefix");
		assert.ok(["love", "gift", "celebration", "fire"].includes(sent.effect), "should send with a random text effect");
	});

	await test("help: an unknown command is reported plainly", async () => {
		const command = registry.resolve("help");
		let sent = null;
		const message = { send: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		await command.onStart({ message, args: ["nope"], config: makeConfig(), registry });
		const text = String(sent && sent.body != null ? sent.body : sent);
		assert.ok(/not found/.test(text), "should report the missing command");
	});

	/* ── uptime ── */
	await test("uptime: registered and reports the running time", async () => {
		const command = registry.resolve("uptime");
		assert.ok(command, "uptime should be registered");
		const previous = global.instabotStartedAt;
		global.instabotStartedAt = Date.now() - (2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000);
		let sent = null;
		const message = { send: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		try {
			await command.onStart({ message, config: { botName: "InstaBOT" } });
		}
		finally {
			global.instabotStartedAt = previous;
		}
		const text = String(sent && sent.body);
		assert.ok(/INSTABOT/.test(text), "should name the bot");
		assert.ok(/2d 3h 4m/.test(text), "should show the elapsed time, got: " + text);
		assert.ok(/RUNTIME/.test(text), "should show the runtime section");
		assert.ok(/HOST/.test(text), "should show the host section");
		assert.ok(/MEMORY/.test(text), "should show the memory section");
		assert.ok(["love", "angry", "laugh", "cry"].includes(sent.avatarEffect), "should send with a random avatar effect");
	});

	await test("uptime: uses every avatar effect without repeating in a row", async () => {
		const command = registry.resolve("uptime");
		const seen = new Set();
		const message = { send: form => { seen.add(form.avatarEffect); return Promise.resolve({ messageID: "x" }); } };
		for (let i = 0; i < 40; i++) await command.onStart({ message, config: { botName: "InstaBOT" } });
		assert.ok(seen.size >= 2, "random choice should vary across calls, saw: " + [...seen].join(","));
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
				res.end(JSON.stringify({
					ok: true,
					result: req.url === "/cookies" ? { botId: "42", accepted: true } : "123"
				}));
			});
		});
		await new Promise(r => server.listen(0, "127.0.0.1", r));
		const port = server.address().port;
		try {
			const cookies = [
				{ key: "sessionid", value: "SID", domain: "instagram.com", path: "/" },
				{ key: "ds_user_id", value: "42", domain: "instagram.com", path: "/" }
			];
			const api = await auth({ server: "http://127.0.0.1:" + port, token: "t", cookies });
			assert.strictEqual(api.getCurrentUserID(), "123");
			const push = seen.find(s => s.url === "/cookies");
			assert.ok(push, "expected a POST /cookies");
			// The bot starts with no id, so the push must not claim one.
			assert.strictEqual(push.botId, undefined, "a fresh push must not carry X-Bot-Id");
			const parsed = JSON.parse(push.body);
			assert.ok(Array.isArray(parsed.cookies), "cookies must be sent as an array");
			const idx = seen.findIndex(s => s.url === "/cookies");
			const rpc = seen.findIndex(s => s.url === "/rpc");
			assert.ok(idx < rpc, "cookies must be pushed before the first RPC");
			// Later calls use the id the server reported.
			const rpcReq = seen[rpc];
			assert.strictEqual(rpcReq.botId, "42", "later calls must carry the adopted id");
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

	/* ── group detection, join/leave, avatar fallback ── */

	await test("normalizeEvent: infers a group from participantIDs", async () => {
		const event = normalizeEvent({ type: "message", threadID: "g", senderID: "5", body: "hi", participantIDs: ["1", "2", "5"] });
		assert.strictEqual(event.isGroup, true);
	});

	await test("normalizeEvent: keeps a DM a DM", async () => {
		const event = normalizeEvent({ type: "message", threadID: "d", senderID: "5", body: "hi" });
		assert.notStrictEqual(event.isGroup, true);
	});

	await test("normalizeEvent: maps action_log added_participants onto userIDs", async () => {
		const event = normalizeEvent({ type: "join", threadID: "g", isGroup: true, added_participants: ["77", "88"] });
		assert.deepStrictEqual(event.userIDs, ["77", "88"]);
	});

	await test("dispatcher: resolves a group thread when isGroup is missing", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		await runCommand("-adduser 555", { api, db, config: makeConfig(), extraEvent: { isGroup: undefined } });
		assert.ok(api.calls.some(c => c.method === "addUserToThread" && c.uid === "555"), "should treat the resolved group correctly");
	});

	await test("welcome event: greets a member added via action_log usernames", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "join", threadID: "g", isGroup: true,
			usernames: ["arobrifat"], userIDs: []
		});
		const bodies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.ok(bodies.some(b => /Welcome arobrifat/.test(b)), JSON.stringify(bodies));
	});

	await test("leave event: announces a member removed via action_log usernames", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "leave", threadID: "g", isGroup: true,
			usernames: ["arobrifat"], userIDs: []
		});
		const bodies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.ok(bodies.some(b => /arobrifat left/.test(b)), JSON.stringify(bodies));
	});

	await test("avatarEffect: sends the effect name so the server adds no sticker id", async () => {
		const calls = [];
		const api = fakeApi({
			sendAvatarTextEffect: (text, threadID, effect, cb) => { calls.push("avatar:" + effect); cb(null, { ok: true }); },
			sendTextEffect: () => { calls.push("text"); }
		});
		const message = createMessageContext({ api, event: { threadID: "d", messageID: "m", isGroup: false }, log });
		const result = await message.avatarEffect("hello", "laugh");
		assert.deepStrictEqual(result, { ok: true });
		assert.deepStrictEqual(calls, ["avatar:laugh"]);
	});

	await test("avatarEffect: surfaces a real failure instead of downgrading", async () => {
		const calls = [];
		const api = fakeApi({
			sendAvatarTextEffect: (text, threadID, effect, cb) => { calls.push("avatar"); cb(new Error("send failed")); },
			sendTextEffect: () => { calls.push("text"); }
		});
		const message = createMessageContext({ api, event: { threadID: "g", messageID: "m", isGroup: true }, log });
		await assert.rejects(message.avatarEffect("hello", "laugh"), /send failed/);
		assert.deepStrictEqual(calls, ["avatar"]);
	});

	await test("avatarfx: works in a group with no sticker configuration", async () => {
		const avatarfx = require(path.join(root, "commands/avatarfx"));
		const replies = [];
		const message = {
			reply: (text) => { replies.push(text); },
			avatarEffect: () => Promise.resolve({ ok: true })
		};
		await avatarfx.onStart({ message, args: ["laugh", "nice"] });
		assert.deepStrictEqual(replies, []);
	});

	/* ── long-run stability guards ── */

	await test("EventStream: a stream that opened but never sent a byte is stalled", () => {
		// A proxy can accept the request and hold the socket open while the
		// server never writes. Age the silence clock from the connect time so
		// the stall watch reconnects instead of hanging forever.
		const { EventStream } = require(path.join(root, "auth.js"));
		const stream = new EventStream({ base: new URL("http://127.0.0.1:1"), token: "t", botId: "b" }, () => { });
		stream.req = {};                                  // a socket is open
		stream.connectedAt = Date.now() - 200000;         // opened 200s ago
		stream.lastChunkAt = 0;                           // never delivered a byte
		assert.strictEqual(stream._isStalled(Date.now()), true, "must be stalled");

		// A healthy stream that just got a chunk is not stalled.
		stream.lastChunkAt = Date.now() - 1000;
		assert.strictEqual(stream._isStalled(Date.now()), false, "fresh data means healthy");

		// A stopped stream or one with no open socket is never acted on.
		stream.lastChunkAt = 0;
		stream.stop();
		assert.strictEqual(stream._isStalled(Date.now()), false, "a stopped stream must not reconnect");
	});

	await test("EventStream: timestamps reset per connection so a fresh socket is not killed", () => {
		const { EventStream } = require(path.join(root, "auth.js"));
		const stream = new EventStream({ base: new URL("http://127.0.0.1:1"), token: "t", botId: "b" }, () => { });
		let requested = null;
		// Intercept the http request so _connect runs without real I/O.
		const http = require("http");
		const original = http.request;
		http.request = () => ({ on() { }, end() { }, destroy() { } });
		try {
			stream.lastChunkAt = Date.now() - 10 * 60 * 1000; // stale from a prior socket
			stream.connectedAt = 0;
			stream._connect();
			requested = stream.connectedAt;
			assert.strictEqual(stream.lastChunkAt, 0, "lastChunkAt must reset for the new attempt");
			assert.ok(requested > 0 && Date.now() - requested < 5000, "connectedAt must be set to now");
		}
		finally {
			http.request = original;
			stream.stop();
		}
	});

	await test("status server: a throwing handler never crashes the process", async () => {
		const { createStatusServer } = require(path.join(root, "src/statusServer.js"));
		const server = createStatusServer({ port: 0, info: () => ({ ok: true }) });
		assert.strictEqual(server.enabled, false, "port 0 disables the server (pure worker mode)");
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
