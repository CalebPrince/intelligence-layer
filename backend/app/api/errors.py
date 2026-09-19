"""Admin error feed combining server exceptions and model failures."""
from fastapi import APIRouter, Query

from app import database

router = APIRouter(prefix="/v1/errors", tags=["errors"])


@router.get("")
async def list_errors(
    owner_id: str = Query(...),
    limit: int = Query(100, ge=1, le=500),
    source: str | None = Query(None),
) -> list[dict]:
    return database.list_error_logs(owner_id, limit=limit, source=source)
