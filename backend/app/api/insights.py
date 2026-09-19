"""Read-only backend visibility: what got spent, what got chosen and why, and
project-level counts for Overview/Activity/the sidebar switcher. Nothing here
is written to by the chat flow itself (that's chat.py) — purely reporting."""
from fastapi import APIRouter

from app import database
from app.schemas import ActivityItem, DecisionItem, ProjectStats, UsageSummary

router = APIRouter(prefix="/v1/projects/{project_id}", tags=["insights"])


@router.get("/stats", response_model=ProjectStats)
async def get_stats(project_id: str) -> dict:
    return database.get_project_stats(project_id)


@router.get("/activity", response_model=list[ActivityItem])
async def get_activity(project_id: str) -> list[dict]:
    return database.list_recent_activity(project_id)


@router.get("/usage", response_model=UsageSummary)
async def get_usage(project_id: str) -> dict:
    return database.get_usage_summary(project_id)


@router.get("/decisions", response_model=list[DecisionItem])
async def get_decisions(project_id: str) -> list[dict]:
    return database.list_decisions(project_id)
