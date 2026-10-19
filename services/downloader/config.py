import os
import shutil
from pathlib import Path
from typing import Optional
from pydantic import BaseModel

class AppConfig:
    PORT: int = 52174
    HOST: str = "127.0.0.1"
    AUTH_TOKEN: str = "devtoken1234567890abcdef"
    
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = Path.home() / ".labdownloader"
    DEFAULT_DOWNLOAD_DIR: Path = Path.home() / "Downloads" / "LabDownloader"
    DB_PATH: Path = DATA_DIR / "labdownloader.db"
    LOGS_PATH: Path = DATA_DIR / "labdownloader.log"

    # Dependency paths
    FFMPEG_PATH: Optional[str] = shutil.which("ffmpeg")
    FFPROBE_PATH: Optional[str] = shutil.which("ffprobe")
    YTDLP_PATH: Optional[str] = shutil.which("yt-dlp")
    NODE_PATH: Optional[str] = shutil.which("node")

    @classmethod
    def initialize(cls, port: Optional[int] = None, token: Optional[str] = None):
        if port:
            cls.PORT = port
        if token:
            cls.AUTH_TOKEN = token
            
        cls.DATA_DIR.mkdir(parents=True, exist_ok=True)
        cls.DEFAULT_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

config = AppConfig()
