# LabDownloader

**LabDownloader** is a functional, modern desktop and web application for downloading supported video, audio, HLS/DASH streams, and directly accessible document files.

Built with a warm cream background (`#FFF6E8`), vibrant amber-orange accents (`#FFB844`), rounded white cards (16–28px), soft shadows, and a polished minimalist interface.

---

## 🌟 Key Features

### 1. Downloader
- **Universal URL Input**: Support for YouTube, Twitter/X, Instagram, TikTok, Reddit, Vimeo, SoundCloud, and hundreds of other supported media sources via `yt-dlp`.
- **Direct Files & Documents**: Direct PDF, audio, video, and archive links with streaming progress and resume support via `HTTPX`.
- **Real Media Preview**: Accurate metadata extraction (real titles, durations, thumbnails, resolutions, audio tracks, and codecs).
- **Quality & Format Presets**: Quick selection for Best Video+Audio, 1080p FHD, 720p HD, or Audio Only (MP3/M4A).

### 2. Network Inspector
- **Import HAR**: Import `.har` session archives exported from Chrome/Firefox DevTools. All cookies, session tokens, and passwords are automatically stripped.
- **Media Candidate Extraction**: Automatically extracts `.m3u8`, `.mpd`, `.mp4`, `.webm`, `.ts`, `.m4s`, `.mp3`, and `.pdf` resources.
- **Manual URL Probe**: Inspect any suspicious stream link or asset URL safely. Detects HTTP status, Content-Type, Content-Length, and HLS/DASH variant streams.

### 3. Stream Engine (HLS & DASH)
- **Manifest Detection**: Parses `.m3u8` master and media playlists, displaying resolutions, bitrates, and audio variants.
- **FFmpeg Muxing**: Direct segment capture and lossless remuxing to MP4 using safe structured subprocess execution.

### 4. Downloads Queue & Real-Time SSE
- **Live Progress Updates**: Server-Sent Events (SSE) stream percentage complete, speed (MB/s), downloaded/total bytes, and countdown ETA.
- **Job Controls**: Cancel active jobs, retry failed jobs, open downloaded file natively, open containing folder in Windows Explorer, and delete records.

### 5. Persistent History
- SQLite-backed history tracking all completed, failed, and canceled downloads.
- Search by title or URL with instant status filtering.

### 6. Settings & Diagnostics
- **Folder Picker**: Native Windows folder selection dialog.
- **Concurrency Control**: Adjust maximum concurrent downloads (1 to 5).
- **Core Engine Health**: Live version check and status indicator for `yt-dlp`, `FFmpeg`, `Python`, and available disk partition space.
- **Sanitized Diagnostic Logs**: Real-time log inspector with all secrets and tokens redacted.

---

## 🛡️ Application Security

- **SSRF Protection**: Blocks loopback (`127.0.0.0/8`, `::1`), private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and cloud metadata (`169.254.169.254`). Validates DNS resolution before connecting.
- **Safe Filename Sanitization**: Strips path traversal (`../`, `..\`), removes reserved characters (`<>:"/\|?*`), and handles Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`).
- **No Shell Interpolation**: Subprocess execution uses structured argument arrays (`[cmd, arg1, arg2]`).
- **Authenticated Loopback**: Electron generates a cryptographically random token (`X-Lab-Token`) on startup, passed exclusively to the backend child process and renderer bridge.
- **Electron Sandboxing**: `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer, and strict Content Security Policy.

---

## 🏗️ Architecture

```
LabDownloader/
├── apps/
│   ├── desktop/              # Electron Main process, preload bridge, & lifecycle
│   │   ├── src/main/         # Backend launcher, secure IPC, native dialogs
│   │   └── src/preload/      # ContextBridge exposing window.labDesktopAPI
├── packages/
│   └── api-client/           # Shared TypeScript IDownloadAdapter interface
│       ├── desktop-adapter.ts# Communicates with loopback engine & native bridge
│       └── web-adapter.ts    # Communicates with remote server in web mode
├── src/
│   └── renderer/             # React 19 + TypeScript + Vite + Tailwind CSS UI
│       ├── components/       # TitleBar, Navbar, Cards
│       ├── pages/            # Downloader, Network Inspector, Downloads, History, Settings
│       └── styles/           # Warm cream theme tokens & custom scrollbars
├── services/
│   └── downloader/           # Python FastAPI backend service
│       ├── security.py       # SSRF protection, IP/DNS checks, filename sanitization
│       ├── ytdlp_engine.py   # yt-dlp metadata extractor & download worker
│       ├── direct_engine.py  # HTTPX chunked direct file streaming
│       ├── stream_engine.py  # HLS .m3u8 & DASH .mpd parser and FFmpeg muxer
│       ├── inspector.py      # DevTools HAR sanitizer & URL probe
│       ├── database.py       # SQLite jobs queue and settings persistence
│       ├── sse.py            # Server-Sent Events broadcaster
│       └── main.py           # FastAPI entrypoint
├── tests/                    # Automated pytest suite (security, inspector, API)
└── scripts/                  # Development, packaging, and standalone build scripts
```

---

## 🚀 Quickstart & Commands

### 1. Run Automated Test Suite
```bash
npm test
# or
pytest tests/ -v
```

### 2. Start Full Stack in Development
```powershell
.\scripts\run_dev.ps1
# or
npm run dev
```

### 3. Build Standalone Web Release
```bash
npm run build:web
```
Outputs static bundle in `dist/`.

### 4. Package Windows Desktop Application
```powershell
.\scripts\package_desktop.ps1
# or
npm run package
```
Outputs Windows NSIS installer and portable executables in `dist-package/`.

### 5. Bundle Standalone Zero-Python Backend (Optional)
```bash
python scripts/build_standalone_backend.py
```
Generates `dist-backend/lab-engine.exe` using PyInstaller.
