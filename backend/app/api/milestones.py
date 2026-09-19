"""Per-project milestones — replaces the "Next Milestone" placeholder on Overview."""
from fastapi import APIRouter, HTTPException

from app import database
from app.schemas import Milestone, MilestoneCreate, MilestoneUpdate

router = APIRouter(prefix="/v1/projects/{project_id}/milestones", tags=["milestones"])


def _require_project(project_id: str) -> None:
    if not database.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")


@router.get("", response_model=list[Milestone])
async def list_milestones(project_id: str) -> list[dict]:
    _require_project(project_id)
    return database.list_milestones(project_id)


@router.get("/next", response_model=Milestone | None)
async def get_next_milestone(project_id: str) -> dict | None:
    _require_project(project_id)
    return database.next_milestone(project_id)


@router.post("", response_model=Milestone, status_code=201)
async def create_milestone(project_id: str, req: MilestoneCreate) -> dict:
    _require_project(project_id)
    target = req.target_date.isoformat() if req.target_date else None
    return database.create_milestone(project_id, req.title.strip(), target)


@router.patch("/{milestone_id}", response_model=Milestone)
async def update_milestone(project_id: str, milestone_id: str, req: MilestoneUpdate) -> dict:
    _require_project(project_id)
    target = req.target_date.isoformat() if "target_date" in req.model_fields_set and req.target_date else (
        None if "target_date" in req.model_fields_set else database.UNSET
    )
    updated = database.update_milestone(milestone_id, title=req.title, target_date=target, is_done=req.is_done)
    if not updated:
        raise HTTPException(status_code=404, detail="Milestone not found")
    return updated


@router.delete("/{milestone_id}", status_code=204)
async def delete_milestone(project_id: str, milestone_id: str) -> None:
    database.delete_milestone(milestone_id)
