"""Project CRUD. Context items live under their own router (app/api/context.py)."""
from fastapi import APIRouter, HTTPException, Query

from app import database
from app import import_service
from app.schemas import Project, ProjectCreate, ProjectStats, ProjectSyncResult, ProjectUpdate

router = APIRouter(prefix="/v1/projects", tags=["projects"])


@router.get("", response_model=list[Project])
async def list_projects(owner_id: str = Query(..., description="Signed-in user's id, once auth exists")) -> list[dict]:
    return database.list_projects(owner_id)


@router.post("", response_model=Project, status_code=201)
async def create_project(req: ProjectCreate) -> dict:
    return database.create_project(
        req.owner_id, req.name, req.description, req.status, req.category, req.tags
    )


# Declared before "/{project_id}" so "stats" is not read as a project id.
@router.get("/stats", response_model=dict[str, ProjectStats])
async def all_project_stats(owner_id: str = Query(...)) -> dict[str, dict]:
    """Stats for every project in one call (the All Projects page refreshes often)."""
    return {p["id"]: database.get_project_stats(p["id"]) for p in database.list_projects(owner_id)}


@router.post("/{project_id}/sync", response_model=ProjectSyncResult)
async def sync_project(project_id: str) -> dict:
    """Re-read this project's folder now, ignoring the change check."""
    project = database.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.get("source_path"):
        raise HTTPException(status_code=400, detail="This project was not imported from a folder")
    changes = import_service.sync_project(project, force=True)
    if changes is None:
        raise HTTPException(status_code=404, detail="The project folder is not reachable")
    return {"project": database.get_project(project_id), "changes": changes}


@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: str) -> dict:
    project = database.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=Project)
async def update_project(project_id: str, req: ProjectUpdate) -> dict:
    project = database.update_project(
        project_id,
        archived=req.archived,
        status=req.status,
        category=req.category,
        tags=req.tags,
        image_url=req.image_url,
        auto_sync=req.auto_sync,
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project
