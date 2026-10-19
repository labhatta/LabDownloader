import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
import httpx

from services.downloader.security import redact_sensitive_data, sanitize_filename, validate_url

MEDIA_EXTENSIONS = {
    ".m3u8": "HLS Manifest",
    ".mpd": "DASH Manifest",
    ".mp4": "MP4 Video",
    ".m4s": "DASH Segment",
    ".ts": "MPEG-TS Segment",
    ".webm": "WebM Video",
    ".mkv": "MKV Video",
    ".mp3": "MP3 Audio",
    ".m4a": "M4A Audio",
    ".aac": "AAC Audio",
    ".flac": "FLAC Audio",
    ".wav": "WAV Audio",
    ".pdf": "PDF Document",
    ".zip": "ZIP Archive",
}

MEDIA_MIME_PATTERNS = [
    (re.compile(r"application/vnd\.apple\.mpegurl|application/x-mpegurl", re.I), "HLS Stream"),
    (re.compile(r"application/dash\+xml", re.I), "DASH Stream"),
    (re.compile(r"video/mp4", re.I), "MP4 Video"),
    (re.compile(r"video/webm", re.I), "WebM Video"),
    (re.compile(r"video/mp2t", re.I), "MPEG-TS Video"),
    (re.compile(r"video/.*", re.I), "Video Stream"),
    (re.compile(r"audio/.*", re.I), "Audio Stream"),
    (re.compile(r"application/pdf", re.I), "PDF Document"),
]

def sanitize_har_data(har_data: Dict[str, Any]) -> Dict[str, Any]:
    """Sanitize HAR entries by stripping cookies, authorization tokens, and private session credentials."""
    log = har_data.get("log", {})
    entries = log.get("entries", [])
    sanitized_entries = []

    for entry in entries:
        req = entry.get("request", {})
        resp = entry.get("response", {})

        # Redact headers
        clean_req_headers = []
        for h in req.get("headers", []):
            name = h.get("name", "")
            if name.lower() in ("authorization", "cookie", "proxy-authorization", "x-auth-token", "set-cookie"):
                clean_req_headers.append({"name": name, "value": "[REDACTED]"})
            else:
                clean_req_headers.append(h)

        clean_resp_headers = []
        for h in resp.get("headers", []):
            name = h.get("name", "")
            if name.lower() in ("set-cookie",):
                clean_resp_headers.append({"name": name, "value": "[REDACTED]"})
            else:
                clean_resp_headers.append(h)

        req_copy = dict(req)
        req_copy["headers"] = clean_req_headers
        req_copy["cookies"] = []  # Discard cookies entirely

        resp_copy = dict(resp)
        resp_copy["headers"] = clean_resp_headers
        resp_copy["cookies"] = []

        entry_copy = dict(entry)
        entry_copy["request"] = req_copy
        entry_copy["response"] = resp_copy
        sanitized_entries.append(entry_copy)

    return {"log": {"version": log.get("version", "1.2"), "creator": log.get("creator", {}), "entries": sanitized_entries}}

def extract_candidates_from_har(har_content: str | Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract candidate media streams and files from a HAR export."""
    if isinstance(har_content, str):
        try:
            har_json = json.loads(har_content)
        except Exception as e:
            raise ValueError(f"Invalid HAR JSON: {e}")
    else:
        har_json = har_content

    # Sanitize HAR content
    sanitized = sanitize_har_data(har_json)
    entries = sanitized["log"]["entries"]

    candidates: List[Dict[str, Any]] = []
    seen_urls = set()

    for idx, entry in enumerate(entries):
        req = entry.get("request", {})
        resp = entry.get("response", {})

        url = req.get("url", "")
        if not url or url in seen_urls:
            continue

        method = req.get("method", "GET")
        status = resp.get("status", 0)

        # Check content-type
        content = resp.get("content", {})
        mime_type = content.get("mimeType", "")
        body_size = content.get("size") or resp.get("bodySize", 0)

        # Determine media type
        detected_type = None
        parsed_url = urlparse(url)
        path_lower = parsed_url.path.lower()

        # Check extension
        for ext, label in MEDIA_EXTENSIONS.items():
            if path_lower.endswith(ext) or ext in path_lower:
                detected_type = label
                break

        # Check MIME type
        if not detected_type and mime_type:
            for pattern, label in MEDIA_MIME_PATTERNS:
                if pattern.search(mime_type):
                    detected_type = label
                    break

        if detected_type and status < 400:
            seen_urls.add(url)
            # Safe filename suggestion
            url_name = Path(parsed_url.path).name or f"media_{idx}"
            suggested_name = sanitize_filename(url_name)

            candidates.append({
                "id": f"har_cand_{idx}",
                "url": redact_sensitive_data(url),
                "original_url": url,
                "method": method,
                "status": status,
                "mime_type": mime_type,
                "type": detected_type,
                "size": body_size if body_size > 0 else None,
                "size_formatted": f"{body_size / (1024*1024):.2f} MB" if body_size > 1024*1024 else (f"{body_size / 1024:.1f} KB" if body_size > 0 else "Stream / Unknown"),
                "suggested_filename": suggested_name,
                "is_stream": "HLS" in detected_type or "DASH" in detected_type or ".m3u8" in path_lower or ".mpd" in path_lower,
                "can_download": True
            })

    return candidates

async def probe_url(url: str) -> Dict[str, Any]:
    """Perform safe inspection on a single URL."""
    safe_url = validate_url(url)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.head(safe_url, headers=headers)
            # If server forbids HEAD, fallback to GET with stream
            if resp.status_code in (405, 501):
                async with client.stream("GET", safe_url, headers=headers) as get_resp:
                    status = get_resp.status_code
                    resp_headers = dict(get_resp.headers)
            else:
                status = resp.status_code
                resp_headers = dict(resp.headers)

            content_type = resp_headers.get("content-type", "application/octet-stream")
            content_length = int(resp_headers.get("content-length", 0))

            parsed = urlparse(safe_url)
            path_lower = parsed.path.lower()

            detected_type = "Direct Web Resource"
            for ext, label in MEDIA_EXTENSIONS.items():
                if path_lower.endswith(ext) or ext in path_lower:
                    detected_type = label
                    break

            if detected_type == "Direct Web Resource":
                for pattern, label in MEDIA_MIME_PATTERNS:
                    if pattern.search(content_type):
                        detected_type = label
                        break

            is_stream = "m3u8" in path_lower or "mpd" in path_lower or "mpegurl" in content_type or "dash+xml" in content_type

            return {
                "url": redact_sensitive_data(safe_url),
                "original_url": safe_url,
                "status": status,
                "content_type": content_type,
                "content_length": content_length,
                "content_length_formatted": f"{content_length / (1024*1024):.2f} MB" if content_length > 1024*1024 else f"{content_length / 1024:.1f} KB",
                "detected_type": detected_type,
                "is_stream": is_stream,
                "eligible": status < 400,
                "suggested_filename": sanitize_filename(Path(parsed.path).name or "download")
            }
    except Exception as e:
        raise ValueError(f"Failed to probe URL: {e}")
