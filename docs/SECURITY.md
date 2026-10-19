# LabDownloader Security Model

## 1. Threat Model & Design Principles

LabDownloader treats every URL, manifest, response, and imported file as untrusted.

## 2. Server-Side Request Forgery (SSRF) Protection

All outgoing requests (metadata extraction, file downloads, stream inspection, and URL probes) pass through `validate_url()` in `services/downloader/security.py`:
- **Allowed Schemes**: Only `http` and `https` protocols are permitted. `file://`, `ftp://`, `gopher://`, `dict://`, and `ldap://` are strictly rejected.
- **Loopback & Private Network Blocking**:
  - `127.0.0.0/8`, `::1`
  - `10.0.0.0/8`
  - `172.16.0.0/12`
  - `192.168.0.0/16`
  - `169.254.0.0/16` (Cloud link-local & AWS metadata endpoint `169.254.169.254`)
  - Carrier-grade NAT `100.64.0.0/10`
  - Multicast `224.0.0.0/4`, Broadcast `255.255.255.255`
  - IPv6 unique-local (`fc00::/7`) and link-local (`fe80::/10`)
- **DNS Resolution Check**: Hostnames are resolved to IP addresses via `socket.getaddrinfo()` before allowing connections to thwart DNS rebinding attacks.

## 3. Safe Filename Handling & Path Traversal Mitigation

User-provided or server-provided filenames are sanitized using `sanitize_filename()`:
- Strips all path separators (`/`, `\`) and null bytes (`\0`).
- Removes Windows and POSIX invalid characters: `< > : " / \ | ? *`.
- Prevents Windows reserved device names: `CON`, `PRN`, `AUX`, `NUL`, `COM1-COM9`, `LPT1-LPT9`.
- Enforces a maximum length of 200 characters while preserving file extensions.
- Detects collisions and creates versioned suffixes (`(1)`, `(2)`) instead of overwriting existing user files.

## 4. Subprocess Execution Security

- No shell string concatenation: Subprocess commands for `ffmpeg`, `ffprobe`, and `yt-dlp` are always passed as structured argument lists (`[executable, ...args]`), never via `shell=True` or `exec()` strings.

## 5. DevTools HAR File Sanitization

- When users import a `.har` export in the Network Inspector, all sensitive headers (`Authorization`, `Cookie`, `Set-Cookie`, `X-Auth-Token`) and cookies are completely stripped and discarded.
- Query parameters containing credentials or tokens (`token=`, `secret=`, `api_key=`) are redacted with `[REDACTED]`.

## 6. Desktop Sandboxing & IPC Protection

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Strict Content Security Policy
- Navigation lockdown: external links open via `shell.openExternal()`, blocking untrusted in-app browser navigation.
