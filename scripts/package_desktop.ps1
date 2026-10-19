# LabDownloader Desktop Packaging Script
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Building LabDownloader for Windows...   " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Build Renderer (React + Vite)
Write-Host "`n[1/3] Building Web/Renderer Assets..." -ForegroundColor Yellow
npm run build:renderer
if ($LASTEXITCODE -ne 0) {
    Write-Error "Renderer build failed."
    exit 1
}

# 2. Build Electron Main & Preload
Write-Host "`n[2/3] Compiling Electron TypeScript..." -ForegroundColor Yellow
npm run build:electron
if ($LASTEXITCODE -ne 0) {
    Write-Error "Electron compilation failed."
    exit 1
}

# 3. Package with electron-builder
Write-Host "`n[3/3] Packaging Windows Installer & Portable Executable..." -ForegroundColor Yellow
npx electron-builder --win --x64
if ($LASTEXITCODE -ne 0) {
    Write-Error "electron-builder packaging failed."
    exit 1
}

Write-Host "`n[+] Packaging Complete! Artifacts located in: dist-package/" -ForegroundColor Green
