#!/bin/sh
# Lean Management System - tek komutla başlat (macOS / Linux). Docker gerekir.
cd "$(dirname "$0")" || exit 1

echo "============================================"
echo "  Lean Management System başlatılıyor"
echo "============================================"

if ! command -v docker >/dev/null 2>&1; then
  echo "[HATA] Docker bulunamadı."
  echo "Lütfen önce Docker Desktop'ı kurun: https://www.docker.com/products/docker-desktop/"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "[HATA] Docker kurulu ama çalışmıyor."
  echo "Lütfen Docker Desktop'ı açın, çalışır duruma gelmesini bekleyin ve bu betiği tekrar çalıştırın."
  exit 1
fi

echo "Uygulama hazırlanıyor. İlk çalıştırmada derleme birkaç dakika sürebilir, lütfen bekleyin..."
if ! docker compose up -d --build; then
  echo "[HATA] Uygulama başlatılamadı. Yukarıdaki hata mesajını kontrol edin."
  echo "Sık nedenler: 3000, 4000 veya 5433 portu kullanımda ya da internet bağlantısı yok (README.md > Sorun giderme)."
  exit 1
fi

echo "Uygulamanın açılması bekleniyor..."
i=0
until curl -sf -o /dev/null http://localhost:3000/api/v1/health; do
  i=$((i + 1))
  if [ "$i" -ge 90 ]; then
    echo "[HATA] Uygulama 3 dakika içinde yanıt vermedi. Günlükler için: docker compose logs"
    exit 1
  fi
  sleep 2
done

echo "============================================"
echo "  Hazır! http://localhost:3000"
echo "  Şirket: DEMO   Kullanıcı: admin   Şifre: admin123"
echo "  Durdurmak için: ./durdur.sh"
echo "============================================"

if command -v open >/dev/null 2>&1; then
  open http://localhost:3000
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://localhost:3000 >/dev/null 2>&1 || true
fi
