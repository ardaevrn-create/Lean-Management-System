# Web imajı (Next.js). Build context: depo kökü. API ayrı konteynerde çalışır; istekler API_ORIGIN'e aktarılır.
FROM node:22-slim
WORKDIR /app
RUN corepack enable

# Önce yalnız paket tanımları (bağımlılık katmanı önbelleğe alınır)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Yalnız web + shared kurulur; @lean/api (Vercel tek-proje modu için workspace bağımlılığı) bu imajda gerekmez.
RUN pnpm install --frozen-lockfile --filter "@lean/web" --filter "@lean/shared"

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

# Bu imajda API ayrı konteynerde çalışır: Vercel'e özgü gömülü API yolu (@lean/api/serverless) boş bir
# yer tutucuyla değiştirilir. Gerçek istekler zaten next.config.ts'teki rewrite ile API_ORIGIN'e gider.
RUN printf '%s\n' \
 'import type { IncomingMessage, ServerResponse } from "http";' \
 'export const config = { api: { bodyParser: false, externalResolver: true } };' \
 'export default function handler(_req: IncomingMessage, res: ServerResponse) {' \
 '  res.statusCode = 502; res.end("API_ORIGIN yapilandirilmamis");' \
 '}' > "apps/web/src/pages/api/v1/[...path].ts"

# rewrite hedefi derleme sırasında sabitlenir → API_ORIGIN verildiğinde gömülü API kullanılmaz
ARG API_ORIGIN=http://api:4000
ENV API_ORIGIN=$API_ORIGIN
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @lean/shared build && pnpm --filter @lean/web build

ENV NODE_ENV=production
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
