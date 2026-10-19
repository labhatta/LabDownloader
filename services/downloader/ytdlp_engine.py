import asyncio
import os
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
import yt_dlp

from services.downloader.config import config
from services.downloader.database import db
from services.downloader.security import sanitize_filename, validate_url
from services.downloader.sse import broadcaster

# Active download cancellation events: job_id -> threading.Event
active_cancellations: Dict[str, threading.Event] = {}

def format_bytes(num_bytes: Optional[int]) -> str:
    if num_bytes is None or num_bytes <= 0:
        return "Unknown"
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if num_bytes < 1024.0:
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} PB"

def format_speed(bytes_per_sec: Optional[float]) -> str:
    if not bytes_per_sec or bytes_per_sec <= 0:
        return ""
    return f"{format_bytes(int(bytes_per_sec))}/s"

def format_eta(seconds: Optional[int]) -> str:
    if seconds is None or seconds < 0:
        return ""
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

def extract_media_info(url: str) -> Dict[str, Any]:
    """Analyze media URL and return detailed metadata and available formats."""
    safe_url = validate_url(url)
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "socket_timeout": 15,
        "noplaylist": True,
    }
    if config.FFMPEG_PATH:
        ydl_opts["ffmpeg_location"] = config.FFMPEG_PATH

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(safe_url, download=False)
        if not info:
            raise ValueError("No metadata returned by extractor.")

    title = info.get("title", "Unknown Title")
    thumbnail = info.get("thumbnail")
    duration = info.get("duration")
    uploader = info.get("uploader") or info.get("channel") or info.get("creator")
    extractor = info.get("extractor_key") or info.get("extractor") or "Generic"
    description = (info.get("description") or "")[:280]

    raw_formats = info.get("formats", [])
    formats: List[Dict[str, Any]] = []

    # Map formats
    for f in raw_formats:
        f_id = f.get("format_id")
        ext = f.get("ext", "mp4")
        width = f.get("width")
        height = f.get("height")
        vcodec = f.get("vcodec")
        acodec = f.get("acodec")
        filesize = f.get("filesize") or f.get("filesize_approx")
        fps = f.get("fps")

        is_video = vcodec and vcodec != "none"
        is_audio = acodec and acodec != "none"

        resolution = "audio only"
        if is_video and height:
            resolution = f"{height}p"
            if width and height:
                if height >= 2160 or width >= 3840:
                    resolution = "4K (2160p)"
                elif height >= 1440 or width >= 2560:
                    resolution = "2K (1440p)"
                elif height >= 1080:
                    resolution = "1080p FHD"
                elif height >= 720:
                    resolution = "720p HD"

        formats.append({
            "format_id": f_id,
            "ext": ext,
            "resolution": resolution,
            "width": width,
            "height": height,
            "fps": fps,
            "vcodec": vcodec if is_video else None,
            "acodec": acodec if is_audio else None,
            "filesize": filesize,
            "filesize_formatted": format_bytes(filesize) if filesize else "Varies",
            "is_video": bool(is_video),
            "is_audio": bool(is_audio),
            "format_note": f.get("format_note", "")
        })

    # Add quick quality presets
    presets = [
        {"id": "bestvideo+bestaudio/best", "label": "Best Available (Audio + Video)", "ext": "mp4", "is_preset": True},
        {"id": "bestvideo[height<=1080]+bestaudio/best[height<=1080]", "label": "Full HD 1080p", "ext": "mp4", "is_preset": True},
        {"id": "bestvideo[height<=720]+bestaudio/best[height<=720]", "label": "HD 720p", "ext": "mp4", "is_preset": True},
        {"id": "bestaudio/best", "label": "Best Audio Only (MP3/M4A)", "ext": "mp3", "is_preset": True, "audio_only": True},
    ]

    return {
        "url": safe_url,
        "title": title,
        "thumbnail": thumbnail,
        "duration": duration,
        "duration_formatted": format_eta(duration) if duration else None,
        "uploader": uploader,
        "source": extractor,
        "description": description,
        "formats": formats,
        "presets": presets
    }

def run_ytdlp_download(
    job_id: str,
    url: str,
    format_id: str,
    output_dir: Path,
    is_audio_only: bool = False,
    preferred_audio_format: str = "mp3",
    loop: Optional[asyncio.AbstractEventLoop] = None
):
    """Execute download using yt-dlp with live progress hook."""
    cancel_event = threading.Event()
    active_cancellations[job_id] = cancel_event

    safe_url = validate_url(url)
    output_dir.mkdir(parents=True, exist_ok=True)
    outtmpl = str(output_dir / "%(title).200B [%(id)s].%(ext)s")

    initial_updates = {
        "status": "downloading",
        "progress": 0.0,
        "speed": "Starting download...",
        "eta": "Resolving stream..."
    }
    db.update_job(job_id, initial_updates)
    if loop and loop.is_running():
        asyncio.run_coroutine_threadsafe(
            broadcaster.broadcast("job_progress", {"job_id": job_id, **initial_updates}),
            loop
        )

    last_broadcast_time = 0.0

    def progress_hook(d: Dict[str, Any]):
        nonlocal last_broadcast_time
        if cancel_event.is_set():
            raise yt_dlp.utils.DownloadCancelled("Download canceled by user.")

        status = d.get("status")
        if status == "downloading":
            now = time.time()
            downloaded = d.get("downloaded_bytes", 0)
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            speed_val = d.get("speed")
            eta_val = d.get("eta")

            pct = 0.0
            if total > 0:
                pct = round((downloaded / total) * 100.0, 1)

            # Throttle updates to at most 4 times per second unless completed
            if now - last_broadcast_time < 0.25 and pct < 99.0:
                return
            last_broadcast_time = now

            speed_str = format_speed(speed_val)
            eta_str = format_eta(eta_val)

            updates = {
                "status": "downloading",
                "progress": pct,
                "downloaded_bytes": downloaded,
                "total_bytes": total,
                "speed": speed_str,
                "eta": eta_str
            }
            db.update_job(job_id, updates)

            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    broadcaster.broadcast("job_progress", {"job_id": job_id, **updates}),
                    loop
                )

        elif status == "finished":
            updates = {
                "status": "processing",
                "progress": 99.0,
                "speed": "Processing media...",
                "eta": "Finishing..."
            }
            db.update_job(job_id, updates)
            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    broadcaster.broadcast("job_progress", {"job_id": job_id, **updates}),
                    loop
                )

    ydl_opts: Dict[str, Any] = {
        "outtmpl": outtmpl,
        "quiet": True,
        "no_warnings": True,
        "progress_hooks": [progress_hook],
        "nocheckcertificate": False,
        "format": format_id or "bestvideo+bestaudio/best",
        "overwrites": False,
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "web"]
            }
        }
    }

    if config.FFMPEG_PATH:
        ydl_opts["ffmpeg_location"] = config.FFMPEG_PATH

    safe_audio_format = preferred_audio_format if preferred_audio_format in ("mp3", "m4a", "flac", "opus", "wav", "aac") else "mp3"

    if is_audio_only:
        ydl_opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": safe_audio_format,
            "preferredquality": "192",
        }]
    else:
        # For video downloads, merge video and audio into a standard MP4 file
        ydl_opts["merge_output_format"] = "mp4"

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(safe_url, download=True)
            filename = ydl.prepare_filename(info)
            if is_audio_only:
                filename = str(Path(filename).with_suffix(f".{safe_audio_format}"))
            elif not Path(filename).exists():
                # Check if merge_output_format altered the extension (e.g. to .mp4 or .mkv)
                mp4_cand = Path(filename).with_suffix(".mp4")
                mkv_cand = Path(filename).with_suffix(".mkv")
                webm_cand = Path(filename).with_suffix(".webm")
                if mp4_cand.exists():
                    filename = str(mp4_cand)
                elif mkv_cand.exists():
                    filename = str(mkv_cand)
                elif webm_cand.exists():
                    filename = str(webm_cand)
                else:
                    # Check requested_downloads dict from yt-dlp info
                    for rd in info.get("requested_downloads", []):
                        fp = rd.get("filepath")
                        if fp and Path(fp).exists():
                            filename = fp
                            break

            final_path = Path(filename)
            file_size = final_path.stat().st_size if final_path.exists() else 0

            completed_updates = {
                "status": "completed",
                "progress": 100.0,
                "output_path": str(final_path),
                "file_size": file_size,
                "speed": "",
                "eta": ""
            }
            db.update_job(job_id, completed_updates)

            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    broadcaster.broadcast("job_completed", {"job_id": job_id, **completed_updates}),
                    loop
                )

    except yt_dlp.utils.DownloadCancelled:
        db.update_job(job_id, {"status": "canceled", "error_message": "Canceled by user."})
        if loop and loop.is_running():
            asyncio.run_coroutine_threadsafe(
                broadcaster.broadcast("job_canceled", {"job_id": job_id}),
                loop
            )
    except Exception as e:
        error_msg = str(e)
        db.update_job(job_id, {"status": "failed", "error_message": error_msg})
        if loop and loop.is_running():
            asyncio.run_coroutine_threadsafe(
                broadcaster.broadcast("job_failed", {"job_id": job_id, "error": error_msg}),
                loop
            )
    finally:
        active_cancellations.pop(job_id, None)

def cancel_download(job_id: str) -> bool:
    if job_id in active_cancellations:
        active_cancellations[job_id].set()
        return True
    return False
