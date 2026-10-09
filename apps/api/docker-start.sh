#!/bin/sh
# Konteyner açılışı: migration'ları uygula, istenirse demo verisini yükle, API'yi başlat.
set -e
npx prisma migrate deploy
if [ "$SEED_DEMO" = "true" ]; then
  npx ts-node prisma/seed.ts || echo "Seed atlandı veya başarısız oldu"
fi
exec node dist/main.js
