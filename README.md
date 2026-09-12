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

Insta Bot V1 provides command routing, role-based permissions, persistent bot state, media utilities, music tools, and resilient Chat API session recovery.

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

## Configuration

Set the owner and bot administrators in `config.json`:

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
| `stickermusic` | Everyone | `!stickermusic <search>` |
| `sing` | Everyone | `!sing <search>` |
| `setprofile` | Owner | `!setprofile <public image URL>` or reply to an image |
| `eval` | Owner | `!eval <JavaScript>` |
| `shell` | Owner | `!shell <command>` |
| `cmd` | Owner | `!cmd <action>` |

Aliases are available through `!help <command>`.

## Permissions

- User: commands available to everyone
- Group admin: group-management commands
- Bot admin: bot administration commands
- Owner: account and owner-only commands

## Security

Never commit `account.txt`, `.env`, Instagram cookies, Chat API tokens, or other credentials.

## Related Projects

- [Chat API client](https://github.com/lazyneoaz/Insta-Chat-API-Client)
- [Private Chat API server](https://github.com/lazyneoaz/Insta-Chat-API-Server)

## License

See [LICENSE](./LICENSE).
