import asyncio
import os
import threading
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from services.downloader.config import config
from services.downloader.database import db
from services.downloader.direct_engine import cancel_direct_download, run_direct_download
from services.downloader.security import sanitize_filename, validate_url
from services.downloader.sse import broadcaster
from services.downloader.stream_engine import cancel_stream_download, run_stream_download
from services.downloader.ytdlp_engine import cancel_download as cancel_ytdlp_download, run_ytdlp_download

class JobManager:
    def __init__(self):
        self._queue: asyncio.Queue = asyncio.Queue()
        self._active_jobs: Dict[str, asyncio.Task] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._worker_tasks: List[asyncio.Task] = []

    def start(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

        # Clean up orphaned jobs left over from previous process shutdown
        existing_jobs = db.list_jobs(limit=200)
        for j in existing_jobs:
            if j["status"] in ("downloading", "processing", "analyzing"):
                db.update_job(j["id"], {
                    "status": "failed",
                    "error_message": "Download interrupted by app shutdown. Click retry to resume."
                })
            elif j["status"] == "queued":
                self._queue.put_nowait(j["id"])

        settings = db.get_settings()
        max_concurrent = int(settings.get("max_concurrent", "3"))

        for _ in range(max_concurrent):
            t = loop.create_task(self._worker())
            self._worker_tasks.append(t)

    async def _worker(self):
        while True:
            job_id = await self._queue.get()
            try:
                await self._execute_job(job_id)
            except Exception as e:
                db.update_job(job_id, {"status": "failed", "error_message": str(e)})
            finally:
                self._queue.task_done()

    async def _execute_job(self, job_id: str):
        job = db.get_job(job_id)
        if not job or job["status"] == "canceled":
            return

        url = job["url"]
        format_id = job.get("format_id") or "best"
        ext = job.get("ext", "mp4")
        source = job.get("source", "Generic")

        settings = db.get_settings()
        download_dir = Path(settings.get("download_dir", str(config.DEFAULT_DOWNLOAD_DIR)))
        download_dir.mkdir(parents=True, exist_ok=True)

        is_audio = ext in ("mp3", "m4a", "flac", "opus", "wav", "aac") or format_id in ("bestaudio/best", "bestaudio", "ba", "ba*") or format_id.startswith("bestaudio")

        # Determine job type
        from services.downloader.document_engine import is_document_url, run_document_download
        if source in ("Scribd", "Academia.edu", "SlideShare", "Direct Document") or is_document_url(url):
            task = asyncio.create_task(run_document_download(job_id, url, download_dir, job['title']))
            self._active_jobs[job_id] = task
            await task
        elif "HLS" in source or url.endswith(".m3u8") or ".m3u8" in url.lower():
            task = asyncio.create_task(run_stream_download(job_id, url, download_dir, f"{job['title']}.mp4"))
            self._active_jobs[job_id] = task
            await task
        elif source == "Direct" or ext in ("pdf", "zip", "bin", "iso"):
            task = asyncio.create_task(run_direct_download(job_id, url, download_dir, job["title"]))
            self._active_jobs[job_id] = task
            await task
        else:
            # yt-dlp job runs in thread pool
            loop = asyncio.get_running_loop()
            task = loop.run_in_executor(
                None,
                run_ytdlp_download,
                job_id,
                url,
                format_id,
                download_dir,
                is_audio,
                ext,
                loop
            )
            await task

        self._active_jobs.pop(job_id, None)

    async def enqueue_job(
        self,
        url: str,
        title: str,
        thumbnail: Optional[str] = None,
        source: str = "Generic",
        format_id: str = "best",
        ext: str = "mp4"
    ) -> Dict[str, Any]:
        safe_url = validate_url(url)
        job_id = f"job_{uuid.uuid4().hex[:12]}"

        job_data = {
            "id": job_id,
            "url": safe_url,
            "title": title or "Lab Download",
            "thumbnail": thumbnail,
            "source": source,
            "format_id": format_id,
            "ext": ext,
            "status": "queued",
            "progress": 0.0
        }
        created = db.create_job(job_data)
        await self._queue.put(job_id)
        await broadcaster.broadcast("job_queued", created)
        return created

    async def cancel_job(self, job_id: str) -> bool:
        job = db.get_job(job_id)
        if not job:
            return False

        # Attempt engine cancel
        canceled_ytdlp = cancel_ytdlp_download(job_id)
        canceled_direct = cancel_direct_download(job_id)
        canceled_stream = cancel_stream_download(job_id)

        if job_id in self._active_jobs:
            self._active_jobs[job_id].cancel()
            self._active_jobs.pop(job_id, None)

        db.update_job(job_id, {"status": "canceled", "error_message": "Canceled by user."})
        await broadcaster.broadcast("job_canceled", {"job_id": job_id})
        return True

    async def retry_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        job = db.get_job(job_id)
        if not job:
            return None

        db.update_job(job_id, {
            "status": "queued",
            "progress": 0.0,
            "speed": "",
            "eta": "",
            "error_message": None
        })
        await self._queue.put(job_id)
        updated = db.get_job(job_id)
        await broadcaster.broadcast("job_queued", updated)
        return updated

job_manager = JobManager()
