# Insta Bot V1

An Instagram command bot that reads a local cookie file and sends that authentication to a private
chat API through the public client package. The cookie file is never committed.

## Authentication

```text
Insta-Bot-V1
        |
        | account.txt + API token
        v
Public chat client
        |
        | HTTPS + authenticated WebSocket
        v
Private chat API server
        |
        v
Instagram
```

The private server owns `nkxica`, `account.txt`, and `data/session.json`. Only allowlisted actions
and sanitized realtime events cross the API boundary.

## Requirements

- Node.js 20 or newer.
- A Netscape-format Instagram cookie export saved as `account.txt`.
- A running private chat API server and its bearer token.

## Configure

Place the cookie export in the project root and configure the private server URL/token:

```bash
cp /path/to/account.txt ./account.txt
CHAT_API_URL=https://nkx-ica.neokex.xyz
CHAT_API_TOKEN=the-token-configured-on-the-private-server
```

Set `adminIds` and `ownerId` in a local configuration file or environment-specific deployment
before enabling administrative commands. They are intentionally empty in the public example.

## Run

```bash
npm install
npm start
```

## Security

- Never commit `account.txt` or API tokens.
- Keep cookie exports out of issues, logs, and screenshots.
- Cookies are sent over HTTPS to the private server for that bot session; the server does not read a
  local cookie file or persist the cookie contents.
- Refresh the cookie file when Instagram reports an expired session.

## Commands

The command framework supports prefix commands, aliases, permissions, cooldowns, reply handlers,
reaction handlers, events, hot reload, and persistent bot state. The existing command set includes
help, identity, history, media, effects, user management, broadcasts, and diagnostics.

The bot uses `@lazyneoaz/insta-chat-client` to authenticate the private server session and route
realtime messaging.
