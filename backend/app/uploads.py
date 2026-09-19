"""Original files kept next to their extracted text, so they can be downloaded again."""
import re
import shutil
from pathlib import Path

from app.config import BACKEND_DIR

UPLOAD_ROOT = BACKEND_DIR / "data" / "uploads"
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def safe_name(filename: str) -> str:
    name = Path(filename.replace("\\", "/")).name
    name = re.sub(r"[^\w.\- ()\[\]]+", "_", name).strip(" .")
    return name[:120] or "file"


def save_original(item_id: str, filename: str, data: bytes) -> str:
    folder = UPLOAD_ROOT / item_id
    folder.mkdir(parents=True, exist_ok=True)
    name = safe_name(filename)
    (folder / name).write_bytes(data)
    return name


def original_path(item_id: str, name: str) -> Path | None:
    path = UPLOAD_ROOT / item_id / safe_name(name)
    return path if path.is_file() else None


def delete_original(item_id: str) -> None:
    shutil.rmtree(UPLOAD_ROOT / item_id, ignore_errors=True)
