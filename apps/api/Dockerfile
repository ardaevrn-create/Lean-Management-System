# API imajı (Railway, Render veya herhangi bir Docker ortamı). Build context: depo kökü.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter "@lean/api..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @lean/shared build \
 && pnpm --filter @lean/api exec prisma generate \
 && pnpm --filter @lean/api build

ENV NODE_ENV=production
WORKDIR /app/apps/api
CMD ["sh", "./docker-start.sh"]
