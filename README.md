# Insta Bot V1

An Instagram command bot that authenticates directly with a local cookie file.
The cookie file and generated session are ignored by Git.

## Authentication

```text
Insta-Bot-V1
        |
        | account.txt cookie file
        v
Instagram
```

The private server owns `nkxica`, `account.txt`, and `data/session.json`. Only allowlisted actions
and sanitized realtime events cross the API boundary.

## Requirements

- Node.js 20 or newer.
- A Netscape-format Instagram cookie export saved as `account.txt`.

## Configure

Place the cookie export in the project root:

```bash
cp /path/to/account.txt ./account.txt
```

Set `adminIds` and `ownerId` in a local configuration file or environment-specific deployment
before enabling administrative commands. They are intentionally empty in the public example.

## Run

```bash
npm install
npm start
```

## Security

- Never commit `account.txt` or `data/session.json`.
- Keep cookie exports out of issues, logs, and screenshots.
- Refresh the cookie file when Instagram reports an expired session.

## Commands

The command framework supports prefix commands, aliases, permissions, cooldowns, reply handlers,
reaction handlers, events, hot reload, and persistent bot state. The existing command set includes
help, identity, history, media, effects, user management, broadcasts, and diagnostics.

The bot uses `@neoaz07/nkxica` directly for cookie authentication and realtime messaging.
