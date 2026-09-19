"""Import local folders as projects.

The backend runs on the same machine as the user (local-first app), so it can
browse the disk for them: a browser file picker cannot hand a web page real
folder paths, only file contents. Everything here is read-only on disk.
"""
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from app import database, import_service, importer
from app.schemas import BrowseEntry, BrowseResult, ImportCandidate, ImportRequest, ImportResult, ImportSkip

router = APIRouter(prefix="/v1/import", tags=["import"])


def _resolve_dir(raw: str) -> Path:
    path = Path(raw).expanduser()
    try:
        path = path.resolve()
    except OSError:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Folder not found")
    if not path.is_dir():
        raise HTTPException(status_code=400, detail="Not a folder")
    return path


@router.get("/browse", response_model=BrowseResult)
async def browse(path: str = Query("", description="Folder to list. Empty lists drives/roots.")) -> BrowseResult:
    if not path.strip():
        return BrowseResult(path="", parent=None, entries=[BrowseEntry(**r) for r in importer.list_roots()])
    folder = _resolve_dir(path)
    is_root = folder.parent == folder
    return BrowseResult(
        path=str(folder),
        parent="" if is_root else str(folder.parent),
        entries=[BrowseEntry(**d) for d in importer.list_subdirs(folder)],
    )


@router.get("/scan", response_model=list[ImportCandidate])
async def scan(
    path: str = Query(..., description="Directory whose sub-folders are project candidates"),
    owner_id: str = Query(...),
    self_folder: bool = Query(False, description="Treat the folder itself as one project"),
) -> list[ImportCandidate]:
    folder = _resolve_dir(path)
    imported = {importer.normalize(p) for p in database.imported_source_paths(owner_id)}
    targets = [folder] if self_folder else [Path(d["path"]) for d in importer.list_subdirs(folder)]

    candidates: list[ImportCandidate] = []
    for target in targets:
        info = importer.detect(target)
        candidates.append(
            ImportCandidate(
                name=target.name or str(target),
                path=str(target),
                description=info["description"],
                category=info["category"],
                tags=info["tags"],
                file_count=importer.count_entries(target),
                already_imported=importer.normalize(target) in imported,
            )
        )
    return candidates


@router.post("", response_model=ImportResult, status_code=201)
async def import_projects(req: ImportRequest) -> ImportResult:
    imported = {importer.normalize(p) for p in database.imported_source_paths(req.owner_id)}
    created: list[dict] = []
    skipped: list[ImportSkip] = []
    context_items = 0

    for raw in req.paths:
        try:
            folder = _resolve_dir(raw)
        except HTTPException as exc:
            skipped.append(ImportSkip(path=raw, reason=str(exc.detail)))
            continue
        key = importer.normalize(folder)
        if key in imported:
            skipped.append(ImportSkip(path=str(folder), reason="Already imported"))
            continue

        project, docs = import_service.import_folder(req.owner_id, folder, req.import_docs)
        imported.add(key)
        created.append(project)
        context_items += docs

    return ImportResult(created=created, skipped=skipped, context_items=context_items)
