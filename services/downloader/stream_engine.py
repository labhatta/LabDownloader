import asyncio
import os
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx

from services.downloader.config import config
from services.downloader.database import db
from services.downloader.security import (
    get_safe_destination_path,
    sanitize_filename,
    validate_url,
)
from services.downloader.sse import broadcaster

active_stream_processes: Dict[str, asyncio.subprocess.Process] = {}

async def inspect_stream_manifest(url: str) -> Dict[str, Any]:
    """Parse HLS .m3u8 or DASH .mpd manifest and list available streams."""
    safe_url = validate_url(url)
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        res = await client.get(safe_url)
        if res.status_code >= 400:
            raise ValueError(f"Failed to fetch manifest: HTTP {res.status_code}")
        content = res.text

    is_m3u8 = "#EXTM3U" in content or ".m3u8" in safe_url.lower()
    is_dash = "<MPD" in content or ".mpd" in safe_url.lower()

    variants: List[Dict[str, Any]] = []

    if is_m3u8:
        # Parse HLS stream variants
        pattern = re.compile(r'#EXT-X-STREAM-INF:([^\r\n]+)[\r\n]+([^\r\n]+)')
        for match in pattern.finditer(content):
            meta, stream_url = match.groups()
            stream_url = stream_url.strip()
            # If relative URL, resolve
            if not stream_url.startswith("http"):
                from urllib.parse import urljoin
                stream_url = urljoin(safe_url, stream_url)

            bw_match = re.search(r'BANDWIDTH=(\d+)', meta)
            res_match = re.search(r'RESOLUTION=(\d+x\d+)', meta)
            codecs_match = re.search(r'CODECS="([^"]+)"', meta)

            bandwidth = int(bw_match.group(1)) if bw_match else None
            resolution = res_match.group(1) if res_match else "Unknown"
            codecs = codecs_match.group(1) if codecs_match else None

            variants.append({
                "url": stream_url,
                "resolution": resolution,
                "bandwidth": bandwidth,
                "bandwidth_formatted": f"{bandwidth // 1000} kbps" if bandwidth else None,
                "codecs": codecs,
                "type": "HLS Variant"
            })

    return {
        "url": safe_url,
        "is_m3u8": is_m3u8,
        "is_dash": is_dash,
        "variants": variants,
        "is_master": len(variants) > 0,
        "raw_preview": content[:1500]
    }

async def run_stream_download(
    job_id: str,
    url: str,
    output_dir: Path,
    filename: Optional[str] = None
):
    """Download HLS or DASH stream using FFmpeg with safe structured subprocess args."""
    safe_url = validate_url(url)
    if not config.FFMPEG_PATH:
        raise RuntimeError("FFmpeg executable not found. FFmpeg is required for HLS/DASH downloads.")

    output_dir.mkdir(parents=True, exist_ok=True)
    clean_name = sanitize_filename(filename or f"stream_{job_id}.mp4")
    if not clean_name.endswith(".mp4") and not clean_name.endswith(".mkv"):
        clean_name += ".mp4"

    target_path = get_safe_destination_path(output_dir, clean_name)
    db.update_job(job_id, {"status": "downloading", "progress": 0.0, "title": target_path.name})

    # Structured FFmpeg arguments - no shell interpolation
    cmd = [
        config.FFMPEG_PATH,
        "-y",
        "-reconnect", "1",
        "-reconnect_at_eof", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
        "-i", safe_url,
        "-c", "copy",
        "-bsf:a", "aac_adtstoasc",
        str(target_path)
    ]

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        active_stream_processes[job_id] = process

        # Parse FFmpeg stderr for time progress
        time_pattern = re.compile(r'time=(\d+):(\d+):(\d+\.\d+)')
        speed_pattern = re.compile(r'speed=\s*([\d\.]+x)')

        while True:
            line = await process.stderr.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="ignore")
            t_match = time_pattern.search(text)
            s_match = speed_pattern.search(text)

            if t_match:
                h, m, s = t_match.groups()
                current_time_str = f"{int(h):02d}:{int(m):02d}:{int(float(s)):02d}"
                speed_str = s_match.group(1) if s_match else ""

                updates = {
                    "status": "downloading",
                    "speed": f"FFmpeg: {speed_str}" if speed_str else "Streaming segments...",
                    "eta": f"Recorded: {current_time_str}"
                }
                db.update_job(job_id, updates)
                await broadcaster.broadcast("job_progress", {"job_id": job_id, **updates})

        returncode = await process.wait()
        if returncode != 0:
            raise RuntimeError(f"FFmpeg process exited with code {returncode}")

        file_size = target_path.stat().st_size if target_path.exists() else 0
        completed_updates = {
            "status": "completed",
            "progress": 100.0,
            "output_path": str(target_path),
            "file_size": file_size,
            "speed": "",
            "eta": ""
        }
        db.update_job(job_id, completed_updates)
        await broadcaster.broadcast("job_completed", {"job_id": job_id, **completed_updates})

    except asyncio.CancelledError:
        if job_id in active_stream_processes:
            proc = active_stream_processes[job_id]
            try:
                proc.kill()
            except Exception:
                pass
        db.update_job(job_id, {"status": "canceled", "error_message": "Canceled by user."})
        await broadcaster.broadcast("job_canceled", {"job_id": job_id})
    except Exception as e:
        error_msg = str(e)
        db.update_job(job_id, {"status": "failed", "error_message": error_msg})
        await broadcaster.broadcast("job_failed", {"job_id": job_id, "error": error_msg})
    finally:
        active_stream_processes.pop(job_id, None)

def cancel_stream_download(job_id: str) -> bool:
    if job_id in active_stream_processes:
        proc = active_stream_processes[job_id]
        try:
            proc.kill()
            return True
        except Exception:
            return False
    return False
