@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Lean Management System - Sifirla

echo ============================================================
echo   DIKKAT: Tum veriler (veritabani ve yuklenen dosyalar) SILINECEK.
echo   Uygulama demo verisiyle sifirdan kurulacaktir.
echo ============================================================
echo.
set /p ONAY=Devam etmek icin EVET yazip Enter'a basin: 
if /i not "%ONAY%"=="EVET" (
  echo Vazgecildi. Hicbir sey silinmedi.
  pause
  exit /b 0
)

docker info >nul 2>nul
if errorlevel 1 (
  echo [HATA] Docker Desktop calismiyor. Once Docker Desktop'i acin.
  pause
  exit /b 1
)

docker compose down -v
echo.
echo Veriler silindi. Yeniden kurmak icin baslat.bat dosyasini calistirin.
pause
