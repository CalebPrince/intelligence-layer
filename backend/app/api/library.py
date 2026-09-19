"""The context library: browse, read, edit and add to a project's knowledge."""
import mimetypes
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from app import context_meta, database, extract, uploads
from app.link_fetch import LinkError, fetch_link
from app.schemas import (
    FolderCreate,
    FolderRename,
    Library,
    LibraryItemDetail,
    LibraryItemUpdate,
    LinkCreate,
    ProjectContextItem,
)

router = APIRouter(prefix="/v1/projects/{project_id}/library", tags=["library"])


def _require_project(project_id: str) -> None:
    if not database.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")


@router.get("", response_model=Library)
async def library(project_id: str, days: Optional[int] = Query(None, ge=1, le=365)) -> dict:
    _require_project(project_id)
    return {
        "items": database.list_library(project_id),
        "stats": database.context_library_stats(project_id, days),
    }


def _related(project_id: str, item: dict, limit: int = 5) -> list[dict]:
    mine = context_meta.keywords(f"{item['title']} {item['content'][:4000]}")
    if not mine:
        return []
    scored = []
    for other in database.get_project_context(project_id, limit=200):
        if other["id"] == item["id"]:
            continue
        theirs = context_meta.keywords(f"{other['title']} {other['content'][:4000]}")
        overlap = len(mine & theirs)
        if overlap >= 3:
            scored.append((overlap, other))
    scored.sort(key=lambda x: -x[0])
    return [
        {
            "id": o["id"],
            "title": o["title"],
            "folder": o.get("folder") or context_meta.auto_folder(o["title"], o["type"]),
        }
        for _, o in scored[:limit]
    ]


def _detail(project_id: str, item_id: str) -> dict:
    if item_id.startswith("conv:"):
        conv = database.conversation_transcript(project_id, item_id[5:])
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        title = context_meta.snippet(conv["first"], 70) or "Conversation"
        return {
            "id": item_id,
            "title": title,
            "type": "note",
            "kind": "conversation",
            "folder": "Conversations",
            "created_at": conv["created_at"],
            "updated_at": conv["last_at"],
            "size": len(conv["text"]),
            "snippet": context_meta.snippet(conv["text"]),
            "source": "chat",
            "edited": False,
            "url": None,
            "content": conv["text"],
            "summary": context_meta.summarize(conv["text"]),
            "related": [],
            "used_in": {"count": 0, "recent": []},
            "versions": [],
        }

    raw = database.get_context_item(project_id, item_id)
    if not raw:
        raise HTTPException(status_code=404, detail="Context item not found")
    row = database._library_row(raw)  # noqa: SLF001 - same package, keeps one definition of an item
    versions = database.list_context_versions(item_id)
    return {
        **row,
        "content": raw["content"],
        "summary": context_meta.summarize(raw["content"]),
        "related": _related(project_id, raw),
        "used_in": database.context_used_in(project_id, item_id),
        "versions": [
            {"id": v["id"], "title": v["title"], "source": v["source"], "created_at": v["created_at"], "chars": len(v["content"])}
            for v in versions
        ],
    }


@router.get("/folders", response_model=list[str])
async def list_folders(project_id: str) -> list[str]:
    _require_project(project_id)
    return database.list_context_folders(project_id)


@router.post("/folders", status_code=201, response_model=list[str])
async def create_folder(project_id: str, req: FolderCreate) -> list[str]:
    _require_project(project_id)
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name can't be empty")
    database.create_context_folder(project_id, name)
    return database.list_context_folders(project_id)


@router.patch("/folders/{name}", response_model=list[str])
async def rename_folder(project_id: str, name: str, req: FolderRename) -> list[str]:
    _require_project(project_id)
    new_name = req.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Folder name can't be empty")
    database.rename_context_folder(project_id, name, new_name)
    return database.list_context_folders(project_id)


@router.delete("/folders/{name}", response_model=list[str])
async def delete_folder(project_id: str, name: str) -> list[str]:
    _require_project(project_id)
    database.delete_context_folder(project_id, name)
    return database.list_context_folders(project_id)


@router.post("/link", response_model=ProjectContextItem, status_code=201)
async def add_link(project_id: str, req: LinkCreate) -> dict:
    _require_project(project_id)
    try:
        title, text = fetch_link(req.url)
    except LinkError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    body = f"{req.url.strip()}\n\n{text}" if text else req.url.strip()
    return database.create_context_item(
        project_id, "url", title, body, {"source": "link", "url": req.url.strip()}, req.folder
    )


@router.post("/upload", response_model=ProjectContextItem, status_code=201)
async def upload_document(
    project_id: str,
    request: Request,
    filename: str = Query(..., min_length=1, max_length=255),
    folder: Optional[str] = Query(None),
) -> dict:
    """Add a PDF, Word, PowerPoint or Excel file. The body is the raw file; its
    text is extracted and stored as context, and the original is kept for download."""
    _require_project(project_id)
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > uploads.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That file is over 25 MB.")
    data = await request.body()
    if len(data) > uploads.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That file is over 25 MB.")
    if not data:
        raise HTTPException(status_code=400, detail="That file is empty.")
    try:
        text, meta = await run_in_threadpool(extract.extract_text, filename, data)
    except extract.ExtractError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    name = uploads.safe_name(filename)
    item = database.create_context_item(
        project_id,
        "file",
        name,
        text,
        {"source": "upload", "original_name": name, "size": len(data), **meta},
        folder,
    )
    stored = uploads.save_original(item["id"], name, data)
    updated = database.set_context_metadata(project_id, item["id"], {**item["metadata"], "stored_file": stored})
    return updated or item


@router.get("/{item_id}/file")
async def download_original(project_id: str, item_id: str) -> FileResponse:
    item = database.get_context_item(project_id, item_id)
    stored = (item or {}).get("metadata", {}).get("stored_file")
    path = uploads.original_path(item_id, stored) if stored else None
    if not item or not path:
        raise HTTPException(status_code=404, detail="No original file is stored for this item")
    media = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media, filename=item["metadata"].get("original_name") or path.name)


@router.get("/{item_id}", response_model=LibraryItemDetail)
async def get_item(project_id: str, item_id: str) -> dict:
    return _detail(project_id, item_id)


@router.patch("/{item_id}", response_model=LibraryItemDetail)
async def update_item(project_id: str, item_id: str, req: LibraryItemUpdate) -> dict:
    if item_id.startswith("conv:"):
        raise HTTPException(status_code=400, detail="Conversations are read-only here")
    updated = database.update_context_item(
        project_id, item_id, title=req.title, content=req.content, folder=req.folder, source="edited"
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Context item not found")
    return _detail(project_id, item_id)


@router.get("/{item_id}/versions/{version_id}")
async def get_version(project_id: str, item_id: str, version_id: str) -> dict:
    version = database.get_context_version(item_id, version_id)
    if not version or not database.get_context_item(project_id, item_id):
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.post("/{item_id}/versions/{version_id}/restore", response_model=LibraryItemDetail)
async def restore_version(project_id: str, item_id: str, version_id: str) -> dict:
    version = database.get_context_version(item_id, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    if not database.update_context_item(
        project_id, item_id, title=version["title"], content=version["content"], source="restored"
    ):
        raise HTTPException(status_code=404, detail="Context item not found")
    return _detail(project_id, item_id)
