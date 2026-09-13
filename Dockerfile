# InstaBOT — production image for Render / Railway / any container host.
#
# The bot has no npm dependencies of its own: it talks to the private
# ig-chat-api-server over HTTP + SSE, so both config.server.url and
# config.server.token (or IG_API_SERVER / IG_API_TOKEN) must be provided.
FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

# No committed lockfile: npm install generates node_modules inside the image.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY . .

# Persisted JSON store and uptime journal live under data/.
RUN mkdir -p data && chown -R node:node /app
USER node

CMD ["node", "index.js"]
