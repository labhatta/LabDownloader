# LabDownloader Development Launch Script
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Starting LabDownloader in Dev Mode...   " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check Python dependencies
Write-Host "[*] Checking Python backend dependencies..." -ForegroundColor Yellow
python -c "import fastapi, uvicorn, yt_dlp, httpx, pydantic; print('[+] Backend dependencies verified.')"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Missing python packages. Please run: pip install fastapi uvicorn yt-dlp httpx pydantic pytest"
    exit 1
}

# Run build for electron main
Write-Host "[*] Compiling Electron main script..." -ForegroundColor Yellow
npm run build:electron

Write-Host "[*] Launching Dev Server and Electron Shell..." -ForegroundColor Green
npm run dev
