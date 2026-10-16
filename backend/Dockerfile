FROM node:24-bookworm-slim AS build

WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate --schema prisma/schema.prisma
RUN npm run build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 4320
# Aplica las migraciones pendientes y arranca. Las migraciones son idempotentes.
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/main.js"]
