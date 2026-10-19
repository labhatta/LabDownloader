import os
import subprocess
import sys
from pathlib import Path

def build():
    root = Path(__file__).resolve().parent.parent
    entry = root / "services" / "downloader" / "main.py"
    dist_dir = root / "dist-backend"

    print(f"[*] Building standalone backend executable from {entry}...")
    cmd = [
        sys.executable,
        "-m", "PyInstaller",
        "--name=lab-engine",
        "--onefile",
        f"--distpath={dist_dir}",
        f"--workpath={root / 'build' / 'pywork'}",
        f"--specpath={root / 'build'}",
        "--clean",
        "--noconfirm",
        "--collect-all=pymupdf",
        "--collect-all=curl_cffi",
        str(entry)
    ]
    print(f"[*] Running: {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=str(root))
    if res.returncode == 0:
        print(f"[+] Standalone engine successfully built in: {dist_dir}")
    else:
        print(f"[-] PyInstaller build failed with code: {res.returncode}")
        sys.exit(res.returncode)

if __name__ == "__main__":
    build()
