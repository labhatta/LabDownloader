# LabDownloader Architecture

## 1. Overview

**LabDownloader** is an elegant, modular media and document downloader designed for both Windows desktop and future web deployments.

```
+-----------------------------------------------------------------------------------+
|                              LabDownloader Application                             |
+-----------------------------------------------------------------------------------+
|  Desktop Mode (Electron Shell)                     |  Web Mode (Standalone SPA)   |
|  - apps/desktop/main (Lifecycle, Tray, Native FS)  |  - apps/web (Vite SPA)        |
|  - apps/desktop/preload (Secure ContextBridge)     |  - Web Auth & Remote API      |
+----------------------------------------------------+------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                           Shared UI & Frontend Layer                              |
|  - React 19 / TypeScript / Vite / Tailwind CSS                                    |
|  - Design System: Warm Cream (#FFF6E8), Amber (#FFB844), White Rounded Cards      |
|  - Views: Downloader | Network Inspector | Downloads Queue | History | Settings   |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                            API Client & Adapter Layer                             |
|  - packages/api-client (IDownloadAdapter Interface)                               |
|  - DesktopDownloadAdapter (Local authenticated HTTP / SSE + Preload Bridge)       |
|  - WebDownloadAdapter (Remote REST / SSE with Bearer auth)                        |
+-----------------------------------------------------------------------------------+
                                         |
                       (Loopback HTTP/SSE with X-Lab-Token)
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                           Python Download Engine (FastAPI)                        |
|  - services/downloader/main.py (Loopback only, Dynamic Port, Auth Token)          |
|  - security.py (SSRF Protection, Private IP/DNS validation, Filename sanitizing)  |
|  - ytdlp_engine.py (yt-dlp metadata extraction, format parsing, video download)   |
|  - direct_engine.py (HTTPX chunked streaming with resume/cancel, documents/files) |
|  - stream_engine.py (HLS .m3u8 and DASH .mpd stream inspection and FFmpeg muxing) |
|  - inspector.py (HAR parser with token sanitization, URL probe & header analyzer) |
|  - database.py (SQLite for jobs queue, persistent history, and user settings)     |
|  - event_bus.py (Real-time SSE progress streaming per job & global queue)         |
+-----------------------------------------------------------------------------------+
```

## 2. Desktop Mode

In Desktop Mode:
1. Electron initializes and executes `startBackendProcess()` in `apps/desktop/src/main/backend.ts`.
2. A random free loopback port is allocated and a cryptographically secure 32-character authentication token (`X-Lab-Token`) is generated.
3. The Python FastAPI backend is started as a child process (using either the bundled standalone binary `lab-engine.exe` or `python -m services.downloader.main`).
4. Electron polls the `/api/health` probe on loopback until the backend is confirmed ready.
5. The renderer window is created with `contextIsolation: true`, `nodeIntegration: false`, and sandboxing enabled.
6. The preload bridge exposes typed helper methods via `window.labDesktopAPI` (`openDirectoryDialog`, `openPath`, `showItemInFolder`).
7. When the application closes, `before-quit` triggers a graceful shutdown call to `/api/system/shutdown`.

## 3. Web Mode Parity

The frontend does not import any Node.js native modules directly. Instead, all communication passes through the `IDownloadAdapter` interface (`packages/api-client/src/adapter.ts`).
- `DesktopDownloadAdapter` connects to local loopback with desktop token and native file picker bridges.
- `WebDownloadAdapter` connects to remote backend deployments and uses browser download APIs and standard dialogs.
- Building the web application is as simple as running:
  ```bash
  npm run build:web
  ```

## 4. Real-time Progress with Server-Sent Events (SSE)

The backend exposes a high-efficiency SSE stream at `/api/events`. When downloads are in progress:
- Download progress (percentage, speed in MB/s, ETA, downloaded bytes) is emitted every 250ms.
- The React frontend receives `job_progress`, `job_completed`, `job_failed`, and `job_canceled` events and updates state reactively without polling loops.
