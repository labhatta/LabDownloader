@echo off
setlocal enabledelayedexpansion
title LabDownloader - Build ^& Packaging Tool
cls

echo ========================================================
echo         LABDOWNLOADER - BUILD ^& PACKAGE TOOL
echo ========================================================
echo.

cd /d "%~dp0"

:: 1. Dapatkan versi saat ini
for /f "delims=" %%v in ('node scripts\version_tool.js get') do set "CURR_VER=%%v"
for /f "delims=" %%v in ('node scripts\version_tool.js next-patch') do set "NEXT_VER=%%v"

echo Versi saat ini    : !CURR_VER!
echo Rekomendasi patch : !NEXT_VER!
echo.
echo Opsi Update Versi:
echo  - Tekan [ENTER] langsung untuk menggunakan versi rekomendasi (!NEXT_VER!)
echo  - Ketik versi baru secara manual (misal: 1.1.0)
echo  - Ketik [S] untuk lewati update versi (tetap !CURR_VER!)
echo.

set /p "TARGET_VER=Pilihan versi [Enter = !NEXT_VER!]: "
if "!TARGET_VER!"=="" set "TARGET_VER=!NEXT_VER!"

if /i "!TARGET_VER!"=="S" (
    echo [*] Update versi dilewati. Versi tetap !CURR_VER!.
    set "BUILD_VER=!CURR_VER!"
) else (
    echo [*] Mengupdate versi package.json ke !TARGET_VER!...
    node scripts\version_tool.js set !TARGET_VER!
    set "BUILD_VER=!TARGET_VER!"
)

echo.
echo ========================================================
echo  MEMULAI PROSES BUILD UNTUK VERSI !BUILD_VER!
echo ========================================================
echo.

:: 2. Build Python Standalone Engine (lab-engine.exe)
echo [1/4] Mengompilasi Python Backend Engine ke lab-engine.exe...
python scripts\build_standalone_backend.py
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Kompilasi Python backend gagal!
    pause
    exit /b %ERRORLEVEL%
)

:: 3. Build Web Renderer
echo.
echo [2/4] Mengompilasi Vite / React Renderer...
call npm run build:renderer
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build Renderer gagal!
    pause
    exit /b %ERRORLEVEL%
)

:: 4. Build Electron TypeScript
echo.
echo [3/4] Mengompilasi Electron Main ^& Preload TypeScript...
call npm run build:electron
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build Electron TypeScript gagal!
    pause
    exit /b %ERRORLEVEL%
)

:: 5. Bundle dengan Electron Builder
echo.
echo [4/5] Mengemas aplikasi Windows (NSIS Installer ^& Portable Exe)...
call npx electron-builder --win
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Packaging Electron gagal!
    pause
    exit /b %ERRORLEVEL%
)

:: 6. Bersihkan versi lama dari folder dist-package
echo.
echo [5/5] Membersihkan file versi lama di folder dist-package...
node scripts\clean_old_versions.js !BUILD_VER!

echo.
echo ========================================================
echo          BUILD ^& PACKAGING BERHASIL 100%%!
echo ========================================================
echo.
echo File hasil paket berada di folder: "%~dp0dist-package"
echo  - LabDownloader Setup !BUILD_VER!.exe (Installer NSIS)
echo  - LabDownloader !BUILD_VER!.exe       (Portable Version)
echo  - win-unpacked\LabDownloader.exe      (Unpacked App)
echo.

:: 7. Commit dan push ke GitHub
echo.
set /p "DO_GIT_PUSH=Commit dan push versi baru ke GitHub sekarang? [Y/N, Enter = Y]: "
if "!DO_GIT_PUSH!"=="" set "DO_GIT_PUSH=Y"
if /i "!DO_GIT_PUSH!"=="Y" (
    echo [*] Melakukan git add, commit, dan push ke GitHub...
    git add .
    git commit -m "chore(release): build and package version !BUILD_VER!"
    git push origin main
    echo [+] Repository GitHub berhasil diperbarui!
)

set /p "OPEN_DIR=Buka folder dist-package sekarang? [Y/N, Enter = Y]: "
if "!OPEN_DIR!"=="" set "OPEN_DIR=Y"
if /i "!OPEN_DIR!"=="Y" (
    explorer "%~dp0dist-package"
)

echo.
echo Selesai.
pause
exit /b 0
