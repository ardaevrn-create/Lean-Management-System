#!/bin/sh
# Uygulamayı durdurur; veriler korunur.
cd "$(dirname "$0")" || exit 1
if ! command -v docker >/dev/null 2>&1; then
  echo "[HATA] Docker bulunamadı."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker çalışmıyor; durdurulacak bir şey yok."
  exit 0
fi
echo "Uygulama durduruluyor (verileriniz korunur)..."
docker compose stop
echo "Durduruldu. Tekrar başlatmak için: ./baslat.sh"
