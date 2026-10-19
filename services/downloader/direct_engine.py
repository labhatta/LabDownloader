import asyncio
import os
import re
import time
from pathlib import Path
from typing import Dict, Optional
from urllib.parse import unquote, urlparse
import httpx

from services.downloader.database import db
from services.downloader.security import (
    get_safe_destination_path,
    sanitize_filename,
    validate_url,
)
from services.downloader.sse import broadcaster

active_direct_cancellations: Dict[str, asyncio.Event] = {}

def extract_filename_from_headers_or_url(url: str, headers: httpx.Headers) -> str:
    # Check Content-Disposition header
    cd = headers.get("content-disposition", "")
    if cd:
        match = re.search(r'filename\*?=(?:UTF-8\'\')?["\']?([^"\';\r\n]+)', cd, flags=re.IGNORECASE)
        if match:
            return sanitize_filename(unquote(match.group(1)))

    # Fallback to URL path
    parsed = urlparse(url)
    path_name = Path(parsed.path).name
    if path_name and "." in path_name:
        return sanitize_filename(unquote(path_name))

    # Fallback to content-type extension
    ct = headers.get("content-type", "").lower()
    ext = ".bin"
    if "pdf" in ct:
        ext = ".pdf"
    elif "mp4" in ct:
        ext = ".mp4"
    elif "zip" in ct:
        ext = ".zip"
    elif "json" in ct:
        ext = ".json"
    elif "audio/mpeg" in ct or "mp3" in ct:
        ext = ".mp3"

    return f"download_{int(time.time())}{ext}"

async def run_direct_download(
    job_id: str,
    url: str,
    output_dir: Path,
    custom_filename: Optional[str] = None
):
    safe_url = validate_url(url)
    cancel_event = asyncio.Event()
    active_direct_cancellations[job_id] = cancel_event

    output_dir.mkdir(parents=True, exist_ok=True)
    db.update_job(job_id, {"status": "downloading", "progress": 0.0})

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            async with client.stream("GET", safe_url, headers=headers) as response:
                if response.status_code >= 400:
                    raise ValueError(f"HTTP error {response.status_code}: {response.reason_phrase}")

                # Determine filename and safe path
                raw_filename = custom_filename or extract_filename_from_headers_or_url(str(response.url), response.headers)
                target_path = get_safe_destination_path(output_dir, raw_filename)

                total_bytes = int(response.headers.get("content-length", 0))
                db.update_job(job_id, {
                    "total_bytes": total_bytes,
                    "title": target_path.name
                })

                downloaded_bytes = 0
                start_time = time.time()
                last_update_time = start_time

                chunk_size = 64 * 1024  # 64 KB

                with open(target_path, "wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=chunk_size):
                        if cancel_event.is_set():
                            raise asyncio.CancelledError("Download canceled by user.")

                        f.write(chunk)
                        downloaded_bytes += len(chunk)
                        current_time = time.time()

                        # Update progress periodically (every 0.25s)
                        if current_time - last_update_time >= 0.25 or (total_bytes > 0 and downloaded_bytes == total_bytes):
                            elapsed = current_time - start_time
                            speed = downloaded_bytes / elapsed if elapsed > 0 else 0
                            pct = round((downloaded_bytes / total_bytes * 100.0), 1) if total_bytes > 0 else 0.0

                            speed_str = f"{speed / (1024*1024):.2f} MB/s" if speed > 1024*1024 else f"{speed / 1024:.1f} KB/s"
                            eta_str = ""
                            if total_bytes > downloaded_bytes and speed > 0:
                                rem_secs = int((total_bytes - downloaded_bytes) / speed)
                                m, s = divmod(rem_secs, 60)
                                eta_str = f"{m:02d}:{s:02d}"

                            updates = {
                                "status": "downloading",
                                "progress": pct,
                                "downloaded_bytes": downloaded_bytes,
                                "speed": speed_str,
                                "eta": eta_str
                            }
                            db.update_job(job_id, updates)
                            await broadcaster.broadcast("job_progress", {"job_id": job_id, **updates})
                            last_update_time = current_time

                # Completed
                final_size = target_path.stat().st_size
                completed_updates = {
                    "status": "completed",
                    "progress": 100.0,
                    "output_path": str(target_path),
                    "file_size": final_size,
                    "speed": "",
                    "eta": ""
                }
                db.update_job(job_id, completed_updates)
                await broadcaster.broadcast("job_completed", {"job_id": job_id, **completed_updates})

    except asyncio.CancelledError:
        db.update_job(job_id, {"status": "canceled", "error_message": "Canceled by user."})
        await broadcaster.broadcast("job_canceled", {"job_id": job_id})
    except Exception as e:
        error_msg = str(e)
        db.update_job(job_id, {"status": "failed", "error_message": error_msg})
        await broadcaster.broadcast("job_failed", {"job_id": job_id, "error": error_msg})
    finally:
        active_direct_cancellations.pop(job_id, None)

def cancel_direct_download(job_id: str) -> bool:
    if job_id in active_direct_cancellations:
        active_direct_cancellations[job_id].set()
        return True
    return False
