import argparse
import asyncio
import os
import shutil
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Header, Query, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import uvicorn
import yt_dlp

from services.downloader import __version__
from services.downloader.config import config
from services.downloader.database import db
from services.downloader.inspector import extract_candidates_from_har, probe_url
from services.downloader.job_manager import job_manager
from services.downloader.security import SecurityError, validate_url
from services.downloader.sse import broadcaster
from services.downloader.stream_engine import inspect_stream_manifest
from services.downloader.ytdlp_engine import extract_media_info

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start job queue worker loop
    loop = asyncio.get_running_loop()
    job_manager.start(loop)
    yield
    # Shutdown logic if needed

app = FastAPI(
    title="LabDownloader Local Engine",
    version=__version__,
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security Token Dependency
async def verify_token(
    request: Request,
    x_lab_token: Optional[str] = Header(None, alias="X-Lab-Token"),
    token_param: Optional[str] = Query(None, alias="token")
):
    provided = x_lab_token or token_param
    # If no token configured or matches
    if config.AUTH_TOKEN and provided != config.AUTH_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid or missing authentication token."
        )
    return True

# Models
class AnalyzeRequest(BaseModel):
    url: str

class CreateJobRequest(BaseModel):
    url: str
    title: Optional[str] = None
    thumbnail: Optional[str] = None
    source: Optional[str] = "Generic"
    format_id: Optional[str] = "best"
    ext: Optional[str] = "mp4"

class BatchCreateJobsRequest(BaseModel):
    items: List[CreateJobRequest]


class ProbeRequest(BaseModel):
    url: str

class SettingsUpdateRequest(BaseModel):
    download_dir: Optional[str] = None
    max_concurrent: Optional[int] = None
    preferred_format: Optional[str] = None
    preferred_resolution: Optional[str] = None
    theme: Optional[str] = None
    minimize_to_tray: Optional[bool] = None
    notify_on_complete: Optional[bool] = None

# Routes
@app.get("/api/health")
async def health_check():
    """Unauthenticated health probe for Electron startup verification."""
    return {"status": "ok", "service": "LabDownloader", "version": __version__}

@app.get("/api/system/info", dependencies=[Depends(verify_token)])
async def get_system_info():
    ytdlp_version = yt_dlp.version.__version__
    ffmpeg_available = bool(config.FFMPEG_PATH and os.path.exists(config.FFMPEG_PATH))

    # Free disk space
    try:
        config.DEFAULT_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
        check_path = config.DEFAULT_DOWNLOAD_DIR
    except Exception:
        check_path = Path.home()
    total_b, used_b, free_b = shutil.disk_usage(str(check_path))

    return {
        "ytdlp_version": ytdlp_version,
        "ffmpeg_path": config.FFMPEG_PATH or "Not found",
        "ffmpeg_available": ffmpeg_available,
        "python_version": sys.version.split()[0],
        "default_download_dir": str(config.DEFAULT_DOWNLOAD_DIR),
        "disk_free_bytes": free_b,
        "disk_free_gb": round(free_b / (1024**3), 2)
    }

@app.post("/api/analyze", dependencies=[Depends(verify_token)])
async def analyze_url(req: AnalyzeRequest):
    try:
        url = req.url.strip()
        # Check if stream manifest
        if ".m3u8" in url.lower() or ".mpd" in url.lower():
            info = await inspect_stream_manifest(url)
            return {
                "type": "stream",
                "info": info
            }

        # Check if document URL (Scribd, Academia, PDF, etc.)
        from services.downloader.document_engine import is_document_url, analyze_document_url
        if is_document_url(url):
            info = analyze_document_url(url)
            return {
                "type": "document",
                "info": info
            }

        # Otherwise yt-dlp analysis
        info = extract_media_info(url)
        return {
            "type": "media",
            "info": info
        }
    except SecurityError as se:
        raise HTTPException(status_code=400, detail=f"Security error: {str(se)}")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to analyze URL: {str(e)}")

@app.get("/api/jobs", dependencies=[Depends(verify_token)])
async def list_jobs(status_filter: Optional[str] = Query(None, alias="status"), limit: int = 100):
    return db.list_jobs(status=status_filter, limit=limit)

@app.post("/api/jobs", dependencies=[Depends(verify_token)])
async def create_job(req: CreateJobRequest):
    try:
        job = await job_manager.enqueue_job(
            url=req.url,
            title=req.title or "Lab Download",
            thumbnail=req.thumbnail,
            source=req.source or "Generic",
            format_id=req.format_id or "best",
            ext=req.ext or "mp4"
        )
        return job
    except SecurityError as se:
        raise HTTPException(status_code=400, detail=str(se))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/jobs/batch", dependencies=[Depends(verify_token)])
async def create_jobs_batch(req: BatchCreateJobsRequest):
    created_jobs = []
    errors = []
    for item in req.items:
        try:
            job = await job_manager.enqueue_job(
                url=item.url,
                title=item.title or "Lab Download",
                thumbnail=item.thumbnail,
                source=item.source or "Generic",
                format_id=item.format_id or "best",
                ext=item.ext or "mp4"
            )
            created_jobs.append(job)
        except Exception as e:
            errors.append({"url": item.url, "error": str(e)})
    return {
        "jobs": created_jobs,
        "errors": errors,
        "total_queued": len(created_jobs)
    }


@app.get("/api/jobs/{job_id}", dependencies=[Depends(verify_token)])
async def get_job(job_id: str):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job

@app.post("/api/jobs/{job_id}/cancel", dependencies=[Depends(verify_token)])
async def cancel_job(job_id: str):
    success = await job_manager.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found or could not be canceled.")
    return {"status": "canceled", "job_id": job_id}

@app.post("/api/jobs/{job_id}/retry", dependencies=[Depends(verify_token)])
async def retry_job(job_id: str):
    job = await job_manager.retry_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job

@app.delete("/api/jobs/{job_id}", dependencies=[Depends(verify_token)])
async def delete_job(job_id: str):
    success = db.delete_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found.")
    return {"status": "deleted", "job_id": job_id}

@app.delete("/api/jobs", dependencies=[Depends(verify_token)])
async def clear_jobs(keep_active: bool = Query(True)):
    count = db.clear_history(keep_active=keep_active)
    return {"cleared_count": count}

@app.get("/api/settings", dependencies=[Depends(verify_token)])
async def get_settings():
    return db.get_settings()

@app.post("/api/settings", dependencies=[Depends(verify_token)])
async def update_settings(req: SettingsUpdateRequest):
    data = req.model_dump(exclude_unset=True)
    db.update_settings(data)
    return db.get_settings()

@app.post("/api/inspector/probe", dependencies=[Depends(verify_token)])
async def probe_endpoint(req: ProbeRequest):
    try:
        result = await probe_url(req.url)
        return result
    except SecurityError as se:
        raise HTTPException(status_code=400, detail=str(se))
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/api/inspector/har", dependencies=[Depends(verify_token)])
async def upload_har(file: UploadFile = File(...)):
    try:
        content = await file.read()
        text = content.decode("utf-8", errors="ignore")
        candidates = extract_candidates_from_har(text)
        return {
            "filename": file.filename,
            "candidates_count": len(candidates),
            "candidates": candidates
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse HAR: {str(e)}")

@app.get("/api/events")
async def event_stream(token: Optional[str] = Query(None)):
    """Server-Sent Events endpoint for real-time progress updates."""
    if config.AUTH_TOKEN and token != config.AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")

    return StreamingResponse(
        broadcaster.event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.post("/api/system/shutdown", dependencies=[Depends(verify_token)])
async def shutdown():
    """Cleanly terminate backend process on application close."""
    def terminate():
        sys.exit(0)
    asyncio.get_running_loop().call_later(0.5, terminate)
    return {"status": "shutting_down"}

def main():
    parser = argparse.ArgumentParser(description="LabDownloader Backend Service")
    parser.add_argument("--port", type=int, default=52174, help="Port to bind (127.0.0.1)")
    parser.add_argument("--token", type=str, default="devtoken1234567890abcdef", help="Authentication token")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host binding (loopback only)")
    args = parser.parse_args()

    # Enforce loopback host for safety
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print("Security error: Backend service can only bind to loopback address.")
        sys.exit(1)

    config.initialize(port=args.port, token=args.token)
    print(f"[*] LabDownloader Service starting on http://{args.host}:{args.port}")
    print(f"[*] Storage Database: {config.DB_PATH}")
    print(f"[*] Default Downloads: {config.DEFAULT_DOWNLOAD_DIR}")

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")

if __name__ == "__main__":
    main()
