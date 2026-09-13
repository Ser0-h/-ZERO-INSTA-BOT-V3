<div align="center">

![InstaBOT](assets/banner.svg)

# InstaBOT

**A modular Instagram Direct chat bot powered by [`ig-chat-api`](https://github.com/lazyneoaz).**

Send text, music stickers, animated text effects, photos, audio and video — with prefix commands,
events, roles, cooldowns and pluggable custom commands.

[![MIT License](https://img.shields.io/badge/license-MIT-c13584)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D18-3ddc84)
![Tests](https://img.shields.io/badge/tests-45%20passing-3ddc84)

</div>

---

## Features

- **Prefix commands** with aliases, categories and per-command cooldowns
- **Roles** — user, box admin, bot admin — enforced by the dispatcher
- **Rich sending** — text, replies, reactions, unsend, typing indicator
- **Animated effects** — Instagram power-up text effects and avatar character effects
- **Music stickers** — search a song and attach it, with a pluggable music server
- **Media** — photos, audio and video from a URL, path, Buffer or stream (no temp files)
- **Events** — message, reply, reaction, plus `join` / `leave` welcome and goodbye messages
- **Custom commands & events** — drop files into `commands/` (`events/`) or load them at runtime with `cmd`
- **Command suggestions** — a typo like `-pign` gets a "Did you mean: -ping ?" hint
- **Ban / whitelist / admin-only** controls
- **Online journal** — one JSON line per interval so you can watch uptime
- **No dashboard, no database server** — just JSON files and a cloud-friendly runtime

---

## Quick start

InstaBOT does **not** log in to Instagram itself. It connects to your deployed
**ig-chat-api-server** over HTTP + SSE, so you only need that server's URL and token
(never local cookies, never a local login).

```bash
# 1. Install dependencies (none required at runtime)
npm install

# 2. Point the bot at your deployed server. Set both values in config.json:
#      "server": {
#        "url":   "https://<your-server-host>",   # e.g. the Render/Railway URL
#        "token": "<IG_TOKEN from the server>"    # must match the server's IG_TOKEN
#      }
#    Or set the environment variables IG_API_SERVER and IG_API_TOKEN.

# 3. Adjust prefix / adminBot / language in config.json

# 4. Run
npm start

# 5. Optional: run the test suite
npm test
```

> Node 18 or newer. **The bot needs the deployed server URL and token — not the
> local `http://127.0.0.1:8787` one.** `config.json` ships with the local URL as a
> development placeholder; replace it with your deployed URL before running.
>
> Deploy the server first (see
> [`ig-chat-api-server`](https://github.com/lazyneoaz/ig-chat-api-server)), which
> prints its URL after deploy and takes `IG_TOKEN` + `IG_COOKIES` as environment
> variables.

---

## Deploy to Render / Railway

A `Dockerfile` is included. Both platforms can build it directly:

- **Render:** *New → Web Service* → connect this repo → Environment: **Docker** →
  set `IG_API_SERVER` and `IG_API_TOKEN` → deploy.
- **Railway:** *New Project → Deploy from GitHub* → it detects the `Dockerfile` →
  set `IG_API_SERVER` and `IG_API_TOKEN` in Variables.

| Variable | Required | Meaning |
| --- | --- | --- |
| `IG_API_SERVER` | ✅ | Deployed ig-chat-api-server URL (e.g. `https://ig-server.onrender.com`) |
| `IG_API_TOKEN` | ✅ | Must equal the server's `IG_TOKEN` |

---

## Login

InstaBOT connects to a **remote ig-chat-api-server** with a URL + token. Cookies
live on the server, so the bot never touches `account.txt`.

### Mode A — Remote server (recommended, deployed)

Set both values (or the environment fallbacks) and the bot is ready:

```json
"server": {
  "url": "https://<your-server-host>",
  "token": "<IG_TOKEN from the server>",
  "timeout": 60000
}
```

Environment fallbacks: `IG_API_SERVER` and `IG_API_TOKEN`.

```bash
IG_API_SERVER="https://<your-server-host>" \
IG_API_TOKEN="<IG_TOKEN from the server>" \
npm start
```

Example (replace with your real deploy):

```
IG_API_SERVER=https://ig-chat-api-server.onrender.com
IG_API_TOKEN=<the same long secret you set as the server's IG_TOKEN>
```

### Mode B — Direct (cookies, local development only)

> **Requires the private `ig-chat-api` package.** It is not on the public npm
> registry, so `npm install` will not fetch it. Obtain it from the maintainer and
> place it in `node_modules/ig-chat-api` (or add a local `file:` dependency in
> `package.json`). Without it, leave `server.url`/`server.token` empty only if you
> intend to see a clear startup error. **Mode A (remote server) is the supported
> deployment and needs no local package.**

The bot ships with `account.txt` for pasting your Instagram cookies — open it,
replace the placeholder line with your cookies, and save. Leave
`server.url`/`server.token` empty in `config.json` to run in this direct mode.
Cookie formats accepted:

**JSON array**

```json
[
  { "key": "sessionid", "value": "…", "domain": "instagram.com", "path": "/" },
  { "key": "ds_user_id", "value": "…", "domain": "instagram.com", "path": "/" },
  { "key": "csrftoken", "value": "…", "domain": "instagram.com", "path": "/" }
]
```

**Cookie header string**

```
sessionid=…; ds_user_id=…; csrftoken=…
```

**Netscape file** — export from the *Cookie-Editor* browser extension.

`sessionid` and `ds_user_id` are required. `account.txt` ships with the project
and holds your cookies — keep it private and never push your real cookies.

The bridge is `auth.js` at the project root. It is signature-compatible with the direct
`ig-chat-api` login, so commands work identically: calls travel to the server over HTTP (RPC) and
realtime events arrive over Server-Sent Events (SSE). Media (path, Buffer, stream or URL) is read
locally and streamed to the server as bytes.

> The server URL and token are the deployed ones, never `http://127.0.0.1:8787`. The local URL in
> `config.json` is only a placeholder for developing the server on the same machine.

---

## Configuration

`config.json` is JSON with comments allowed as plain string fields (see `notes` keys).

| Key | What it does |
| --- | --- |
| `botName` | Name shown in notices |
| `prefix` | Command prefix, e.g. `-` |
| `language` | UI language (`en`) |
| `adminBot` | Array of user IDs with bot-admin rights |
| `env.token` / `env.url` | Optional secrets/endpoints; overridden by the environment |
| `server.url` / `server.token` | Connect to a remote ig-chat-api server (skips cookies) |
| `server.timeout` | Server request timeout in ms |
| `music.enable` | Turn the `sing` music search on/off |
| `music.apiUrl` / `music.apiToken` | Your own music server (blank = use Instagram's catalogue) |
| `account.proxy` / `account.userAgent` | Optional HTTP(S) proxy and UA |
| `adminOnly` | Restrict the bot to admins |
| `whiteList` | Restrict which users/threads can use the bot |
| `cooldown.default` | Default seconds between a user's commands |
| `onlineStatus` | JSON-line uptime journal |
| `database.dir` | Folder for the JSON user/thread store |

### Environment variables (optional)

Anything left blank in `config.json` can be supplied by the environment — handy for containers:

```
INSTABOT_TOKEN=…   # or TOKEN
INSTABOT_URL=…     # or URL
```

Values in `config.json` take precedence.

### Music server

Set `music.apiUrl` to your own search endpoint. `{query}` is replaced with the song text, otherwise
`?query=` is appended. The response may be `{ tracks: [] }`, `{ results: [] }`, `{ data: [] }` or a
bare array; each entry needs at least an audio cluster/asset id plus a title.

```json
"music": {
  "enable": true,
  "apiUrl": "https://music.example.com/search?q={query}",
  "apiToken": "your-token"
}
```

---

## Commands

| Command | Aliases | Role | Description |
| --- | --- | --- | --- |
| `help` | `h`, `menu` | user | List commands and usage |
| `ping` | `pong` | user | Online / latency check |
| `uid` | `id` | user | Show user / thread ID |
| `info` | `stats`, `about` | user | Bot stats and uptime |
| `echo` | `say` | user | Repeat text |
| `effect` | `fx` | user | Power-up text effect |
| `avatarfx` | `avfx`, `avatar-effect` | user | Avatar character effect |
| `sing` | `music`, `song` | user | Search and send a music sticker |
| `img` | `image`, `sendimg` | user | Send an image by URL |
| `joke` | `dadjoke` | user | Random joke |
| `admin` | `adminbot` | bot admin | Add / remove / list bot admins |
| `ban` | `unban` | bot admin | Ban or unban a user |
| `whitelist` | `wl` | bot admin | Manage the whitelist |
| `prefix` | `setprefix` | bot admin | Change the prefix |
| `avatar` | `setavatar`, `setavt` | bot admin | Change the bot avatar |
| `bio` | `setbio`, `biography` | bot admin | Change the bot bio |
| `cmd` | `command` | bot admin | Load / unload / reload / list custom commands |
| `eval` | `ev`, `js` | bot admin | Evaluate JavaScript |
| `shell` | `exec`, `sh`, `terminal` | bot admin | Run a shell command |

### Examples

```
-effect fire Hello world
-avatarfx laugh That was funny
-sing blinding lights
-sing 2              # send result #2 from the last search
```

### No-prefix commands

A few commands work **without** the prefix so you can never lock yourself out:

- `prefix` — show the current prefix, or `prefix !` to change it.
- The bot-admin commands (`admin`, `ban`, `prefix`, `whitelist`, `cmd`, `avatar`, `bio`, `eval`,
  `shell`) also run without the prefix for **bot admins only**. Normal users still need the prefix.

```
prefix            # -> "The current prefix is `-`."
prefix !          # -> "Prefix changed to `!`."
```

Any command can opt in by adding `noPrefix: true` to its `config`. Add `noPrefixRole: 0` too if you
want everyone (not just bot admins) to use it without the prefix.

---

## Custom commands & events

Drop a `.js` file straight into `commands/` (or `events/`) and it is loaded on start — no config, no
sub-folder. You can also manage them live with `cmd`.

```text
InstaBOT/
├─ commands/            <- put your own command files here
│  ├─ ping.js
│  ├─ sing.js
│  └─ mycommand.js      <- just add a file
└─ events/              <- event scripts (message, join, leave, ...)
```

**Scaffold a command**

```
-cmd template          # prints a starter command
-cmd template event    # prints a starter event
```

**Manage at runtime**

```
-cmd list              # show loaded commands and events
-cmd load mycommand    # load commands/mycommand.js (commands/ is the default)
-cmd reload mycommand  # reload after editing
-cmd unload mycommand  # remove it from the registry
-cmd load myevent --event
```

A command module looks like this:

```js
module.exports = {
  config: {
    name: "hello",
    aliases: ["hi"],
    author: "Neoaz 🐊",
    category: "custom",
    cooldown: 3,
    role: 0,
    description: { en: "Say hello" },
    usage: { en: "{p}hello <name>" }
  },

  onStart: async function ({ message, args, event, api, usersData, config }) {
    return message.reply(`Hello ${args.join(" ") || "there"}!`);
  }
};
```

**Full example — a `roll` command with a reply handler**

Create `commands/roll.js` (there is a ready-made copy in the repo), then load it with `-cmd load roll`
(or just restart — files in `commands/` load on boot). It rolls a dice and lets you reply `pick <n>` to save a favourite number.

```js
module.exports = {
  config: {
    name: "roll",
    aliases: ["dice"],
    author: "you",
    category: "custom",
    cooldown: 3,
    role: 0,
    description: { en: "Roll a dice and remember a favourite number" },
    usage: { en: "{p}roll [sides]" }
  },

  onStart: async function ({ message, args, event, usersData, setReplyHandler }) {
    const sides = Number(args[0]) > 1 ? Math.floor(Number(args[0])) : 6;
    const value = 1 + Math.floor(Math.random() * sides);

    // Ask the user to reply to THIS message so we can catch their answer.
    const sent = await message.reply(`Rolled a d${sides}: ${value}\nReply "pick <n>" to save a favourite.`);

    setReplyHandler(async ({ event: replyEvent, message: replyMessage }) => {
      const [action, n] = String(replyEvent.body || "").trim().split(/\s+/);
      if (action !== "pick" || !/^\d+$/.test(n)) return;
      const data = (usersData.get(replyEvent.senderID) || {}).data || {};
      usersData.update(replyEvent.senderID, { data: Object.assign({}, data, { favourite: Number(n) }) });
      await replyMessage.reply(`Saved your favourite number: ${n}`);
    }, sent && sent.messageID);
  }
};
```

Two things to note in that example:

- `setReplyHandler(handler, sent.messageID)` — always pass the message the user must reply to
  (`sent.messageID`). Without it the handler listens on the command message itself and your reply
  will never match.
- `usersData.get(id)` / `usersData.update(id, patch)` — simple per-user JSON storage for persistence.

Every command receives: `api`, `message`, `event`, `args`, `commandName`, `role`, `usersData`,
`threadsData`, `userData`, `threadData`, `config`, `registry`, `setReplyHandler` and
`setReactionHandler`.

The `message` helper exposes:

| Method | Description |
| --- | --- |
| `message.send(form)` | Send to the thread |
| `message.reply(form)` | Reply to the triggering message |
| `message.unsend(id?)` | Remove a message for everyone |
| `message.react(emoji, id?)` | React to a message |
| `message.effect(text, style)` | Animated power-up text effect |
| `message.avatarEffect(text, style)` | Avatar character effect |
| `message.music(track)` | Attach a music sticker |
| `message.musicSearch(query)` | Search the music catalogue |
| `message.typing()` | Typing indicator (returns a stop function) |

`form` may be a string or `{ body, attachment, url, effect, avatarEffect }`. Attachments are routed
to image/audio/video automatically and accept a URL, path, Buffer or stream.

### Events

An event module declares `eventType` and defines `onEvent`:

```js
module.exports = {
  config: { name: "onMessage", eventType: "message", category: "system" },
  onEvent: async function ({ api, event, message, config }) {
    // runs for every matching event
  }
};
```

Available `eventType` values: `message`, `message_reply`, `message_reaction`, `message_unsend`,
`read_receipt`, `typ`, `join` and `leave`.

### Welcome & leave messages

InstaBOT ships two event scripts, `events/onJoin.js` and `events/onLeave.js`, that greet people
added to a group and say goodbye when someone leaves. Configure them in `config.json`:

```json
"welcome": {
  "enable": true,
  "message": "Welcome %1 to %2! 👋",
  "threadIDs": []
},
"leave": {
  "enable": true,
  "message": "%1 left %2. 👋",
  "threadIDs": []
}
```

- `%1` is the member, `%2` is the thread name (both resolved automatically).
- Leave `threadIDs` empty to announce in every group; list thread IDs to limit it.
- Set `enable` to `false` to turn either one off.

```
Welcome Alice to Test Group! 👋
Alice left Test Group. 👋
```

---

## Project layout

```
InstaBOT/
├─ index.js              banner + start
├─ auth.js               remote ig-chat-api server bridge (token + url)
├─ Dockerfile            container image for Render / Railway
├─ config.json           bot settings (server.url + server.token live here)
├─ account.txt           Instagram cookies — paste yours here (direct mode)
├─ assets/banner.svg     animated README banner
├─ src/
│  ├─ bot.js             login · listener · reconnect
│  ├─ dispatcher.js      prefix · roles · cooldowns · handlers
│  ├─ message.js         send/reply/react/media/effect/music
│  ├─ commandLoader.js   validates & loads scripts
│  ├─ config.js          config + cookie parsers
│  ├─ database.js        JSON store (users/threads)
│  ├─ onlineStatus.js    JSON-line online journal
│  ├─ languages.js       language helper
│  ├─ utils.js           helpers (mediaKind, …)
│  └─ logger.js          colored console logger
├─ commands/             commands (drop your own .js files here)
├─ events/               event scripts (message, reaction, join, leave, …)
├─ custom/               legacy location for extra commands/events (optional)
├─ languages/en.js       strings
└─ test/                 unit tests + live send test
```

---

## Testing

```bash
npm test                      # 45 unit tests, no credentials needed
node test/live-send.js <tid>  # sends real DMs through the configured server
```

The unit suite mocks the API, so it runs anywhere. `live-send.js` performs a real text effect,
avatar effect, music search and music sticker send, and writes `instabot-live-send.json` with the
result. It uses `config.server.url` + `config.server.token` when set, otherwise local cookies.

---

## Security notes

- `eval` and `shell` run arbitrary code on the host. They are **bot-admin only** and the bot admin
  list lives in `config.json` — keep it private. Prefer to disable or remove them for untrusted use.
- `account.txt` ships with a placeholder — paste your real cookies into it and keep it private.
  Never commit or share your real cookies.
- Never commit the server token. Keep it in the environment (`IG_API_TOKEN`), not in `config.json`.

---

## License

MIT © [Saifullah Al Neoaz](https://github.com/lazyneoaz)
