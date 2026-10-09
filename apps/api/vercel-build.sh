#!/bin/sh
# Vercel API projesi derlemesi (Root Directory: apps/api).
# Neon/Vercel Postgres: DATABASE_URL havuzlu bağlantı; migration için havuzsuz URL tercih edilir.
set -e
cd ../..
pnpm --filter @lean/shared build
cd apps/api
npx prisma generate
DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" npx prisma migrate deploy
if [ "$SEED_DEMO" = "true" ]; then
  DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" npx ts-node prisma/seed.ts
fi
npx nest build
# Statik çıktı yok; boş public klasörü kaynak dosyaların yayınlanmasını engeller
mkdir -p public
