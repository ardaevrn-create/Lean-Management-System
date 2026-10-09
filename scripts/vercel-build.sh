#!/bin/sh
# Tek Vercel projesi derlemesi (Root Directory: apps/web). Depo kökünden çalışır.
# Gerekli ortam değişkenleri: DATABASE_URL (Neon/Vercel Postgres bağlantısı ekler), JWT_SECRET.
set -e

if [ -z "$DATABASE_URL" ] && [ -z "$API_ORIGIN" ]; then
  echo "[lean] HATA: DATABASE_URL tanımlı değil. Vercel → Storage → Neon (Postgres) veritabanını bu projeye bağlayın."
  exit 1
fi

pnpm --filter @lean/shared build

if [ -z "$API_ORIGIN" ]; then
  echo "[lean] API bu projede çalışacak: veritabanı hazırlanıyor ve API derleniyor"
  cd apps/api
  npx prisma generate
  DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" npx prisma migrate deploy
  if [ "$SEED_DEMO" = "true" ]; then
    SCHEDULER_ENABLED=false DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" npx ts-node prisma/seed.ts
  fi
  npx nest build
  cd ../..
fi

pnpm --filter @lean/web build
