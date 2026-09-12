# Insta Bot V1

An Instagram command bot that connects to a separately hosted private chat API.
The public bot does not contain the Instagram protocol client, cookies, or session files.

## Architecture

```text
Public Insta-Bot-V1
        |
        | HTTPS + authenticated WebSocket
        v
Private Insta-Chat-API-Server
        |
        | private Instagram session and MQTT/API client
        v
Instagram
```

The private server owns `nkxica`, `account.txt`, and `data/session.json`. Only allowlisted actions
and sanitized realtime events cross the API boundary.

## Requirements

- Node.js 20 or newer.
- A running private `Insta-Chat-API-Server`.
- The server URL and bearer token in environment variables.

## Configure

Set these variables before starting the public bot:

```bash
CHAT_API_URL=https://your-private-chat-api.example.com
CHAT_API_TOKEN=the-same-random-token-used-by-the-private-server
```

Set `adminIds` and `ownerId` in a local configuration file or environment-specific deployment
before enabling administrative commands. They are intentionally empty in the public example.

## Run

```bash
npm install
npm start
```

## Security

- Never put Instagram cookies in this repository.
- Never put `CHAT_API_TOKEN` in `config.json`, source code, issues, or logs.
- Keep the private server repository and its `vendor/` directory private.
- Use HTTPS for the private server URL.
- Rotate the API token if it is ever exposed.

## Commands

The command framework supports prefix commands, aliases, permissions, cooldowns, reply handlers,
reaction handlers, events, hot reload, and persistent bot state. The existing command set includes
help, identity, history, media, effects, user management, broadcasts, and diagnostics.

## Related packages

- `@lazyneoaz/insta-chat-client`: public npm client used by this bot.
- `Insta-Chat-API-Server`: private service that stores the Instagram session and talks to Instagram.
