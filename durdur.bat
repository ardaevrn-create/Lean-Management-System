@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Lean Management System - Durdur

where docker >nul 2>nul
if errorlevel 1 (
  echo [HATA] Docker bulunamadi. Docker Desktop kurulu degil.
  pause
  exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop calismiyor; durdurulacak bir sey yok.
  pause
  exit /b 0
)

echo Uygulama durduruluyor (verileriniz korunur)...
docker compose stop
echo.
echo Durduruldu. Tekrar baslatmak icin baslat.bat dosyasini calistirin.
pause
