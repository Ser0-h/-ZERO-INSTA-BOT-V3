# Insta Bot V1

Modular Instagram command bot using the private Chat API.

## Requirements

- Node.js 20 or newer
- A Netscape-format Instagram cookie export
- Access to the configured Chat API

## Setup

```bash
git clone https://github.com/lazyneoaz/InstaBot-V1.git
cd InstaBot-V1
npm install
cp .env.example .env
```

Place the cookie export at `./account.txt` and start the bot:

```bash
node nkx.js
```

Never commit `account.txt`, `.env`, cookies, or API tokens.

## Configuration

Set administrative access in `config.json`:

```json
{
  "ownerId": "your-instagram-user-id",
  "adminIds": ["bot-admin-user-id"],
  "allowThreadAdmins": true
}
```

Common environment variables:

| Variable | Purpose |
| --- | --- |
| `ACCOUNT_FILE` | Cookie export path override |
| `CHAT_API_URL` | Private Chat API URL |
| `CHAT_API_TOKEN` | Private Chat API token |
| `PORT` | Health endpoint port |

## Commands

| Command | Permission | Usage |
| --- | --- | --- |
| `help` | Everyone | `!help [command]` |
| `pfp` | Everyone | `!pfp [@username|user-id]` or reply to a message |
| `id` | Everyone | `!id [@username]` or reply to a message |
| `tid` | Everyone | `!tid` |
| `info` | Everyone | `!info` |
| `stats` | Everyone | `!stats` |
| `uptime` | Everyone | `!uptime` |
| `health` | Everyone | `!health` |
| `adduser` | Group admins | `!adduser <user-id|@username> ...` |
| `removeuser` | Group admins | `!removeuser <user-id|@username> ...` |
| `changename` | Group admins | `!changename <new name>` |
| `welcome` | Group admins | `!welcome on|off` |
| `leave` | Group admins | `!leave on|off` |
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

## Links

- [Bot source](https://github.com/lazyneoaz/InstaBot-V1)
- [Chat API client](https://github.com/lazyneoaz/Insta-Chat-API-Client)

## License

See [LICENSE](./LICENSE).
