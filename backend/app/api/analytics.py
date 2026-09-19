"""Real numbers for the Analytics page beyond what /v1/dashboard already
covers: usage broken down by day and provider, a request-activity heatmap,
top projects by request volume, daily cost, and workspace storage — all
derived from usage_logs and project_context. Fields with no backend concept
yet (agent tasks, "time saved") aren't here; the frontend keeps those
illustrative until that tracking exists."""
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Query

from app import database
from app.schemas import AnalyticsSummary

router = APIRouter(prefix="/v1/analytics", tags=["analytics"])

_OWN = "project_id IN (SELECT id FROM projects WHERE owner_id = ?)"


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _provider_of(model_id: str | None) -> str:
    provider = (model_id or "other").split("/")[0]
    return provider if provider in ("openai", "anthropic", "gemini") else "other"


def build_summary(owner_id: str, days: int) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    since_day = (now - timedelta(days=days - 1)).date()
    since = _iso(datetime.combine(since_day, datetime.min.time(), tzinfo=timezone.utc))
    prev_since_day = since_day - timedelta(days=days)
    prev_since = _iso(datetime.combine(prev_since_day, datetime.min.time(), tzinfo=timezone.utc))

    with database.get_connection() as conn:
        q = conn.execute

        rows = q(
            "SELECT ul.created_at AS ts, ul.cost_usd AS cost, ul.project_id AS project_id, mr.model_id AS model_id "
            "FROM usage_logs ul LEFT JOIN model_responses mr ON mr.id = ul.model_response_id "
            f"WHERE ul.{_OWN} AND ul.created_at >= ?",
            (owner_id, since),
        ).fetchall()

        prev_count = q(
            f"SELECT COUNT(*) FROM usage_logs ul WHERE ul.{_OWN} AND ul.created_at >= ? AND ul.created_at < ?",
            (owner_id, prev_since, since),
        ).fetchone()[0]

        active_projects = q(
            "SELECT COUNT(*) FROM projects WHERE owner_id = ? AND archived = 0", (owner_id,)
        ).fetchone()[0]

        decisions_period = q(
            f"SELECT COUNT(*) FROM decisions WHERE {_OWN} AND decided_at >= ?", (owner_id, since)
        ).fetchone()[0]
        decisions_prev = q(
            f"SELECT COUNT(*) FROM decisions WHERE {_OWN} AND decided_at >= ? AND decided_at < ?",
            (owner_id, prev_since, since),
        ).fetchone()[0]

        storage_bytes = q(
            f"SELECT COALESCE(SUM(LENGTH(content)), 0) FROM project_context WHERE {_OWN}", (owner_id,)
        ).fetchone()[0]

        names = {r["id"]: r["name"] for r in q("SELECT id, name FROM projects WHERE owner_id = ?", (owner_id,)).fetchall()}

    by_day_provider: dict[str, dict[str, int]] = {}
    cost_by_day: dict[str, float] = {}
    heat = [[0] * 24 for _ in range(7)]  # Mon..Sun x 24h, local-to-server time
    project_counts: dict[str, int] = {}
    for r in rows:
        day = r["ts"][:10]
        provider = _provider_of(r["model_id"])
        by_day_provider.setdefault(day, {}).setdefault(provider, 0)
        by_day_provider[day][provider] += 1
        cost_by_day[day] = cost_by_day.get(day, 0.0) + (r["cost"] or 0.0)
        dt = datetime.strptime(r["ts"][:19], "%Y-%m-%dT%H:%M:%S")
        heat[dt.weekday()][dt.hour] += 1
        project_counts[r["project_id"]] = project_counts.get(r["project_id"], 0) + 1

    usage_by_day = []
    cost_series = []
    for i in range(days):
        day = (since_day + timedelta(days=i)).isoformat()
        entry = {"date": day, **{p: by_day_provider.get(day, {}).get(p, 0) for p in ("openai", "anthropic", "gemini", "other")}}
        usage_by_day.append(entry)
        cost_series.append({"date": day, "cost_usd": round(cost_by_day.get(day, 0.0), 4)})

    top_projects = sorted(
        ({"project_id": pid, "name": names.get(pid, "Untitled"), "requests": n} for pid, n in project_counts.items()),
        key=lambda x: -x["requests"],
    )[:5]

    return {
        "total_requests": len(rows),
        "requests_prev_period": prev_count,
        "active_projects": active_projects,
        "decisions_period": decisions_period,
        "decisions_prev_period": decisions_prev,
        "usage_by_day": usage_by_day,
        "cost_by_day": cost_series,
        "total_cost_usd": round(sum(cost_by_day.values()), 4),
        "top_projects": top_projects,
        "heatmap": heat,
        "storage_bytes": storage_bytes,
        "days": days,
    }


@router.get("", response_model=AnalyticsSummary)
async def analytics(owner_id: str = Query(...), days: int = Query(30, ge=1, le=90)) -> dict[str, Any]:
    return build_summary(owner_id, days)
