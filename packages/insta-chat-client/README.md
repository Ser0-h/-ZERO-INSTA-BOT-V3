# Insta Chat Client

This package is the public client for a separately hosted private chat API server. It accepts the
bot's local Instagram cookie export, sends it over HTTPS to the private server, and keeps the
authenticated session in memory for that client instance.

```js
const { createClient } = require('@lazyneoaz/insta-chat-client');

const api = createClient({
  baseUrl: process.env.CHAT_API_URL,
  token: process.env.CHAT_API_TOKEN,
  cookies: process.env.INSTAGRAM_COOKIES
});

await api.listen((error, event) => {
  if (error) return console.error(error);
  console.log(event.type, event.threadID);
});

await api.sendMessage('Hello', 'thread-id');
```

The server token is a bearer credential. Keep it in an environment variable and never commit it.
Cookie contents are sent only to the configured HTTPS API server and are not written to disk by
this package.

## Publish

From the package directory, sign in to npm and run:

```bash
npm publish --access public
```

If the `@lazyneoaz` npm scope is not yours, change the package name before publishing.
