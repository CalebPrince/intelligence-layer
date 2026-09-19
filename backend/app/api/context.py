"""Project context CRUD — the shared knowledge base every model draws from in
chat.py. Which parts of it go with a given question is decided by
app/retrieval.py (BM25 section selection, no embeddings), not dumped whole."""
from fastapi import APIRouter

from app import database, uploads
from app.schemas import ProjectContextCreate, ProjectContextItem

router = APIRouter(prefix="/v1/projects/{project_id}/context", tags=["context"])


@router.get("", response_model=list[ProjectContextItem])
async def list_context(project_id: str) -> list[dict]:
    return database.get_project_context(project_id)


@router.post("", response_model=ProjectContextItem, status_code=201)
async def add_context(project_id: str, req: ProjectContextCreate) -> dict:
    return database.create_context_item(project_id, req.type, req.title, req.content, req.metadata, req.folder)


@router.delete("/{context_id}", status_code=204)
async def remove_context(project_id: str, context_id: str) -> None:
    database.delete_context_item(project_id, context_id)
    uploads.delete_original(context_id)
