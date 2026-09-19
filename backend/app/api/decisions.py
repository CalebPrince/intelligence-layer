"""Workspace-wide decisions: the list, one decision in full, and status edits."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from app import database
from app.config import MODEL_REGISTRY
from app.schemas import DecisionDetail, DecisionList, DecisionStats, DecisionUpdate

router = APIRouter(prefix="/v1/decisions", tags=["decisions"])


def _month_start() -> str:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _stats(items: list[dict]) -> DecisionStats:
    month = _month_start()
    by = lambda status: [d for d in items if d["status"] == status]  # noqa: E731
    this_month = lambda rows, key="decided_at": sum(1 for d in rows if (d.get(key) or "") >= month)  # noqa: E731
    implemented = by("implemented")
    return DecisionStats(
        total=len(items),
        implemented=len(implemented),
        in_progress=len(by("in_progress")),
        under_review=len(by("under_review")),
        archived=len(by("archived")),
        total_this_month=this_month(items),
        implemented_this_month=this_month(implemented, "implemented_at"),
        in_progress_this_month=this_month(by("in_progress")),
        under_review_this_month=this_month(by("under_review")),
    )


@router.get("", response_model=DecisionList)
async def list_decisions(owner_id: str = Query(...)) -> dict:
    items = database.list_workspace_decisions(owner_id)
    return {"items": items, "stats": _stats(items)}


def _detail(decision_id: str) -> dict:
    d = database.get_decision_detail(decision_id)
    if not d:
        raise HTTPException(status_code=404, detail="Decision not found")
    names = {m.id: m.display_name for m in MODEL_REGISTRY}
    for p in d["perspectives"]:
        p["display_name"] = names.get(p["model_id"], p["model_id"].split("/")[-1])
    return d


@router.get("/{decision_id}", response_model=DecisionDetail)
async def get_decision(decision_id: str) -> dict:
    return _detail(decision_id)


@router.patch("/{decision_id}", response_model=DecisionDetail)
async def update_decision(decision_id: str, req: DecisionUpdate) -> dict:
    if not database.get_decision_detail(decision_id):
        raise HTTPException(status_code=404, detail="Decision not found")
    # implemented_at is settable by hand; omitting it keeps the automatic
    # "set on -> implemented, clear otherwise" behavior in database.py
    implemented_at = req.implemented_at if "implemented_at" in req.model_fields_set else database.UNSET
    database.update_decision(
        decision_id,
        status=req.status,
        title=req.title,
        tags=req.tags,
        outcome_note=req.outcome_note,
        implemented_at=implemented_at,
        context_item_ids=req.context_item_ids,
    )
    return _detail(decision_id)
