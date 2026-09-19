"""Watched project folders: the live scanner's configuration and status."""
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from app import database, import_service, importer
from app.config import get_settings
from app.schemas import (
    Project,
    ProjectRefresh,
    RecentImport,
    Watch,
    WatchCreate,
    WatchExclude,
    WatchScanResult,
    WatchStatus,
    WatchUpdate,
)

router = APIRouter(prefix="/v1/watch", tags=["watch"])


def _to_watch(row: dict) -> Watch:
    exists = Path(row["path"]).is_dir()
    return Watch(
        id=row["id"],
        path=row["path"],
        auto_import=row["auto_import"],
        last_scan_at=row["last_scan_at"],
        created_at=row["created_at"],
        pending=import_service.pending_folders(row) if exists else [],
        excluded=row.get("excluded") or [],
        exists=exists,
    )


@router.get("", response_model=WatchStatus)
async def status(owner_id: str = Query(...)) -> WatchStatus:
    watches = database.list_watches(owner_id)
    mine = {w["id"] for w in watches}
    return WatchStatus(
        watches=[_to_watch(w) for w in watches],
        recent=[RecentImport(**r) for r in import_service.RECENT if r["watch_id"] in mine],
        updates=[ProjectRefresh(**u) for u in import_service.UPDATES],
        interval_seconds=get_settings().watch_interval_seconds,
    )


@router.post("", response_model=Watch, status_code=201)
async def start_watching(req: WatchCreate) -> Watch:
    folder = Path(req.path).expanduser()
    try:
        folder = folder.resolve()
    except OSError:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not folder.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")

    key = importer.normalize(folder)
    for existing in database.list_watches(req.owner_id):
        if importer.normalize(existing["path"]) == key:
            return _to_watch(existing)  # already watching this folder

    # Baseline: everything already in the folder is "known", so only folders
    # added from now on are picked up.
    watch = database.create_watch(req.owner_id, str(folder), req.auto_import, import_service.baseline_keys(folder))
    return _to_watch(watch)


@router.patch("/{watch_id}", response_model=Watch)
async def update_watch(watch_id: str, req: WatchUpdate) -> Watch:
    watch = database.update_watch(watch_id, auto_import=req.auto_import)
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")
    return _to_watch(watch)


@router.delete("/{watch_id}", status_code=204)
async def stop_watching(watch_id: str) -> None:
    database.delete_watch(watch_id)


@router.post("/{watch_id}/exclude", response_model=Watch)
async def exclude_folder(watch_id: str, req: WatchExclude) -> Watch:
    """Ignore one sub-folder within this watch from now on — it stops showing
    as pending and is never auto-imported, without stopping the whole watch."""
    watch = database.get_watch(watch_id)
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")
    key = importer.normalize(req.path)
    excluded = set(watch.get("excluded") or [])
    excluded.add(key)
    return _to_watch(database.update_watch(watch_id, excluded=sorted(excluded)))


@router.delete("/{watch_id}/exclude", response_model=Watch)
async def unexclude_folder(watch_id: str, path: str = Query(...)) -> Watch:
    """Stop ignoring a previously-excluded sub-folder."""
    watch = database.get_watch(watch_id)
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")
    key = importer.normalize(path)
    excluded = {k for k in (watch.get("excluded") or []) if k != key}
    return _to_watch(database.update_watch(watch_id, excluded=sorted(excluded)))


@router.post("/{watch_id}/scan", response_model=WatchScanResult)
async def scan_now(watch_id: str) -> WatchScanResult:
    """Scan immediately (no two-cycle wait) and import whatever is new."""
    watch = database.get_watch(watch_id)
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")
    created = import_service.scan_watch(watch, debounce=False, force=True)
    refreshed = import_service.sync_all()
    return WatchScanResult(imported=[Project(**p) for p in created], refreshed=refreshed)
