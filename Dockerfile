FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . ./

EXPOSE 10000

CMD ["node", "nkx.js"]
