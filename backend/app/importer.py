"""Read-only inspection of local folders, used by the "Import projects" flow.

Nothing here writes to disk. A folder is inspected only by looking at a handful
of well-known files at its top level (package.json, README, requirements.txt,
...), so scanning a directory with dozens of projects stays fast.
"""
import hashlib
import json
import os
import re
import string
from pathlib import Path
from typing import Any, Optional

# Folders that are never useful as projects or as places to browse into.
SKIP_DIRS = {
    "node_modules",
    "$recycle.bin",
    "system volume information",
    "__pycache__",
    ".git",
    ".venv",
    "venv",
    ".next",
    "dist",
    "build",
}

DOC_NAMES = ("readme.md", "readme.txt", "readme", "claude.md", "agents.md", "design.md", "architecture.md")
# JSON metadata files: imported as context and read for descriptions.
# project.json is this app's own convention: {"description": "...", "tags": [...], "category": "..."}
JSON_DOC_NAMES = ("project.json", "package.json", "composer.json", "app.json", "manifest.json")
MAX_DOCS = 9

# Files whose changes should not count as "the project changed" (databases,
# logs and caches the running app rewrites constantly).
IGNORED_SUFFIXES = (".log", ".db", ".sqlite", ".sqlite3", ".pyc", ".tmp", ".swp", ".tsbuildinfo", ".lock")
SIGNAL_FILES = set(DOC_NAMES) | set(JSON_DOC_NAMES) | {
    "requirements.txt", "pyproject.toml", "pubspec.yaml", "vercel.json", "dockerfile", "docker-compose.yml", "wp-config.php",
}
MAX_DOC_BYTES = 40_000


def is_browsable(entry: os.DirEntry) -> bool:
    name = entry.name
    return not name.startswith(".") and name.lower() not in SKIP_DIRS


def list_roots() -> list[dict[str, str]]:
    """Filesystem roots: drive letters on Windows, "/" elsewhere."""
    if os.name == "nt":
        return [{"name": f"{d}:\\", "path": f"{d}:\\"} for d in string.ascii_uppercase if os.path.exists(f"{d}:\\")]
    return [{"name": "/", "path": "/"}]


def list_subdirs(path: Path) -> list[dict[str, str]]:
    dirs: list[dict[str, str]] = []
    try:
        with os.scandir(path) as it:
            for entry in it:
                try:
                    if entry.is_dir(follow_symlinks=False) and is_browsable(entry):
                        dirs.append({"name": entry.name, "path": str(Path(entry.path))})
                except OSError:
                    continue  # unreadable entry, skip it
    except (PermissionError, FileNotFoundError, NotADirectoryError):
        return []
    return sorted(dirs, key=lambda d: d["name"].lower())


def normalize(path: str | Path) -> str:
    """Stable key for "is this folder already imported" comparisons."""
    return os.path.normcase(os.path.abspath(str(path)))


def _read_text(path: Path, limit: int = MAX_DOC_BYTES) -> Optional[str]:
    try:
        with open(path, "rb") as f:
            raw = f.read(limit)
    except OSError:
        return None
    return raw.decode("utf-8", errors="replace")


def _read_json(path: Path) -> dict[str, Any]:
    text = _read_text(path, 400_000)
    if not text:
        return {}
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else {}
    except ValueError:
        return {}


def _readme_summary(folder: Path) -> Optional[str]:
    """First real paragraph of the README, stripped of markdown noise."""
    for name in os.listdir(folder):
        if name.lower() not in ("readme.md", "readme.txt", "readme"):
            continue
        text = _read_text(folder / name, 12_000)
        if not text:
            continue
        paragraph: list[str] = []
        for raw in text.splitlines():
            line = raw.strip().lstrip(">").strip()  # drop blockquote markers
            if not line:
                if paragraph:
                    break
                continue
            # skip headings, badges, html, tables, fences, quotes-only rules
            if line.startswith(("#", "!", "<", "|", "```", "---", "===", "[![", "[!")):
                if paragraph:
                    break
                continue
            paragraph.append(line)
        if paragraph:
            summary = " ".join(paragraph)
            if re.match(r"(?i)this is a .{0,40}project bootstrapped with", summary):
                return None  # create-next-app / create-react-app boilerplate
            summary = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", summary)  # [text](url) -> text
            summary = re.sub(r"[*_`>]+", "", summary).strip()
            if len(summary) > 240:
                summary = summary[:237].rsplit(" ", 1)[0] + "..."
            return summary or None
    return None


def _deps(pkg: dict[str, Any]) -> set[str]:
    out: set[str] = set()
    for key in ("dependencies", "devDependencies"):
        section = pkg.get(key)
        if isinstance(section, dict):
            out.update(k.lower() for k in section)
    return out


def detect(folder: Path) -> dict[str, Any]:
    """Description, tech-stack tags and a category guess for one folder."""
    try:
        names = {n.lower() for n in os.listdir(folder)}
    except OSError:
        names = set()

    tags: list[str] = []

    def add(tag: str) -> None:
        if tag not in tags:
            tags.append(tag)

    description: Optional[str] = None
    category: Optional[str] = None

    # project.json is the explicit, user-written source: it wins over anything guessed.
    project_meta = _read_json(folder / "project.json") if "project.json" in names else {}

    pkg = _read_json(folder / "package.json") if "package.json" in names else {}
    if pkg:
        deps = _deps(pkg)
        description = (pkg.get("description") or "").strip() or None
        if "next" in deps:
            add("Next.js")
        if "react-native" in deps or "expo" in deps:
            add("React Native")
            category = "Mobile"
        if "react" in deps:
            add("React")
        if "vue" in deps or "nuxt" in deps:
            add("Vue")
        if "svelte" in deps or "@sveltejs/kit" in deps:
            add("Svelte")
        if "tailwindcss" in deps:
            add("Tailwind")
        if "typescript" in deps:
            add("TypeScript")
        if "express" in deps or "fastify" in deps or "hono" in deps:
            add("Node")
        if "electron" in deps:
            add("Electron")
            category = category or "Web"
        if not tags:
            add("Node")
        category = category or "Web"

    if any(n in names for n in ("requirements.txt", "pyproject.toml")):
        req = (_read_text(folder / "requirements.txt", 20_000) or "") + (_read_text(folder / "pyproject.toml", 20_000) or "")
        req_l = req.lower()
        add("Python")
        if "fastapi" in req_l:
            add("FastAPI")
        if "django" in req_l:
            add("Django")
        if "flask" in req_l:
            add("Flask")
        if any(k in req_l for k in ("openai", "anthropic", "litellm", "langchain", "torch", "transformers")):
            add("AI")
            category = category or "AI"

    if "composer.json" in names or "wp-config.php" in names or "wp-content" in names or "functions.php" in names:
        add("PHP")
    if "wp-config.php" in names or "wp-content" in names:
        add("WordPress")
        category = category or "Web"
        if (folder / "wp-content" / "plugins" / "woocommerce").exists():
            add("WooCommerce")
            category = "E-commerce"

    if "pubspec.yaml" in names:
        add("Flutter")
        category = "Mobile"
    if "vercel.json" in names:
        add("Vercel")
    if "dockerfile" in names or "docker-compose.yml" in names:
        add("Docker")
    if "index.html" in names and not tags:
        add("HTML")
        category = category or "Web"
    if any(n.endswith(".csproj") or n.endswith(".sln") for n in names):
        add("C#")

    # other JSON files that commonly carry a description
    if description is None and "composer.json" in names:
        description = (_read_json(folder / "composer.json").get("description") or "").strip() or None
    if description is None and "app.json" in names:
        app = _read_json(folder / "app.json")
        expo = app.get("expo") if isinstance(app.get("expo"), dict) else {}
        description = (expo.get("description") or app.get("description") or "").strip() or None
    if description is None and "manifest.json" in names:
        description = (_read_json(folder / "manifest.json").get("description") or "").strip() or None

    if description is None:
        description = _readme_summary(folder) if names else None

    # explicit project.json overrides whatever was guessed
    meta_desc = project_meta.get("description")
    if isinstance(meta_desc, str) and meta_desc.strip():
        description = meta_desc.strip()
    meta_tags = project_meta.get("tags")
    if isinstance(meta_tags, list) and meta_tags:
        tags = [str(t).strip() for t in meta_tags if str(t).strip()]
    meta_category = project_meta.get("category")
    if isinstance(meta_category, str) and meta_category.strip():
        category = meta_category.strip()

    return {"description": description, "tags": tags[:6], "category": category}


def count_entries(folder: Path, cap: int = 5000) -> int:
    """Approximate file count (bounded walk, skipping heavy directories)."""
    total = 0
    for _root, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if d.lower() not in SKIP_DIRS and not d.startswith(".")]
        total += len(files)
        if total >= cap:
            return cap
    return total


def collect_docs(folder: Path) -> list[dict[str, str]]:
    """README / CLAUDE.md style documents to load as project context."""
    docs: list[dict[str, str]] = []
    try:
        listing = sorted(os.listdir(folder), key=str.lower)
    except OSError:
        return docs
    for name in listing:
        if name.lower() not in DOC_NAMES and name.lower() not in JSON_DOC_NAMES:
            continue
        path = folder / name
        if not path.is_file():
            continue
        text = _read_text(path)
        if text and text.strip():
            docs.append({"title": name, "content": text, "path": str(path)})
        if len(docs) >= MAX_DOCS:
            break
    return docs


def folder_state(folder: Path, max_depth: int = 4, cap: int = 3000) -> tuple[str, int]:
    """Cheap change detector for a project folder.

    Hashes the top-level listing, the size and mtime of the files that drive
    detection (README, package.json, ...), plus the file count and newest mtime
    of a bounded walk. Any edit, add or delete changes the hash. Heavy or noisy
    folders (node_modules, .next, hidden dirs) and files (logs, databases) are
    ignored so a running dev server does not look like constant activity.
    """
    h = hashlib.sha1()
    try:
        h.update("|".join(sorted(os.listdir(folder))).encode("utf-8", "replace"))
    except OSError:
        return "", 0

    count = 0
    newest = 0
    signals: list[str] = []
    stack: list[tuple[str, int]] = [(str(folder), 0)]
    while stack and count < cap:
        current, depth = stack.pop()
        try:
            with os.scandir(current) as it:
                for entry in it:
                    name = entry.name
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            if depth < max_depth and not name.startswith(".") and name.lower() not in SKIP_DIRS:
                                stack.append((entry.path, depth + 1))
                        elif entry.is_file(follow_symlinks=False):
                            low = name.lower()
                            if low.endswith(IGNORED_SUFFIXES):
                                continue
                            st = entry.stat()
                            count += 1
                            newest = max(newest, st.st_mtime_ns)
                            if depth == 0 and low in SIGNAL_FILES:
                                signals.append(f"{low}:{st.st_size}:{st.st_mtime_ns}")
                    except OSError:
                        continue
        except OSError:
            continue

    h.update(f"|{count}|{newest}|".encode())
    h.update("|".join(sorted(signals)).encode())
    return h.hexdigest(), newest


def fingerprint(folder: Path) -> str:
    return folder_state(folder)[0]


def mtime_iso(mtime_ns: int) -> Optional[str]:
    """A file-modification time as the app's ISO timestamp (None if unknown)."""
    if not mtime_ns:
        return None
    from datetime import datetime, timezone

    return datetime.fromtimestamp(mtime_ns / 1e9, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
