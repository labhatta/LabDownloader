import json
from pathlib import Path

def _get_version() -> str:
    try:
        pkg_path = Path(__file__).resolve().parents[2] / "package.json"
        if pkg_path.exists():
            return json.loads(pkg_path.read_text(encoding="utf-8")).get("version", "1.0.5")
    except Exception:
        pass
    return "1.0.5"

__version__ = _get_version()
