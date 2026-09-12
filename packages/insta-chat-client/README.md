# Insta Chat Client

This package is the public, authenticated client for a separately hosted private chat API server.
It contains no Instagram cookies, session files, or Instagram protocol implementation.

```js
const { createClient } = require('@lazyneoaz/insta-chat-client');

const api = createClient({
  baseUrl: process.env.CHAT_API_URL,
  token: process.env.CHAT_API_TOKEN
});

await api.listen((error, event) => {
  if (error) return console.error(error);
  console.log(event.type, event.threadID);
});

await api.sendMessage('Hello', 'thread-id');
```

The server token is a bearer credential. Keep it in an environment variable and never commit it.
