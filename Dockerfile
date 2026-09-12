FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

# package-lock.json is intentionally excluded from the build context.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . ./

EXPOSE 10000

CMD ["node", "nkx.js"]
