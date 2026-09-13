<p align="center">
  <img src="./assets/insta-bot-banner.svg" alt="Insta Bot V1 banner" width="920">
</p>

<h1 align="center">Insta Bot V1</h1>

<p align="center">A modular Instagram command bot powered by the private NEOKEX Chat API.</p>

<p align="center">
  <a href="https://github.com/lazyneoaz/InstaBot-V1">
    <img src="https://img.shields.io/badge/View-Repository-111827?style=for-the-badge&logo=github&logoColor=white" alt="View repository">
  </a>
  <a href="https://github.com/lazyneoaz/InstaBot-V1/network/members">
    <img src="https://img.shields.io/github/forks/lazyneoaz/InstaBot-V1?style=for-the-badge&label=Fork" alt="Fork repository">
  </a>
  <a href="https://github.com/lazyneoaz/InstaBot-V1/issues">
    <img src="https://img.shields.io/github/issues/lazyneoaz/InstaBot-V1?style=for-the-badge&label=Issues" alt="Open issues">
  </a>
</p>

## Overview

Insta Bot V1 provides command routing, role-based permissions, persistent bot state, media utilities, and resilient Chat API session recovery.

## Requirements

- Node.js 20 or newer
- A Netscape-format Instagram cookie export
- Access to the private Chat API

## Quick Start

```bash
git clone https://github.com/lazyneoaz/InstaBot-V1.git
cd InstaBot-V1
npm install
cp .env.example .env
node nkx.js
```

Place the cookie export at `./account.txt`, or set `ACCOUNT_FILE` in `.env`.
The bot checks the file before it connects and refuses to start if it is empty
or missing the required Instagram cookies (`sessionid`, `ds_user_id`,
`csrftoken`), so a stale export fails immediately instead of triggering repeated
failed logins.

## Configuration

Set the owner and bot administrators in `config.json`, or override them in the
environment (recommended, so a real account ID is never committed):

```json
{
  "ownerId": "your-instagram-user-id",
  "adminIds": ["bot-admin-user-id"],
  "allowThreadAdmins": true
}
```

| Variable | Purpose |
| --- | --- |
| `ACCOUNT_FILE` | Instagram cookie export path |
| `OWNER_ID` | Instagram user ID of the bot owner (overrides `config.json`) |
| `ADMIN_IDS` | Comma-separated Instagram user IDs for admins (added to `config.json`) |
| `CHAT_API_URL` | Chat API URL |
| `CHAT_API_TOKEN` | Private Chat API bearer token |
| `PORT` | Health endpoint port |

### Promotional Access

The Chat API URL is:

```text
https://nkx-ica.neokex.xyz
```

The public promotional Chat API token is:

```text
chat.api.toke.neokex.ica.token.can.change.a9y.2ime.ok
```

## Commands

| Command | Permission | Usage |
| --- | --- | --- |
| `help` | Everyone | `!help [command]` |
| `pfp` | Everyone | `!pfp [@username\|user-id]` or reply to a message |
| `id` | Everyone | `!id [@username]` or reply to a message |
| `tid` | Everyone | `!tid` |
| `info` | Everyone | `!info` |
| `stats` | Everyone | `!stats` |
| `uptime` | Everyone | `!uptime` |
| `health` | Everyone | `!health` |
| `adduser` | Group admins | `!adduser <user-id\|@username> ...` |
| `removeuser` | Group admins | `!removeuser <user-id\|@username> ...` |
| `changename` | Group admins | `!changename <new name>` |
| `welcome` | Group admins | `!welcome on\|off` |
| `leave` | Group admins | `!leave on\|off` |
| `setprofile` | Owner | `!setprofile <public image URL>` or reply to an image |
| `eval` | Owner | `!eval <JavaScript>` |
| `shell` | Owner | `!shell <command>` |
| `cmd` | Owner | `!cmd <action>` |

Aliases are available through `!help <command>`.

## Writing commands and events

The bot follows the Goatbot-V2 module contract. A module lives in `scripts/cmds`
(commands) or `scripts/events` (event commands) and exports a `config` plus one
or more hooks:

```js
const { getStreamFromURL } = global.utils;

module.exports = {
  config: { name: 'example', aliases: ['ex'], author: 'Saifullah Al Neoaz (NEOKEX)', category: 'general' },
  async onStart({ api, args, event, message, threadID, prefix }) { ... },
  async onChat({ event, message }) { ... },
  async onReply({ Reply, event, message }) { ... },
  async onReaction({ Reaction, event, message }) { ... },
  async onEvent({ event, message }) { ... },
  async onAnyEvent({ event }) { ... }
};
```

Lifecycle hooks `onLoad` and `onUnload` run when commands are (re)loaded. Hooks
receive a context with `api`, `config`, `store`, `event`, `args`, `message`,
`getLang`, `role`, `roleName`, `threadID`, `prefix`, `commandName`,
`removeCommandNameFromBody`, and `functions`/`utils` (the same object as
`global.utils`).

### Reply handlers

Reply handlers follow the Goatbot contract. Register with the global Map and read
your data back from `Reply`:

```js
module.exports = {
  config: { name: 'choose', author: 'Saifullah Al Neoaz (NEOKEX)' },
  async onStart({ message, event }) {
    const info = await message.reply('Pick a number from 1 to 3');
    global.NkxBot.onReply.set(info.messageID, {
      commandName: 'choose',
      messageID: info.messageID,
      author: event.senderID,
      choices: ['a', 'b', 'c'] // custom data is preserved on Reply
    });
  },
  async onReply({ Reply, event, message }) {
    const picked = Reply.choices[Number(event.body) - 1];
    Reply.delete(); // removes the handler
    return message.reply(picked ? `You picked ${picked}` : 'Not an option.');
  }
};
```

The same store is reachable as `global.GoatBot.onReply` and `global.InstaBot.onReply`.
Alternatively, `message.setReply(handlerOrData, ttlMs, messageID)` registers
directly from inside a command; passing an object stores that data and runs the
command's `onReply` hook. Only the `author` who registered the handler may trigger
it.

### Global functions

`global.utils` exposes the Goatbot utility surface, available in every command
and event without importing anything:

| Area | Functions |
| --- | --- |
| Streams | `getStreamFromURL` (alias `getStreamFromUrl`), `getStreamsFromAttachment`, `downloadFile` |
| Extensions | `getExtFromUrl`, `getExtFromMimeType`, `getExtFromAttachmentType` |
| Types & numbers | `getType`, `isNumber`, `isHexColor`, `randomString`, `randomNumber`, `formatNumber`, `convertTime` |
| Formatting | `getTime`, `splitPage`, `jsonStringifyColor`, `removeHomeDir`, `colors`, `log` |
| Network | `translate`, `translateAPI`, `shortenURL` |
| Messaging | `message(api, event)` helpers |

```js
const { getStreamFromURL, downloadFile, convertTime } = global.utils;
const stream = await getStreamFromURL('https://example.com/clip.mp4');
await downloadFile('https://example.com/a.png', './downloads/a.png');
```

## Permissions

- User: commands available to everyone
- Group admin: group-management commands
- Bot admin: bot administration commands
- Owner: account and owner-only commands

## Security

Never commit `account.txt`, `.env`, Instagram cookies, Chat API tokens, or other credentials.

## Staying below Instagram's automation radar

The bot is built so the account behaves like a person using Instagram, not like
a script. If you change any of the following, understand what you are giving up:

- **One Instagram login per cookie set.** The server keeps a single live
  session per account and reuses it when the bot reconnects, so a dropped socket
  never triggers a fresh Instagram login. Repeated logins are the fastest way to
  get an account challenged, so do not restart the bot in a loop.
- **Conservative request pacing.** The server serializes provider requests and
  enforces a minimum delay between them (`INSTAGRAM_MIN_REQUEST_DELAY_MS`,
  default 1500 ms) with `safeMode` on. Lowering this makes bursts of activity
  look automated.
- **No noisy presence signals.** Online presence, delivery receipts, typing
  indicators and read receipts are off by default. A command only shows a typing
  indicator if it asks for one explicitly.
- **No unsolicited messages.** `autoReply` is off (the bot never greets people
  on its own), and the bot ignores its own messages so it cannot reply to
  itself. Set `autoReply: true` only if you really want greeting replies.
- **Human-speed command use.** Commands have a per-command cooldown
  (`commandCooldownMs`). Running the same command at machine speed is a clear
  automation signal.
- **Valid cookies or nothing.** The bot validates `account.txt` before
  connecting and refuses to start with missing/expired cookies, so it never
  retries a failed login in a loop.

If Instagram ever shows a challenge or `login_required`, stop the bot, open
Instagram yourself and clear the challenge, then export fresh cookies. Do not
retry automatically.

## Related Projects

- [Chat API client](https://github.com/lazyneoaz/Insta-Chat-API-Client)
- [Private Chat API server](https://github.com/lazyneoaz/Insta-Chat-API-Server)

## License

See [LICENSE](./LICENSE).
