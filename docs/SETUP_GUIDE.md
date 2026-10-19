# LabDownloader Setup & User Guide

## Prerequisites

1. **Node.js**: v18.0.0 or later (v20+ recommended).
2. **Python**: v3.10 or later (with `pip`).
3. **FFmpeg**: Installed and in PATH (or provided in application directory).
4. **yt-dlp**: Installed globally or bundled with the Python environment.

---

## Quickstart (Development Mode)

### 1. Install Node Dependencies
```bash
npm install
```

### 2. Verify Python Dependencies
```bash
pip install fastapi uvicorn yt-dlp httpx pydantic pytest
```

### 3. Run Automated Tests
Verify all security and backend unit tests pass:
```bash
npm test
# or
pytest tests/ -v
```

### 4. Start Development Server
Run the full desktop stack (FastAPI backend + Vite dev server + Electron shell):
```powershell
.\scripts\run_dev.ps1
# or
npm run dev
```

---

## Building & Packaging

### Standalone Web Release
Build the React frontend independently for web deployment (e.g. Nginx, Cloudflare Pages, Docker):
```bash
npm run build:web
```
The output is located in `dist/`.

### Windows Desktop Package
Package the Windows unpacked directory or installer:
```powershell
.\scripts\package_desktop.ps1
```
The built installer and binaries will be generated in `dist-package/`.

---

## Standalone Zero-Python Backend (PyInstaller)

To bundle the Python backend into a single executable `lab-engine.exe` that does not require Python on the target user's computer:
```bash
python scripts/build_standalone_backend.py
```
The resulting `lab-engine.exe` is placed in `dist-backend/`, which the Electron launcher automatically detects and executes.
