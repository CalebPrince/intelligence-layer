"""Importing folders as projects, plus the live scanner that keeps watched
directories in sync.

Two jobs run on the same 30-second loop:

1. New folders: sub-folders that appear in a watched directory become projects.
2. Existing projects: every imported project's folder is fingerprinted; when its
   files change on disk the project is refreshed (description, tags, category,
   and the README / JSON docs loaded as context), and its "updated" time bumps.
   Fields a person edited by hand are left alone.

A "watched folder" is a directory (e.g. D:\\Websites) whose sub-folders are
projects. When one is registered we snapshot the sub-folders that already exist
(the baseline) so only genuinely new folders are picked up afterwards. Every
`watch_interval_seconds` the scanner lists the directory again and imports any
sub-folder that is new. A new folder must be seen on two consecutive scans
before it is imported, so a folder that is still being copied or created is not
imported half-empty.
"""
import asyncio
import logging
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app import database, importer

log = logging.getLogger("import_service")

# Most recent auto-imports, newest last. In memory only: the UI uses it to show
# a "new project detected" notice; the projects themselves are persisted.
RECENT: deque[dict[str, Any]] = deque(maxlen=50)

# Recent refreshes of existing projects, newest last (for the UI notice).
UPDATES: deque[dict[str, Any]] = deque(maxlen=50)

# watch id -> {normalized folder key: first-seen timestamp}. Debounce state.
_SEEN: dict[str, dict[str, float]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def import_folder(owner_id: str, folder: Path, import_docs: bool = True) -> tuple[dict[str, Any], int]:
    """Create one project from a folder. Returns (project, number of context docs added)."""
    info = importer.detect(folder)
    project = database.create_project(
        owner_id,
        folder.name or str(folder),
        info["description"],
        "active",
        info["category"],
        info["tags"],
        source_path=str(folder),
    )
    docs = 0
    if import_docs:
        for doc in importer.collect_docs(folder):
            database.create_context_item(
                project["id"], "document", doc["title"], doc["content"], {"source": "import", "path": doc["path"]}
            )
            docs += 1
    fp, newest = importer.folder_state(folder)
    database.set_project_detection(project["id"], fp, info, importer.mtime_iso(newest))
    project["updated_at"] = importer.mtime_iso(newest) or project["updated_at"]
    return project, docs


def _iso_of(value: Any) -> str:
    """Normalise a stored/returned timestamp to the app's 3-digit ISO form for comparison."""
    if not value:
        return ""
    text = value.isoformat() if hasattr(value, "isoformat") else str(value)
    return text.replace("+00:00", "Z")[:23] + "Z" if len(text) >= 23 else text


def _same(a: Any, b: Any) -> bool:
    """Equality that treats None / "" / [] as the same "nothing"."""
    return (a or None) == (b or None)


def sync_project(project: dict[str, Any], *, force: bool = False) -> Optional[list[str]]:
    """Refresh one imported project from its folder.

    Returns the list of what changed (empty list = re-checked, nothing to
    update), or None if the folder is unreachable or nothing changed since the
    last check. The first check of a project imported before syncing existed is
    a silent baseline: it fills in anything missing (e.g. JSON docs) but does
    not count as activity.
    """
    folder = Path(project["source_path"])
    if not folder.is_dir():
        return None
    fp, newest = importer.folder_state(folder)
    if fp == project.get("fingerprint") and not force:
        return None

    first = project.get("fingerprint") is None and not force
    info = importer.detect(folder)

    # Only overwrite a field if it still holds what auto-detection last produced,
    # i.e. nobody edited it by hand. Projects imported before this snapshot
    # existed have never been edited, so their current values count as detected.
    previous = project.get("detected") or {
        "description": project.get("description"),
        "tags": project.get("tags") or [],
        "category": project.get("category"),
    }
    fields: dict[str, Any] = {}
    changes: list[str] = []
    for key in ("description", "tags", "category"):
        current = project.get(key)
        if _same(current, previous.get(key)) and not _same(current, info[key]):
            fields[key] = info[key]
            changes.append(key)

    # documents loaded from disk: add new, replace edited, drop deleted
    on_disk = {d["path"]: d for d in importer.collect_docs(folder)}
    stored = {i["metadata"].get("path"): i for i in database.list_import_context(project["id"])}
    docs_changed = 0
    for path, item in stored.items():
        if item["metadata"].get("edited"):
            continue  # changed in the app on purpose: keep that version
        doc = on_disk.get(path)
        if doc is None:
            database.delete_context_item(project["id"], item["id"])
            docs_changed += 1
        elif doc["content"] != item["content"]:
            # update in place so the item keeps its id, history and "used in" record
            database.update_context_item(project["id"], item["id"], content=doc["content"], source="synced")
            docs_changed += 1
    for path, doc in on_disk.items():
        if path not in stored:
            database.create_context_item(
                project["id"], "document", doc["title"], doc["content"], {"source": "import", "path": path}
            )
            docs_changed += 1
    if docs_changed:
        changes.append("docs")

    if not first and not changes:
        changes.append("files")  # something on disk changed, just nothing we track individually

    # "Modified" = when the files really changed. The first (baseline) check
    # backfills it from the folder; later ones use the newest file time, or now
    # when the change was a deletion (which leaves no newer file behind).
    file_time = importer.mtime_iso(newest)
    if first:
        updated_at = file_time
    elif file_time and file_time > _iso_of(project.get("updated_at")):
        updated_at = file_time
    else:
        updated_at = _now_iso()
    database.apply_project_sync(project["id"], fields, fp, info, updated_at)
    if changes and not first:
        UPDATES.append(
            {
                "at": _now_iso(),
                "project_id": project["id"],
                "name": project["name"],
                "changes": changes,
            }
        )
        log.info("refreshed %s (%s)", project["name"], ", ".join(changes))
    return [] if first else changes


def sync_all() -> int:
    """Re-check every imported project. Returns how many were refreshed."""
    refreshed = 0
    for project in database.list_syncable_projects():
        try:
            changes = sync_project(project)
        except Exception:  # noqa: BLE001 - one bad folder must not stop the pass
            log.exception("sync failed for %s", project.get("name"))
            continue
        if changes:
            refreshed += 1
    return refreshed


def baseline_keys(folder: Path) -> list[str]:
    return sorted(importer.normalize(d["path"]) for d in importer.list_subdirs(folder))


def pending_folders(watch: dict[str, Any]) -> list[str]:
    """Sub-folders that are new (not known, not imported yet, not excluded), without importing."""
    folder = Path(watch["path"])
    if not folder.is_dir():
        return []
    known = set(watch["known"])
    excluded = set(watch.get("excluded") or [])
    imported = {importer.normalize(p) for p in database.imported_source_paths(watch["owner_id"])}
    return [
        d["path"]
        for d in importer.list_subdirs(folder)
        if (key := importer.normalize(d["path"])) not in known and key not in imported and key not in excluded
    ]


def scan_watch(watch: dict[str, Any], *, debounce: bool = True, force: bool = False) -> list[dict[str, Any]]:
    """Scan one watched folder once. Returns the projects imported by this scan."""
    folder = Path(watch["path"])
    if not folder.is_dir():
        return []  # drive unplugged / folder renamed: try again next cycle

    owner_id = watch["owner_id"]
    imported_keys = {importer.normalize(p) for p in database.imported_source_paths(owner_id)}
    known = set(watch["known"])
    excluded = set(watch.get("excluded") or [])
    seen = _SEEN.setdefault(watch["id"], {})
    current = importer.list_subdirs(folder)
    current_keys = {importer.normalize(d["path"]) for d in current}
    created: list[dict[str, Any]] = []

    for d in current:
        key = importer.normalize(d["path"])
        if key in known or key in excluded:
            continue
        if key in imported_keys:  # imported by hand (e.g. from the dialog)
            known.add(key)
            continue
        if not (watch["auto_import"] or force):
            continue  # reported as pending, left for the user
        if debounce and key not in seen:
            seen[key] = datetime.now().timestamp()
            continue  # first sighting: wait one more cycle
        try:
            project, _docs = import_folder(owner_id, Path(d["path"]))
        except Exception:  # noqa: BLE001 - one bad folder must not stop the scan
            log.exception("could not import %s", d["path"])
            continue
        known.add(key)
        imported_keys.add(key)
        created.append(project)
        RECENT.append(
            {
                "at": _now_iso(),
                "watch_id": watch["id"],
                "project_id": project["id"],
                "name": project["name"],
                "path": d["path"],
            }
        )
        log.info("auto-imported %s", d["path"])

    for key in list(seen):
        if key not in current_keys or key in known:
            del seen[key]

    database.update_watch(watch["id"], known=sorted(known), last_scan_at=_now_iso())
    return created


def scan_all() -> int:
    total = 0
    for watch in database.list_all_watches():
        try:
            total += len(scan_watch(watch))
        except Exception:  # noqa: BLE001
            log.exception("scan failed for %s", watch.get("path"))
    try:
        sync_all()
    except Exception:  # noqa: BLE001
        log.exception("project sync pass failed")
    return total


async def watch_loop(interval_seconds: int) -> None:
    """Runs for the lifetime of the app; cancelled on shutdown."""
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await asyncio.to_thread(scan_all)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("watch loop iteration failed")
