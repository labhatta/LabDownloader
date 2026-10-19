@echo off
setlocal enabledelayedexpansion
title LabDownloader - Launcher
cls

echo ========================================================
echo               LABDOWNLOADER - LAUNCHER
echo ========================================================
echo.

set "UNPACKED_EXE=%~dp0dist-package\win-unpacked\LabDownloader.exe"

if not exist "%UNPACKED_EXE%" goto DEV_FALLBACK

:SHOW_MENU
echo [1] Jalankan Aplikasi Packaged - LabDownloader.exe [Default]
echo [2] Jalankan Mode Development - Live Dev Server
echo [3] Keluar
echo.
set "CHOICE="
set /p "CHOICE=Pilih opsi [1/2/3, Enter = 1]: "
if "%CHOICE%"=="" set "CHOICE=1"
if "%CHOICE%"=="1" goto RUN_PACKAGED
if "%CHOICE%"=="2" goto RUN_DEV
if "%CHOICE%"=="3" exit /b 0
goto SHOW_MENU

:DEV_FALLBACK
echo [INFO] Aplikasi terkemas belum ditemukan di:
echo %UNPACKED_EXE%
echo.
echo Menjalankan aplikasi dalam Mode Development...
goto RUN_DEV

:RUN_PACKAGED
echo.
echo [*] Meluncurkan LabDownloader (%UNPACKED_EXE%)...
start "" "%UNPACKED_EXE%"
echo [v] LabDownloader berhasil diluncurkan!
ping 127.0.0.1 -n 3 >nul
exit /b 0

:RUN_DEV
echo.
echo [*] Memulai LabDownloader dalam Mode Development...
call npm run dev
exit /b 0
