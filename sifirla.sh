#!/bin/sh
# DİKKAT: Tüm verileri (veritabanı + yüklenen dosyalar) siler.
cd "$(dirname "$0")" || exit 1
echo "DİKKAT: Tüm veriler (veritabanı ve yüklenen dosyalar) SİLİNECEK; uygulama demo verisiyle sıfırdan kurulacak."
printf "Devam etmek için EVET yazıp Enter'a basın: "
read -r onay
if [ "$onay" != "EVET" ]; then
  echo "Vazgeçildi. Hiçbir şey silinmedi."
  exit 0
fi
if ! docker info >/dev/null 2>&1; then
  echo "[HATA] Docker çalışmıyor. Önce Docker Desktop'ı açın."
  exit 1
fi
docker compose down -v
echo "Veriler silindi. Yeniden kurmak için: ./baslat.sh"
