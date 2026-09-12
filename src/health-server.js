'use strict';

const http = require('node:http');

async function startHealthServer({ bot, host = '0.0.0.0', port = Number(process.env.PORT) || 10000 } = {}) {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    if (request.method === 'GET' && ['/', '/health', '/healthz'].includes(pathname)) {
      const status = bot?.stopping
        ? 'stopping'
        : bot?.started ? 'ready' : 'waiting-for-chat-api';
      sendJson(response, 200, { ok: true, service: 'insta-bot-v1', status });
      return;
    }
    sendJson(response, 404, { error: 'Not found', code: 'NOT_FOUND' });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const listeningPort = typeof address === 'object' && address ? address.port : port;
  return {
    port: listeningPort,
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
      server.closeIdleConnections?.();
    })
  };
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

module.exports = { startHealthServer };
