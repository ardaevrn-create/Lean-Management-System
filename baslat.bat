@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Lean Management System - Baslat

echo ============================================
echo   Lean Management System baslatiliyor
echo ============================================
echo.

where docker >nul 2>nul
if errorlevel 1 (
  echo [HATA] Docker bulunamadi.
  echo.
  echo Lutfen once Docker Desktop'i kurun: https://www.docker.com/products/docker-desktop/
  echo Kurulumdan sonra bilgisayari yeniden baslatip Docker Desktop'i acin, sonra bu dosyayi tekrar calistirin.
  echo.
  pause
  exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
  echo [HATA] Docker kurulu ama calismiyor.
  echo.
  echo Lutfen Docker Desktop'i acin ve balina simgesi "Docker Desktop is running" olana kadar bekleyin.
  echo Sonra bu dosyayi tekrar calistirin.
  echo.
  pause
  exit /b 1
)

echo Uygulama hazirlaniyor. Ilk calistirmada derleme birkac dakika surebilir, lutfen bekleyin...
echo.
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo [HATA] Uygulama baslatilamadi. Yukaridaki hata mesajini kontrol edin.
  echo Sik nedenler: 3000, 4000 veya 5433 portu baska bir program tarafindan kullaniliyor, ya da internet baglantisi yok.
  echo Ayrintilar icin README.md dosyasindaki "Sorun giderme" bolumune bakin.
  echo.
  pause
  exit /b 1
)

echo.
echo Uygulamanin acilmasi bekleniyor...
set /a TRIES=0
:bekle
curl.exe -s -f -o nul http://localhost:3000/api/v1/health
if not errorlevel 1 goto hazir
set /a TRIES+=1
if %TRIES% GEQ 90 goto zamanasimi
timeout /t 2 /nobreak >nul
goto bekle

:zamanasimi
echo.
echo [HATA] Uygulama 3 dakika icinde yanit vermedi.
echo Gunlukleri gormek icin su komutu calistirin: docker compose logs
echo.
pause
exit /b 1

:hazir
echo.
echo ============================================
echo   Hazir! Tarayici aciliyor: http://localhost:3000
echo   Sirket: DEMO   Kullanici: admin   Sifre: admin123
echo   Durdurmak icin: durdur.bat
echo ============================================
start "" http://localhost:3000
echo.
pause
