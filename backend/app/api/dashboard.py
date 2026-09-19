"""Workspace-wide numbers for the Main Dashboard (across every project)."""
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Query

from app import database
from app.schemas import DashboardSummary

router = APIRouter(prefix="/v1/dashboard", tags=["dashboard"])

_OWN = "project_id IN (SELECT id FROM projects WHERE owner_id = ?)"


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def build_summary(owner_id: str, days: int) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    month_start = _iso(now.replace(day=1, hour=0, minute=0, second=0, microsecond=0))
    week_ago = _iso(now - timedelta(days=7))
    since_day = (now - timedelta(days=days - 1)).date()
    since = _iso(datetime.combine(since_day, datetime.min.time(), tzinfo=timezone.utc))

    with database.get_connection() as conn:
        q = conn.execute

        totals = {
            "projects": q("SELECT COUNT(*) FROM projects WHERE owner_id = ?", (owner_id,)).fetchone()[0],
            "projects_this_month": q(
                "SELECT COUNT(*) FROM projects WHERE owner_id = ? AND created_at >= ?", (owner_id, month_start)
            ).fetchone()[0],
            "files": q(f"SELECT COUNT(*) FROM project_context WHERE {_OWN}", (owner_id,)).fetchone()[0],
            "files_this_week": q(
                f"SELECT COUNT(*) FROM project_context WHERE {_OWN} AND created_at >= ?", (owner_id, week_ago)
            ).fetchone()[0],
            "decisions": q(f"SELECT COUNT(*) FROM decisions WHERE {_OWN}", (owner_id,)).fetchone()[0],
            "decisions_this_month": q(
                f"SELECT COUNT(*) FROM decisions WHERE {_OWN} AND decided_at >= ?", (owner_id, month_start)
            ).fetchone()[0],
        }

        # per-day counts (UTC dates), zero-filled below
        def per_day(sql: str, *params: Any) -> dict[str, int]:
            return {r[0]: r[1] for r in q(sql, params).fetchall()}

        chats = per_day(
            "SELECT substr(m.created_at, 1, 10) AS d, COUNT(*) FROM messages m "
            "JOIN conversations c ON c.id = m.conversation_id "
            "WHERE m.role = 'user' AND c.project_id IN (SELECT id FROM projects WHERE owner_id = ?) "
            "AND m.created_at >= ? GROUP BY d",
            owner_id,
            since,
        )
        files = per_day(
            f"SELECT substr(created_at, 1, 10) AS d, COUNT(*) FROM project_context WHERE {_OWN} "
            "AND created_at >= ? GROUP BY d",
            owner_id,
            since,
        )
        decisions = per_day(
            f"SELECT substr(decided_at, 1, 10) AS d, COUNT(*) FROM decisions WHERE {_OWN} "
            "AND decided_at >= ? GROUP BY d",
            owner_id,
            since,
        )
        activity = []
        for i in range(days):
            day = (since_day + timedelta(days=i)).isoformat()
            activity.append(
                {"date": day, "chats": chats.get(day, 0), "files": files.get(day, 0), "decisions": decisions.get(day, 0)}
            )

        usage_rows = q(
            "SELECT mr.model_id AS model_id, COUNT(*) AS n FROM usage_logs ul "
            "LEFT JOIN model_responses mr ON mr.id = ul.model_response_id "
            f"WHERE ul.{_OWN} AND ul.created_at >= ? GROUP BY mr.model_id",
            (owner_id, since),
        ).fetchall()
        by_provider: dict[str, int] = {}
        for r in usage_rows:
            provider = (r["model_id"] or "other").split("/")[0]
            if provider not in ("openai", "anthropic", "gemini"):
                provider = "other"
            by_provider[provider] = by_provider.get(provider, 0) + r["n"]

        recent = [
            dict(r)
            for r in q(
                "SELECT * FROM ("
                "  SELECT CASE WHEN json_extract(pc.metadata, '$.source') = 'import' THEN 'context_synced' ELSE 'file' END AS kind,"
                "         pc.id AS id, pc.title AS label, p.name AS project_name, p.id AS project_id, pc.created_at AS ts"
                "  FROM project_context pc JOIN projects p ON p.id = pc.project_id WHERE p.owner_id = ?"
                "  UNION ALL"
                "  SELECT 'decision', d.id, d.task_type, p.name, p.id, d.decided_at"
                "  FROM decisions d JOIN projects p ON p.id = d.project_id WHERE p.owner_id = ?"
                "  UNION ALL"
                "  SELECT 'project', p.id, p.name, p.name, p.id, p.created_at FROM projects p WHERE p.owner_id = ?"
                ") ORDER BY ts DESC LIMIT 40",
                (owner_id, owner_id, owner_id),
            ).fetchall()
        ]

    # Collapse bursts (e.g. 50 projects imported in one minute) so the feed
    # stays readable: keep the first item of each (kind, minute) group and say
    # how many others were folded into it.
    feed: list[dict[str, Any]] = []
    seen: dict[tuple[str, str], dict[str, Any]] = {}
    for item in recent:
        key = (item["kind"], item["ts"][:16])
        if key in seen:
            seen[key]["count"] += 1
            continue
        item["count"] = 1
        seen[key] = item
        feed.append(item)
    return {
        "totals": totals,
        "activity": activity,
        "usage": {"total_requests": sum(by_provider.values()), "by_provider": by_provider},
        "recent": feed[:6],
        "days": days,
    }


@router.get("", response_model=DashboardSummary)
async def summary(owner_id: str = Query(...), days: int = Query(7, ge=1, le=30)) -> dict[str, Any]:
    return build_summary(owner_id, days)
