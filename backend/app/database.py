"""SQLite persistence layer.

Swapped in for Supabase to avoid paying for another cloud project during
local development. Every function here keeps the exact signature it had as
a Supabase wrapper, so router.py and app/api/*.py needed zero changes —
only this module's internals moved. Swapping to Postgres later (Supabase or
otherwise) means reimplementing this file, not anything upstream of it.
"""
import json
import secrets
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

from app import context_meta
from app.config import get_settings
from app.schemas import ChatMessage, ModelResponse

SCHEMA_PATH = Path(__file__).parent / "schema.sql"

UNSET = object()  # distinguishes "field omitted" from "field explicitly set to None"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _new_id() -> str:
    return str(uuid.uuid4())


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    settings = get_settings()
    db_path = Path(settings.sqlite_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """Creates every table if missing. Called once at app startup — SQLite
    needs no separate migration step the way the Supabase project did."""
    with get_connection() as conn:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        # Additive migration for databases created before these columns existed.
        existing = {r["name"] for r in conn.execute("PRAGMA table_info(projects)")}
        for column, ddl in (
            ("status", "TEXT NOT NULL DEFAULT 'active'"),
            ("category", "TEXT"),
            ("tags", "TEXT NOT NULL DEFAULT '[]'"),
            ("source_path", "TEXT"),
            ("fingerprint", "TEXT"),
            ("detected", "TEXT"),
            ("synced_at", "TEXT"),
            ("image_url", "TEXT"),
            ("auto_sync", "INTEGER NOT NULL DEFAULT 1"),
        ):
            if column not in existing:
                conn.execute(f"ALTER TABLE projects ADD COLUMN {column} {ddl}")
        for table, columns in (
            ("projects", (("github_action_mode", "TEXT NOT NULL DEFAULT 'manual'"),)),
            ("project_context", (("folder", "TEXT"), ("updated_at", "TEXT"))),
            ("messages", (("context_used", "TEXT"),)),
            ("watched_folders", (("excluded", "TEXT NOT NULL DEFAULT '[]'"),)),
            ("conversations", (("agent_key", "TEXT"), ("external_token", "TEXT"))),
        ):
            have = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
            for column, ddl in columns:
                if column not in have:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
        existing = {r["name"] for r in conn.execute("PRAGMA table_info(decisions)")}
        for column, ddl in (
            ("title", "TEXT"),
            ("status", "TEXT NOT NULL DEFAULT 'in_progress'"),
            ("tags", "TEXT NOT NULL DEFAULT '[]'"),
            ("implemented_at", "TEXT"),
            ("outcome_note", "TEXT"),
            ("context_item_ids", "TEXT NOT NULL DEFAULT '[]'"),
        ):
            if column not in existing:
                conn.execute(f"ALTER TABLE decisions ADD COLUMN {column} {ddl}")


def _context_row(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    d["metadata"] = json.loads(d["metadata"] or "{}")
    return d


# --- projects & context -----------------------------------------------------

def _project_row(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    d["archived"] = bool(d["archived"])
    d["auto_sync"] = bool(d.get("auto_sync", 1))
    d["tags"] = json.loads(d.get("tags") or "[]")
    d["detected"] = json.loads(d["detected"]) if d.get("detected") else None
    return d


def list_projects(owner_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC", (owner_id,)
        ).fetchall()
        return [_project_row(r) for r in rows]


def get_project(project_id: str) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        return _project_row(row) if row else None


def get_project_by_source_path(owner_id: str, source_path: str) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM projects WHERE owner_id = ? AND source_path = ?",
            (owner_id, source_path),
        ).fetchone()
        return _project_row(row) if row else None


def create_github_oauth_state(owner_id: str) -> str:
    state = secrets.token_urlsafe(32)
    with get_connection() as conn:
        conn.execute("INSERT INTO github_oauth_states (state, owner_id, created_at) VALUES (?, ?, ?)", (state, owner_id, _now()))
    return state


def consume_github_oauth_state(state: str) -> Optional[str]:
    with get_connection() as conn:
        row = conn.execute("SELECT owner_id FROM github_oauth_states WHERE state = ?", (state,)).fetchone()
        if not row:
            return None
        conn.execute("DELETE FROM github_oauth_states WHERE state = ?", (state,))
        return str(row["owner_id"])


def project_by_source_path(source_path: str) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM projects WHERE source_path = ? LIMIT 1", (source_path,)).fetchone()
        return _project_row(row) if row else None


def record_github_delivery(delivery_id: str) -> bool:
    with get_connection() as conn:
        try:
            conn.execute("INSERT INTO github_webhook_events (delivery_id, received_at) VALUES (?, ?)", (delivery_id, _now()))
            return True
        except sqlite3.IntegrityError:
            return False


def create_github_proposal(project_id: str, mode: str, message: str, files: list[dict[str, str]]) -> dict[str, Any]:
    proposal_id, now = _new_id(), _now()
    status = "rejected" if mode == "reject" else "pending"
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO github_action_proposals (id, project_id, mode, status, message, files, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (proposal_id, project_id, mode, status, message, json.dumps(files), now, now),
        )
    return {"id": proposal_id, "project_id": project_id, "mode": mode, "status": status, "message": message, "files": files, "branch": None, "commit_sha": None, "created_at": now, "updated_at": now}


def get_github_proposal(proposal_id: str) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM github_action_proposals WHERE id = ?", (proposal_id,)).fetchone()
    if not row:
        return None
    result = dict(row)
    result["files"] = json.loads(result["files"] or "[]")
    return result


def update_github_proposal(proposal_id: str, status: str, branch: Optional[str] = None, commit_sha: Optional[str] = None) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        conn.execute("UPDATE github_action_proposals SET status = ?, branch = COALESCE(?, branch), commit_sha = COALESCE(?, commit_sha), updated_at = ? WHERE id = ?", (status, branch, commit_sha, _now(), proposal_id))
    return get_github_proposal(proposal_id)


def create_project(
    owner_id: str,
    name: str,
    description: Optional[str] = None,
    status: str = "active",
    category: Optional[str] = None,
    tags: Optional[list[str]] = None,
    source_path: Optional[str] = None,
    github_action_mode: str = "manual",
) -> dict[str, Any]:
    project_id, now = _new_id(), _now()
    tags = tags or []
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO projects (id, owner_id, name, description, archived, status, category, tags, source_path, created_at, updated_at, github_action_mode) "
            "VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)",
            (project_id, owner_id, name, description, status, category, json.dumps(tags), source_path, now, now, github_action_mode),
        )
    return {
        "id": project_id,
        "owner_id": owner_id,
        "name": name,
        "description": description,
        "archived": False,
        "status": status,
        "category": category,
        "tags": tags,
        "source_path": source_path,
        "github_action_mode": github_action_mode,
        "created_at": now,
        "updated_at": now,
    }


def set_project_detection(
    project_id: str, fingerprint: str, detected: dict[str, Any], updated_at: Optional[str] = None
) -> None:
    """Remember what auto-detection produced, so a later sync can tell which
    fields a person has edited by hand (and leave those alone). `updated_at`
    (the folder's newest file time) makes "recently modified" mean real activity."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE projects SET fingerprint = ?, detected = ?, synced_at = ?, updated_at = COALESCE(?, updated_at) WHERE id = ?",
            (fingerprint, json.dumps(detected), _now(), updated_at, project_id),
        )


def list_syncable_projects() -> list[dict[str, Any]]:
    """Imported (folder-backed), non-archived, auto_sync projects across all
    owners — the background loop's candidates. A project with auto_sync off
    is skipped here but a manual "Sync now" (force=True) still works on it."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM projects WHERE source_path IS NOT NULL AND archived = 0 AND auto_sync = 1"
        ).fetchall()
        return [_project_row(r) for r in rows]


def apply_project_sync(
    project_id: str,
    fields: dict[str, Any],
    fingerprint: str,
    detected: dict[str, Any],
    updated_at: Optional[str],
) -> None:
    sets = ["fingerprint = ?", "detected = ?", "synced_at = ?"]
    values: list[Any] = [fingerprint, json.dumps(detected), _now()]
    if "description" in fields:
        sets.append("description = ?")
        values.append(fields["description"])
    if "category" in fields:
        sets.append("category = ?")
        values.append(fields["category"])
    if "tags" in fields:
        sets.append("tags = ?")
        values.append(json.dumps(fields["tags"]))
    if updated_at:
        sets.append("updated_at = ?")
        values.append(updated_at)
    with get_connection() as conn:
        conn.execute(f"UPDATE projects SET {', '.join(sets)} WHERE id = ?", (*values, project_id))


def list_import_context(project_id: str) -> list[dict[str, Any]]:
    """Context items that were loaded from files on disk (not typed in the app)."""
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM project_context WHERE project_id = ?", (project_id,)).fetchall()
    items = [_context_row(r) for r in rows]
    return [i for i in items if i["metadata"].get("source") == "import"]


def imported_source_paths(owner_id: str) -> set[str]:
    """Raw source_path values of every project this owner imported from disk."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT source_path FROM projects WHERE owner_id = ? AND source_path IS NOT NULL", (owner_id,)
        ).fetchall()
        return {r["source_path"] for r in rows}


def update_project(
    project_id: str,
    archived: Optional[bool] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    tags: Optional[list[str]] = None,
    image_url: Optional[str] = None,
    auto_sync: Optional[bool] = None,
) -> Optional[dict[str, Any]]:
    sets: list[str] = []
    values: list[Any] = []
    if archived is not None:
        sets.append("archived = ?")
        values.append(int(archived))
    if status is not None:
        sets.append("status = ?")
        values.append(status)
    if category is not None:
        sets.append("category = ?")
        values.append(category or None)
    if tags is not None:
        sets.append("tags = ?")
        values.append(json.dumps(tags))
    if image_url is not None:
        sets.append("image_url = ?")
        values.append(image_url or None)
    if auto_sync is not None:
        sets.append("auto_sync = ?")
        values.append(int(auto_sync))
    if not sets:
        return get_project(project_id)
    sets.append("updated_at = ?")
    values.append(_now())
    with get_connection() as conn:
        conn.execute(f"UPDATE projects SET {', '.join(sets)} WHERE id = ?", (*values, project_id))
    return get_project(project_id)


def get_project_context(project_id: str, limit: int = 20) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM project_context WHERE project_id = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?",
            (project_id, limit),
        ).fetchall()
        return [_context_row(r) for r in rows]


def create_context_item(
    project_id: str,
    type_: str,
    title: str,
    content: str,
    metadata: dict[str, Any],
    folder: Optional[str] = None,
) -> dict[str, Any]:
    item_id, now = _new_id(), _now()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO project_context (id, project_id, type, title, content, metadata, created_at, folder, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (item_id, project_id, type_, title, content, json.dumps(metadata or {}), now, folder, now),
        )
    return {
        "id": item_id,
        "project_id": project_id,
        "type": type_,
        "title": title,
        "content": content,
        "metadata": metadata or {},
        "created_at": now,
    }


def context_paths_for_source(project_id: str, source: str) -> set[str]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT json_extract(metadata, '$.path') AS path FROM project_context "
            "WHERE project_id = ? AND json_extract(metadata, '$.source') = ?",
            (project_id, source),
        ).fetchall()
    return {str(row["path"]) for row in rows if row["path"]}


def get_context_item(project_id: str, item_id: str) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM project_context WHERE id = ? AND project_id = ?", (item_id, project_id)
        ).fetchone()
        return _context_row(row) if row else None


def set_context_metadata(project_id: str, item_id: str, metadata: dict[str, Any]) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        conn.execute(
            "UPDATE project_context SET metadata = ? WHERE id = ? AND project_id = ?",
            (json.dumps(metadata), item_id, project_id),
        )
    return get_context_item(project_id, item_id)


def update_context_item(
    project_id: str,
    item_id: str,
    *,
    title: Optional[str] = None,
    content: Optional[str] = None,
    folder: Optional[str] = None,
    source: str = "edited",
) -> Optional[dict[str, Any]]:
    """Change a context item. Replaced text is kept as a version. `source` says
    why it changed: "edited" (in the app), "synced" (folder changed on disk) or
    "restored". In-app edits to an imported file are flagged so a later sync
    does not overwrite them."""
    now = _now()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM project_context WHERE id = ? AND project_id = ?", (item_id, project_id)
        ).fetchone()
        if not row:
            return None
        item = _context_row(row)
        sets: list[str] = []
        values: list[Any] = []
        if content is not None and content != item["content"]:
            conn.execute(
                "INSERT INTO context_versions (id, context_id, title, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (_new_id(), item_id, item["title"], item["content"], source, now),
            )
            sets.append("content = ?")
            values.append(content)
            if source in ("edited", "restored") and item["metadata"].get("source") == "import":
                meta = {**item["metadata"], "edited": True}
                sets.append("metadata = ?")
                values.append(json.dumps(meta))
        if title is not None and title.strip() and title.strip() != item["title"]:
            sets.append("title = ?")
            values.append(title.strip())
        if folder is not None:
            sets.append("folder = ?")
            values.append(folder.strip() or None)
        if sets:
            sets.append("updated_at = ?")
            values.append(now)
            conn.execute(f"UPDATE project_context SET {', '.join(sets)} WHERE id = ?", (*values, item_id))
    return get_context_item(project_id, item_id)


def list_context_versions(item_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, title, content, source, created_at FROM context_versions WHERE context_id = ? "
            "ORDER BY created_at DESC, rowid DESC",
            (item_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_context_version(item_id: str, version_id: str) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, title, content, source, created_at FROM context_versions WHERE id = ? AND context_id = ?",
            (version_id, item_id),
        ).fetchone()
    return dict(row) if row else None


def context_used_in(project_id: str, item_id: str, limit: int = 5) -> dict[str, Any]:
    """Chat messages whose request carried this item (recorded per message)."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT m.content AS prompt, m.created_at AS at FROM messages m "
            "JOIN conversations c ON c.id = m.conversation_id "
            "WHERE c.project_id = ? AND m.role = 'user' AND m.context_used LIKE ? "
            "ORDER BY m.created_at DESC",
            (project_id, f'%"id":"{item_id}"%'),
        ).fetchall()
    return {"count": len(rows), "recent": [dict(r) for r in rows[:limit]]}


def _library_row(d: dict[str, Any]) -> dict[str, Any]:
    kind = context_meta.kind_of(d["type"], d["title"])
    source = d["metadata"].get("source")
    return {
        "id": d["id"],
        "title": d["title"],
        "type": d["type"],
        "kind": kind,
        "folder": d.get("folder") or context_meta.auto_folder(d["title"], d["type"]),
        "created_at": d["created_at"],
        "updated_at": d.get("updated_at") or d["created_at"],
        "size": len(d["content"]),
        "snippet": context_meta.snippet(d["content"]),
        "source": "import" if source == "import" else ("link" if d["type"] == "url" else "app"),
        "edited": bool(d["metadata"].get("edited")),
        "url": d["metadata"].get("url"),
        "original_name": d["metadata"].get("original_name"),
        "has_file": bool(d["metadata"].get("stored_file")),
        "pages": d["metadata"].get("pages"),
    }


def _conversation_items(conn: sqlite3.Connection, project_id: str) -> list[dict[str, Any]]:
    convs = conn.execute(
        "SELECT c.id, c.created_at, "
        "  (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id) AS last_at "
        "FROM conversations c WHERE c.project_id = ? ORDER BY c.created_at DESC",
        (project_id,),
    ).fetchall()
    items = []
    for c in convs:
        msgs = conn.execute(
            "SELECT content FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at", (c["id"],)
        ).fetchall()
        if not msgs:
            continue
        text = "\n".join(m["content"] for m in msgs)
        items.append(
            {
                "id": f"conv:{c['id']}",
                "title": context_meta.snippet(msgs[0]["content"], 70) or "Conversation",
                "type": "note",
                "kind": "conversation",
                "folder": "Conversations",
                "created_at": c["created_at"],
                "updated_at": c["last_at"] or c["created_at"],
                "size": len(text),
                "snippet": context_meta.snippet(text),
                "source": "chat",
                "edited": False,
                "url": None,
            }
        )
    return items


def list_library(project_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM project_context WHERE project_id = ?", (project_id,)).fetchall()
        items = [_library_row(_context_row(r)) for r in rows]
        items.extend(_conversation_items(conn, project_id))
    return sorted(items, key=lambda i: i["updated_at"], reverse=True)


def conversation_transcript(project_id: str, conversation_id: str) -> Optional[dict[str, Any]]:
    """A chat conversation rendered as readable text (for the library viewer)."""
    with get_connection() as conn:
        conv = conn.execute(
            "SELECT id, created_at FROM conversations WHERE id = ? AND project_id = ?", (conversation_id, project_id)
        ).fetchone()
        if not conv:
            return None
        msgs = conn.execute(
            "SELECT id, content, created_at FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at",
            (conversation_id,),
        ).fetchall()
        parts: list[str] = []
        for m in msgs:
            parts.append(f"## You\n{m['content']}")
            answer = conn.execute(
                "SELECT model_id, content FROM model_responses WHERE message_id = ? AND success = 1 AND content IS NOT NULL "
                "ORDER BY CASE phase WHEN 'synthesis' THEN 0 WHEN 'initial' THEN 1 ELSE 2 END, created_at LIMIT 1",
                (m["id"],),
            ).fetchone()
            if answer:
                parts.append(f"## {answer['model_id'].split('/')[-1]}\n{answer['content']}")
    return {"created_at": conv["created_at"], "last_at": msgs[-1]["created_at"] if msgs else conv["created_at"],
            "text": "\n\n".join(parts), "first": msgs[0]["content"] if msgs else ""}


def context_library_stats(project_id: str, days: Optional[int]) -> dict[str, int]:
    from datetime import timedelta

    since = None
    if days:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    with get_connection() as conn:
        rows = conn.execute("SELECT type, title, created_at FROM project_context WHERE project_id = ?", (project_id,)).fetchall()
        msg_sql = (
            "SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.project_id = ?"
        )
        args: list[Any] = [project_id]
        if since:
            msg_sql += " AND m.created_at >= ?"
            args.append(since)
        messages = conn.execute(msg_sql, args).fetchone()[0]
    counts = {"files": 0, "links": 0, "notes": 0}
    for r in rows:
        if since and r["created_at"] < since:
            continue
        kind = context_meta.kind_of(r["type"], r["title"])
        if kind == "link":
            counts["links"] += 1
        elif kind == "note":
            counts["notes"] += 1
        else:
            counts["files"] += 1
    return {**counts, "messages": messages}


def delete_context_item(project_id: str, context_id: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM project_context WHERE id = ? AND project_id = ?", (context_id, project_id)
        )


# --- conversations & messages ------------------------------------------------

def create_conversation(project_id: str, title: str = "New conversation", agent_key: Optional[str] = None) -> dict[str, Any]:
    conversation_id, now = _new_id(), _now()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO conversations (id, project_id, title, created_at, agent_key) VALUES (?, ?, ?, ?, ?)",
            (conversation_id, project_id, title, now, agent_key),
        )
    return {"id": conversation_id, "project_id": project_id, "title": title, "created_at": now, "agent_key": agent_key}


def get_conversation(conversation_id: str) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
        return dict(row) if row else None


def delete_conversation(project_id: str, conversation_id: Optional[str] = None) -> bool:
    """Delete one native chat, or the latest one when no id is supplied."""
    with get_connection() as conn:
        if conversation_id:
            row = conn.execute(
                "SELECT id FROM conversations WHERE id = ? AND project_id = ? AND agent_key IS NULL",
                (conversation_id, project_id),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT id FROM conversations WHERE project_id = ? AND agent_key IS NULL "
                "ORDER BY created_at DESC LIMIT 1",
                (project_id,),
            ).fetchone()
        if not row:
            return False
        conn.execute("DELETE FROM conversations WHERE id = ?", (row["id"],))
    return True


def get_latest_agent_history(project_id: str, agent_key: str) -> dict[str, Any]:
    """Restore the latest persisted conversation for one external agent."""
    with get_connection() as conn:
        conversation = conn.execute(
            "SELECT id FROM conversations WHERE project_id = ? AND agent_key = ? "
            "ORDER BY created_at DESC LIMIT 1",
            (project_id, agent_key),
        ).fetchone()
        if not conversation:
            return {"conversation_id": None, "turns": []}
        rows = conn.execute(
            "SELECT m.id AS message_id, m.content AS prompt, mr.id AS response_id, mr.content AS reply "
            "FROM messages m LEFT JOIN model_responses mr ON mr.message_id = m.id "
            "WHERE m.conversation_id = ? AND m.role = 'user' ORDER BY m.created_at ASC",
            (conversation["id"],),
        ).fetchall()
    return {
        "conversation_id": conversation["id"],
        "turns": [
            {
                "message_id": row["message_id"],
                "prompt": row["prompt"],
                "response_id": row["response_id"],
                "reply": row["reply"] or "",
            }
            for row in rows
        ],
    }


def get_shared_agent_memory(memory_key: str, agent_key: str, limit: int = 30) -> list[dict[str, str]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT role, content FROM shared_agent_memory "
            "WHERE memory_key = ? AND agent_key = ? ORDER BY created_at DESC LIMIT ?",
            (memory_key, agent_key, limit),
        ).fetchall()
    return [{"role": row["role"], "text": row["content"]} for row in reversed(rows)]


def append_shared_agent_memory(memory_key: str, agent_key: str, turns: list[dict[str, str]]) -> None:
    with get_connection() as conn:
        for turn in turns:
            if turn.get("role") not in {"user", "agent"} or not turn.get("text", "").strip():
                continue
            conn.execute(
                "INSERT INTO shared_agent_memory (id, memory_key, agent_key, role, content, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (_new_id(), memory_key, agent_key, turn["role"], turn["text"].strip(), _now()),
            )


def set_conversation_external_token(conversation_id: str, token: str) -> None:
    with get_connection() as conn:
        conn.execute("UPDATE conversations SET external_token = ? WHERE id = ?", (token, conversation_id))


def build_agent_transcript(conversation_id: str, reply_role: str) -> list[dict[str, str]]:
    """Every prior turn of a conversation as `{"role": "user"|reply_role, "text": ...}`,
    for replaying to an external agent API (see app/sage_client.py). Reads the same
    messages/model_responses rows the internal chat history uses — an
    agent-routed conversation's "model response" is just that agent's reply."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT m.role AS m_role, m.content AS m_content, m.created_at AS m_created_at, "
            "       mr.content AS r_content, mr.created_at AS r_created_at "
            "FROM messages m LEFT JOIN model_responses mr ON mr.message_id = m.id "
            "WHERE m.conversation_id = ? AND m.role = 'user' ORDER BY m.created_at ASC",
            (conversation_id,),
        ).fetchall()
    transcript: list[dict[str, str]] = []
    for r in rows:
        transcript.append({"role": "user", "text": r["m_content"]})
        if r["r_content"]:
            transcript.append({"role": reply_role, "text": r["r_content"]})
    return transcript


def save_message(
    conversation_id: str, message: ChatMessage, context_used: Optional[list[dict[str, Any]]] = None
) -> dict[str, Any]:
    message_id, now = _new_id(), _now()
    used = json.dumps(context_used, separators=(",", ":")) if context_used else None
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, created_at, context_used) VALUES (?, ?, ?, ?, ?, ?)",
            (message_id, conversation_id, message.role, message.content, now, used),
        )
    return {
        "id": message_id,
        "conversation_id": conversation_id,
        "role": message.role,
        "content": message.content,
        "created_at": now,
    }


def record_error_log(
    message: str,
    source: str = "server",
    owner_id: str | None = None,
    detail: str | None = None,
    path: str | None = None,
    severity: str = "error",
) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO error_logs (id, owner_id, source, severity, message, detail, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (_new_id(), owner_id, source, severity, message[:2000], detail, path, _now()),
        )


def list_error_logs(owner_id: str, limit: int = 100, source: str | None = None) -> list[dict[str, Any]]:
    with get_connection() as conn:
        params: list[Any] = [owner_id, limit]
        source_sql = ""
        if source in {"server", "model"}:
            source_sql = " AND source = ?"
            params.insert(-1, source)
        rows = conn.execute(
            f"SELECT id, owner_id, source, severity, message, detail, path, created_at FROM error_logs WHERE (owner_id = ? OR owner_id IS NULL){source_sql} ORDER BY created_at DESC LIMIT ?",
            params,
        ).fetchall()
        return [dict(row) for row in rows]


def save_model_responses(message_id: str, responses: list[ModelResponse]) -> list[dict[str, Any]]:
    now = _now()
    rows: list[dict[str, Any]] = []
    with get_connection() as conn:
        owner_row = conn.execute(
            "SELECT p.owner_id FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN projects p ON p.id = c.project_id WHERE m.id = ?",
            (message_id,),
        ).fetchone()
        owner_id = owner_row["owner_id"] if owner_row else None
        for r in responses:
            row_id = _new_id()
            conn.execute(
                "INSERT INTO model_responses "
                "(id, message_id, model_id, provider, phase, content, tokens_in, tokens_out, cost_usd, "
                " latency_ms, success, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    row_id, message_id, r.model_id, r.provider, r.phase, r.content, r.tokens_in,
                    r.tokens_out, r.cost_usd, r.latency_ms, int(r.success), r.error, now,
                ),
            )
            if not r.success and r.error:
                conn.execute(
                    "INSERT INTO error_logs (id, owner_id, source, severity, message, detail, path, created_at) VALUES (?, ?, 'model', 'error', ?, ?, ?, ?)",
                    (_new_id(), owner_id, f"{r.display_name} request failed", r.error[:4000], r.model_id, now),
                )
            rows.append(
                {
                    "id": row_id,
                    "message_id": message_id,
                    "model_id": r.model_id,
                    "provider": r.provider,
                    "phase": r.phase,
                    "content": r.content,
                    "tokens_in": r.tokens_in,
                    "tokens_out": r.tokens_out,
                    "cost_usd": r.cost_usd,
                    "latency_ms": r.latency_ms,
                    "success": r.success,
                    "error": r.error,
                }
            )
    return rows


def log_usage(rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    now = _now()
    with get_connection() as conn:
        for row in rows:
            conn.execute(
                "INSERT INTO usage_logs "
                "(id, project_id, model_response_id, tokens_in, tokens_out, cost_usd, latency_ms, success, "
                " error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    _new_id(), row["project_id"], row["model_response_id"], row["tokens_in"],
                    row["tokens_out"], row["cost_usd"], row["latency_ms"], int(row["success"]),
                    row["error_message"], now,
                ),
            )


# --- decisions ----------------------------------------------------------------

def _short_title(text: str, limit: int = 90) -> str:
    line = next((l.strip() for l in (text or "").splitlines() if l.strip()), "")
    line = line.lstrip("#>*- ").strip()
    if len(line) <= limit:
        return line or "Untitled decision"
    return line[:limit].rsplit(" ", 1)[0] + "..."


def record_decision(
    project_id: str,
    message_id: str,
    chosen_response_id: str,
    task_type: str,
    mode: str,
    rationale: Optional[str],
) -> dict[str, Any]:
    """One decision per chat turn: choosing a different answer for the same
    question updates the existing decision instead of piling up duplicates
    (which would also double-count it in the per-project model affinity)."""
    now = _now()
    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM decisions WHERE message_id = ?", (message_id,)).fetchone()
        if existing:
            decision_id = existing["id"]
            conn.execute(
                "UPDATE decisions SET chosen_response_id = ?, task_type = ?, mode = ?, "
                "rationale = COALESCE(?, rationale), decided_at = ? WHERE id = ?",
                (chosen_response_id, task_type, mode, rationale, now, decision_id),
            )
        else:
            decision_id = _new_id()
            msg = conn.execute("SELECT content FROM messages WHERE id = ?", (message_id,)).fetchone()
            title = _short_title(rationale or (msg["content"] if msg else ""))
            tags = [task_type.replace("_", " ").title()] if task_type and task_type != "general" else []
            conn.execute(
                "INSERT INTO decisions "
                "(id, project_id, message_id, chosen_response_id, task_type, mode, rationale, decided_at, "
                " title, status, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?)",
                (decision_id, project_id, message_id, chosen_response_id, task_type, mode, rationale, now,
                 title, json.dumps(tags)),
            )
    return {
        "id": decision_id,
        "project_id": project_id,
        "message_id": message_id,
        "chosen_response_id": chosen_response_id,
        "task_type": task_type,
        "mode": mode,
        "rationale": rationale,
        "decided_at": now,
    }


_DECISION_SELECT = (
    "SELECT d.*, mr.model_id AS model_id, mr.provider AS provider, mr.content AS chosen_content, "
    "       p.name AS project_name, m.content AS prompt "
    "FROM decisions d "
    "JOIN model_responses mr ON mr.id = d.chosen_response_id "
    "JOIN projects p ON p.id = d.project_id "
    "LEFT JOIN messages m ON m.id = d.message_id "
)


def _snippet(text: Optional[str], limit: int = 170) -> str:
    flat = " ".join((text or "").replace("#", " ").replace("*", " ").split())
    return flat if len(flat) <= limit else flat[:limit].rsplit(" ", 1)[0] + "..."


def _decision_card(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    d["tags"] = json.loads(d.get("tags") or "[]")
    d["title"] = d.get("title") or _short_title(d.get("rationale") or d.get("prompt") or "")
    d["snippet"] = _snippet(d.get("chosen_content"))
    return d


def list_workspace_decisions(owner_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(_DECISION_SELECT + "WHERE p.owner_id = ? ORDER BY d.decided_at DESC", (owner_id,)).fetchall()
    return [_decision_card(r) for r in rows]


def get_decision_detail(decision_id: str) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(_DECISION_SELECT + "WHERE d.id = ?", (decision_id,)).fetchone()
        if not row:
            return None
        card = _decision_card(row)
        perspectives = conn.execute(
            "SELECT id, model_id, provider, content, success FROM model_responses "
            "WHERE message_id = ? AND phase = 'initial' ORDER BY created_at ASC, rowid ASC",
            (card["message_id"],),
        ).fetchall()
        related_files = conn.execute(
            "SELECT COUNT(*) FROM project_context WHERE project_id = ?", (card["project_id"],)
        ).fetchone()[0]
        related_decisions = conn.execute(
            "SELECT COUNT(*) FROM decisions WHERE project_id = ? AND id <> ?", (card["project_id"], decision_id)
        ).fetchone()[0]
        linked_ids = json.loads(card.get("context_item_ids") or "[]")
        linked_context = []
        if linked_ids:
            placeholders = ",".join("?" for _ in linked_ids)
            linked_rows = conn.execute(
                f"SELECT id, title, type FROM project_context WHERE id IN ({placeholders})", linked_ids
            ).fetchall()
            by_id = {r["id"]: dict(r) for r in linked_rows}
            linked_context = [by_id[i] for i in linked_ids if i in by_id]  # keep chosen order; drop deleted items
    card["decision_text"] = (card.get("chosen_content") or "").strip()
    card["context"] = (card.get("prompt") or "").strip()
    card["perspectives"] = [{**dict(r), "success": bool(r["success"])} for r in perspectives]
    card["related_files"] = related_files
    card["related_decisions"] = related_decisions
    card["linked_context"] = linked_context
    return card


def update_decision(
    decision_id: str,
    status: Optional[str] = None,
    title: Optional[str] = None,
    tags: Optional[list[str]] = None,
    outcome_note: Optional[str] = None,
    implemented_at: Any = UNSET,
    context_item_ids: Optional[list[str]] = None,
) -> Optional[dict[str, Any]]:
    sets: list[str] = []
    values: list[Any] = []
    if status is not None:
        sets.append("status = ?")
        values.append(status)
        # implemented_at records when it became implemented; cleared if it moves back,
        # unless the caller is setting implemented_at by hand in this same call
        if implemented_at is UNSET:
            sets.append("implemented_at = ?")
            values.append(_now() if status == "implemented" else None)
    if implemented_at is not UNSET:
        sets.append("implemented_at = ?")
        values.append(implemented_at)
    if title is not None and title.strip():
        sets.append("title = ?")
        values.append(title.strip())
    if tags is not None:
        sets.append("tags = ?")
        values.append(json.dumps([t.strip() for t in tags if t.strip()][:8]))
    if outcome_note is not None:
        sets.append("outcome_note = ?")
        values.append(outcome_note.strip() or None)
    if context_item_ids is not None:
        sets.append("context_item_ids = ?")
        values.append(json.dumps(context_item_ids))
    if sets:
        with get_connection() as conn:
            conn.execute(f"UPDATE decisions SET {', '.join(sets)} WHERE id = ?", (*values, decision_id))
    return get_decision_detail(decision_id)


def get_model_affinity(project_id: str, task_type: Optional[str] = None) -> dict[str, int]:
    """How many times each model's response was the one this project's user
    actually accepted — the router's per-project "historical usefulness" signal."""
    query = (
        "SELECT mr.model_id AS model_id, COUNT(*) AS accepted_count "
        "FROM decisions d JOIN model_responses mr ON mr.id = d.chosen_response_id "
        "WHERE d.project_id = ?"
    )
    params: list[Any] = [project_id]
    if task_type:
        query += " AND d.task_type = ?"
        params.append(task_type)
    query += " GROUP BY mr.model_id ORDER BY accepted_count DESC"

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return {row["model_id"]: row["accepted_count"] for row in rows}


# --- insights: project stats, usage & decisions ---------------------------------

def list_conversations(project_id: str) -> list[dict[str, Any]]:
    """Every conversation for a project, newest first, with a preview of its
    last message — the picker Chat uses instead of only ever showing the
    latest one."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT c.id, c.title, c.created_at, c.agent_key, "
            " (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user') AS turn_count, "
            " (SELECT m.content FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user' ORDER BY m.created_at DESC LIMIT 1) AS last_prompt, "
            " (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_at "
            "FROM conversations c WHERE c.project_id = ? ORDER BY COALESCE(last_at, c.created_at) DESC",
            (project_id,),
        ).fetchall()
    return [dict(r) for r in rows if r["turn_count"] > 0]  # hide empty conversations (never actually used)


def get_chat_history(project_id: str, limit_turns: int = 40, conversation_id: Optional[str] = None) -> dict[str, Any]:
    """One conversation, turn by turn, so the chat page can restore a thread
    after a reload. Defaults to the project's most recent conversation."""
    with get_connection() as conn:
        if conversation_id:
            conv = conn.execute(
                "SELECT id FROM conversations WHERE id = ? AND project_id = ?", (conversation_id, project_id)
            ).fetchone()
        else:
            conv = conn.execute(
                "SELECT id FROM conversations WHERE project_id = ? ORDER BY created_at DESC LIMIT 1", (project_id,)
            ).fetchone()
        if not conv:
            return {"conversation_id": None, "turns": []}
        messages = conn.execute(
            "SELECT * FROM (SELECT * FROM messages WHERE conversation_id = ? AND role = 'user' "
            "ORDER BY created_at DESC LIMIT ?) ORDER BY created_at ASC",
            (conv["id"], limit_turns),
        ).fetchall()
        turns = []
        for m in messages:
            rows = conn.execute(
                "SELECT * FROM model_responses WHERE message_id = ? ORDER BY created_at ASC, rowid ASC", (m["id"],)
            ).fetchall()
            decision = conn.execute(
                "SELECT chosen_response_id FROM decisions WHERE message_id = ? ORDER BY decided_at DESC LIMIT 1",
                (m["id"],),
            ).fetchone()
            turns.append(
                {
                    "message_id": m["id"],
                    "prompt": m["content"],
                    "context_used": json.loads(m["context_used"]) if m["context_used"] else [],
                    "sent_at": m["created_at"],
                    "rows": [dict(r) for r in rows],
                    "chosen_response_id": decision["chosen_response_id"] if decision else None,
                }
            )
    return {"conversation_id": conv["id"], "turns": turns}


def get_project_stats(project_id: str) -> dict[str, Any]:
    """Powers the sidebar project switcher and the Overview page's stat tiles
    — every number here is a real COUNT(*), never a placeholder."""
    with get_connection() as conn:
        context_count = conn.execute(
            "SELECT COUNT(*) FROM project_context WHERE project_id = ?", (project_id,)
        ).fetchone()[0]
        decisions_count = conn.execute(
            "SELECT COUNT(*) FROM decisions WHERE project_id = ?", (project_id,)
        ).fetchone()[0]
        conversation_count = conn.execute(
            "SELECT COUNT(*) FROM conversations WHERE project_id = ?", (project_id,)
        ).fetchone()[0]
        message_count = conn.execute(
            "SELECT COUNT(*) FROM messages WHERE conversation_id IN "
            "(SELECT id FROM conversations WHERE project_id = ?)",
            (project_id,),
        ).fetchone()[0]
        last_activity_at = conn.execute(
            "SELECT MAX(ts) FROM ("
            "  SELECT created_at AS ts FROM project_context WHERE project_id = ?"
            "    AND COALESCE(json_extract(metadata, '$.source'), '') <> 'import'"
            "  UNION ALL SELECT decided_at AS ts FROM decisions WHERE project_id = ?"
            "  UNION ALL SELECT m.created_at AS ts FROM messages m "
            "    JOIN conversations c ON c.id = m.conversation_id WHERE c.project_id = ?"
            ")",
            (project_id, project_id, project_id),
        ).fetchone()[0]
    return {
        "context_count": context_count,
        "decisions_count": decisions_count,
        "conversation_count": conversation_count,
        "message_count": message_count,
        "last_activity_at": last_activity_at,
    }


# --- insights: usage & decisions -----------------------------------------------

def get_usage_summary(project_id: str) -> dict[str, Any]:
    with get_connection() as conn:
        totals = conn.execute(
            "SELECT COUNT(*) AS request_count, COALESCE(SUM(tokens_in), 0) AS tokens_in, "
            "COALESCE(SUM(tokens_out), 0) AS tokens_out, COALESCE(SUM(cost_usd), 0) AS cost_usd "
            "FROM usage_logs WHERE project_id = ?",
            (project_id,),
        ).fetchone()
        by_model = conn.execute(
            "SELECT mr.model_id AS model_id, COUNT(*) AS request_count, "
            "COALESCE(SUM(ul.cost_usd), 0) AS cost_usd, COALESCE(SUM(ul.tokens_in), 0) AS tokens_in, "
            "COALESCE(SUM(ul.tokens_out), 0) AS tokens_out "
            "FROM usage_logs ul LEFT JOIN model_responses mr ON mr.id = ul.model_response_id "
            "WHERE ul.project_id = ? GROUP BY mr.model_id ORDER BY cost_usd DESC",
            (project_id,),
        ).fetchall()
    return {
        "request_count": totals["request_count"],
        "tokens_in": totals["tokens_in"],
        "tokens_out": totals["tokens_out"],
        "cost_usd": totals["cost_usd"],
        "by_model": [dict(r) for r in by_model],
    }


def list_recent_activity(project_id: str, limit: int = 20) -> list[dict[str, Any]]:
    """Unified feed backing Overview's "Recent Activity" and the Activity page
    — a real merge of context additions and decisions, nothing invented."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT 'context' AS kind, id, title AS label, type AS detail, COALESCE(updated_at, created_at) AS ts "
            "FROM project_context WHERE project_id = ? "
            "UNION ALL "
            "SELECT 'decision' AS kind, d.id, d.task_type AS label, mr.model_id AS detail, d.decided_at AS ts "
            "FROM decisions d JOIN model_responses mr ON mr.id = d.chosen_response_id "
            "WHERE d.project_id = ? "
            "ORDER BY ts DESC LIMIT ?",
            (project_id, project_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def list_decisions(project_id: str, limit: int = 50) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT d.*, mr.model_id AS model_id, mr.provider AS provider, mr.phase AS phase "
            "FROM decisions d JOIN model_responses mr ON mr.id = d.chosen_response_id "
            "WHERE d.project_id = ? ORDER BY d.decided_at DESC LIMIT ?",
            (project_id, limit),
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["tags"] = json.loads(d.get("tags") or "[]")
        out.append(d)
    return out


# --- model registry overlay ---------------------------------------------------

def get_live_model_registry() -> list[dict[str, Any]]:
    """Optional: lets ops flip is_active / pricing without a deploy. Unpopulated
    until something writes to model_registry — config.py's MODEL_REGISTRY is
    the real source of truth until then."""
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM model_registry WHERE is_active = 1").fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["capabilities"] = json.loads(d["capabilities"] or "[]")
        result.append(d)
    return result


# --- watched folders (live scanner) -----------------------------------------

def _watch_row(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    d["auto_import"] = bool(d["auto_import"])
    d["known"] = json.loads(d.get("known") or "[]")
    d["excluded"] = json.loads(d.get("excluded") or "[]")
    return d


def create_watch(owner_id: str, path: str, auto_import: bool, known: list[str]) -> dict[str, Any]:
    watch_id, now = _new_id(), _now()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO watched_folders (id, owner_id, path, auto_import, known, last_scan_at, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (watch_id, owner_id, path, int(auto_import), json.dumps(known), now, now),
        )
    return get_watch(watch_id)  # type: ignore[return-value]


def get_watch(watch_id: str) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM watched_folders WHERE id = ?", (watch_id,)).fetchone()
        return _watch_row(row) if row else None


def list_watches(owner_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM watched_folders WHERE owner_id = ? ORDER BY created_at", (owner_id,)
        ).fetchall()
        return [_watch_row(r) for r in rows]


def list_all_watches() -> list[dict[str, Any]]:
    with get_connection() as conn:
        return [_watch_row(r) for r in conn.execute("SELECT * FROM watched_folders").fetchall()]


def update_watch(
    watch_id: str,
    auto_import: Optional[bool] = None,
    known: Optional[list[str]] = None,
    last_scan_at: Optional[str] = None,
    excluded: Optional[list[str]] = None,
) -> Optional[dict[str, Any]]:
    sets: list[str] = []
    values: list[Any] = []
    if auto_import is not None:
        sets.append("auto_import = ?")
        values.append(int(auto_import))
    if known is not None:
        sets.append("known = ?")
        values.append(json.dumps(known))
    if last_scan_at is not None:
        sets.append("last_scan_at = ?")
        values.append(last_scan_at)
    if excluded is not None:
        sets.append("excluded = ?")
        values.append(json.dumps(excluded))
    if sets:
        with get_connection() as conn:
            conn.execute(f"UPDATE watched_folders SET {', '.join(sets)} WHERE id = ?", (*values, watch_id))
    return get_watch(watch_id)


def delete_watch(watch_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM watched_folders WHERE id = ?", (watch_id,))


# --- credits ----------------------------------------------------------------

def list_credit_accounts() -> list[dict[str, Any]]:
    with get_connection() as conn:
        return [dict(r) for r in conn.execute("SELECT provider, balance_usd, set_at FROM credit_accounts").fetchall()]


def set_credit_account(provider: str, balance_usd: float) -> None:
    """Record "I have this much credit left with <provider>, as of now"."""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO credit_accounts (provider, balance_usd, set_at) VALUES (?, ?, ?) "
            "ON CONFLICT(provider) DO UPDATE SET balance_usd = excluded.balance_usd, set_at = excluded.set_at",
            (provider, balance_usd, _now()),
        )


def clear_credit_account(provider: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM credit_accounts WHERE provider = ?", (provider,))


def spend_since(provider: Optional[str], since: Optional[str]) -> float:
    """Cost logged by this app (all projects) for a provider since a timestamp."""
    sql = (
        "SELECT COALESCE(SUM(ul.cost_usd), 0) FROM usage_logs ul "
        "LEFT JOIN model_responses mr ON mr.id = ul.model_response_id WHERE 1 = 1"
    )
    args: list[Any] = []
    if provider:
        sql += " AND mr.provider = ?"
        args.append(provider)
    if since:
        sql += " AND ul.created_at >= ?"
        args.append(since)
    with get_connection() as conn:
        return float(conn.execute(sql, args).fetchone()[0])


# --- milestones ---------------------------------------------------------------

def _milestone_row(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    d["is_done"] = bool(d["is_done"])
    return d


def create_milestone(project_id: str, title: str, target_date: Optional[str]) -> dict[str, Any]:
    milestone_id, now = _new_id(), _now()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO milestones (id, project_id, title, target_date, is_done, created_at) VALUES (?, ?, ?, ?, 0, ?)",
            (milestone_id, project_id, title, target_date, now),
        )
    return get_milestone(milestone_id)  # type: ignore[return-value]


def get_milestone(milestone_id: str) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM milestones WHERE id = ?", (milestone_id,)).fetchone()
        return _milestone_row(row) if row else None


def list_milestones(project_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM milestones WHERE project_id = ? ORDER BY is_done, (target_date IS NULL), target_date, created_at",
            (project_id,),
        ).fetchall()
        return [_milestone_row(r) for r in rows]


def next_milestone(project_id: str) -> Optional[dict[str, Any]]:
    """The soonest incomplete milestone (undated ones sort last)."""
    milestones = list_milestones(project_id)
    return next((m for m in milestones if not m["is_done"]), None)


def update_milestone(
    milestone_id: str, title: Optional[str] = None, target_date: Any = UNSET, is_done: Optional[bool] = None
) -> Optional[dict[str, Any]]:
    sets: list[str] = []
    values: list[Any] = []
    if title is not None and title.strip():
        sets.append("title = ?")
        values.append(title.strip())
    if target_date is not UNSET:
        sets.append("target_date = ?")
        values.append(target_date)
    if is_done is not None:
        sets.append("is_done = ?")
        values.append(int(is_done))
    if sets:
        with get_connection() as conn:
            conn.execute(f"UPDATE milestones SET {', '.join(sets)} WHERE id = ?", (*values, milestone_id))
    return get_milestone(milestone_id)


def delete_milestone(milestone_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM milestones WHERE id = ?", (milestone_id,))


# --- settings (one row per owner_id, like everywhere else until real auth) ----

_SETTINGS_DEFAULTS = {
    "workspace_name": "My Workspace",
    "default_view": "dashboard",
    "default_model": None,
    "response_style": "balanced",
    "auto_save_context": True,
    "multi_model_default": True,
    "auto_save_decisions": True,
    "include_files_context": True,
}


def _settings_row(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    for key in ("auto_save_context", "multi_model_default", "auto_save_decisions", "include_files_context"):
        d[key] = bool(d[key])
    return d


def get_settings_for(owner_id: str) -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM settings WHERE owner_id = ?", (owner_id,)).fetchone()
        if row:
            return _settings_row(row)
    return {"owner_id": owner_id, "updated_at": _now(), **_SETTINGS_DEFAULTS}


def update_settings(owner_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    current = get_settings_for(owner_id)
    merged = {**_SETTINGS_DEFAULTS, **{k: v for k, v in current.items() if k in _SETTINGS_DEFAULTS}, **fields}
    now = _now()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO settings (owner_id, workspace_name, default_view, default_model, response_style, "
            " auto_save_context, multi_model_default, auto_save_decisions, include_files_context, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(owner_id) DO UPDATE SET "
            " workspace_name = excluded.workspace_name, default_view = excluded.default_view, "
            " default_model = excluded.default_model, response_style = excluded.response_style, "
            " auto_save_context = excluded.auto_save_context, multi_model_default = excluded.multi_model_default, "
            " auto_save_decisions = excluded.auto_save_decisions, include_files_context = excluded.include_files_context, "
            " updated_at = excluded.updated_at",
            (
                owner_id,
                merged["workspace_name"],
                merged["default_view"],
                merged["default_model"],
                merged["response_style"],
                int(merged["auto_save_context"]),
                int(merged["multi_model_default"]),
                int(merged["auto_save_decisions"]),
                int(merged["include_files_context"]),
                now,
            ),
        )
    return get_settings_for(owner_id)


# --- integration credentials ---------------------------------------------------

def _credential_row(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    d["credential"] = json.loads(d.get("credential") or "{}")
    return d


def list_integration_credentials(owner_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM integration_credentials WHERE owner_id = ? ORDER BY service", (owner_id,)
        ).fetchall()
        return [_credential_row(r) for r in rows]


def get_integration_credential(owner_id: str, service: str) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM integration_credentials WHERE owner_id = ? AND service = ?", (owner_id, service)
        ).fetchone()
        return _credential_row(row) if row else None


def set_integration_credential(owner_id: str, service: str, credential: dict[str, Any]) -> dict[str, Any]:
    """Store a pasted token/key. Status starts 'unknown' until a test-connection
    call (see app/integrations.py) confirms it."""
    now = _now()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO integration_credentials (id, owner_id, service, credential, status, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, 'unknown', ?, ?) "
            "ON CONFLICT(owner_id, service) DO UPDATE SET "
            " credential = excluded.credential, status = 'unknown', status_detail = NULL, updated_at = excluded.updated_at",
            (_new_id(), owner_id, service, json.dumps(credential), now, now),
        )
    return get_integration_credential(owner_id, service)  # type: ignore[return-value]


def set_integration_status(owner_id: str, service: str, status: str, detail: Optional[str]) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE integration_credentials SET status = ?, status_detail = ?, last_checked_at = ? "
            "WHERE owner_id = ? AND service = ?",
            (status, detail, _now(), owner_id, service),
        )


def delete_integration_credential(owner_id: str, service: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM integration_credentials WHERE owner_id = ? AND service = ?", (owner_id, service))


# --- context folders (can exist with zero items) --------------------------------

def list_context_folders(project_id: str) -> list[str]:
    """Every folder name for a project: explicit rows plus any name only an
    item still points at (covers folders auto-assigned by imports)."""
    with get_connection() as conn:
        explicit = {r["name"] for r in conn.execute("SELECT name FROM context_folders WHERE project_id = ?", (project_id,)).fetchall()}
        from_items = {
            r["folder"]
            for r in conn.execute(
                "SELECT DISTINCT folder FROM project_context WHERE project_id = ? AND folder IS NOT NULL", (project_id,)
            ).fetchall()
        }
    return sorted(explicit | from_items)


def create_context_folder(project_id: str, name: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO context_folders (id, project_id, name, created_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(project_id, name) DO NOTHING",
            (_new_id(), project_id, name, _now()),
        )


def rename_context_folder(project_id: str, old_name: str, new_name: str) -> None:
    """Renames the folder row (if any) and every item currently in it."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE context_folders SET name = ? WHERE project_id = ? AND name = ?", (new_name, project_id, old_name)
        )
        conn.execute(
            "UPDATE project_context SET folder = ?, updated_at = ? WHERE project_id = ? AND folder = ?",
            (new_name, _now(), project_id, old_name),
        )
    create_context_folder(project_id, new_name)  # covers a rename of an implicit (item-only) folder


def delete_context_folder(project_id: str, name: str) -> None:
    """Removes the folder row and clears `folder` on any item still in it
    (the items themselves are not deleted)."""
    with get_connection() as conn:
        conn.execute("DELETE FROM context_folders WHERE project_id = ? AND name = ?", (project_id, name))
        conn.execute(
            "UPDATE project_context SET folder = NULL, updated_at = ? WHERE project_id = ? AND folder = ?",
            (_now(), project_id, name),
        )


# --- project intelligence: instructions, skills, MCP, tool audit ------------

def get_project_instructions(project_id: str) -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM project_instructions WHERE project_id = ?", (project_id,)).fetchone()
    if row:
        result = dict(row)
        result["is_active"] = bool(result["is_active"])
        return result
    now = _now()
    return {"project_id": project_id, "content": "", "version": 0, "is_active": True, "created_at": now, "updated_at": now}


def set_project_instructions(project_id: str, content: str, is_active: bool) -> dict[str, Any]:
    now = _now()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO project_instructions (project_id, content, version, is_active, created_at, updated_at) "
            "VALUES (?, ?, 1, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET "
            "content = excluded.content, version = project_instructions.version + 1, "
            "is_active = excluded.is_active, updated_at = excluded.updated_at",
            (project_id, content, int(is_active), now, now),
        )
    return get_project_instructions(project_id)


def get_workspace_instructions(owner_id: str) -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM workspace_instructions WHERE owner_id = ?", (owner_id,)).fetchone()
    if row:
        result = dict(row)
        result["is_active"] = bool(result["is_active"])
        return result
    now = _now()
    return {"owner_id": owner_id, "content": "", "version": 0, "is_active": True, "created_at": now, "updated_at": now}


def set_workspace_instructions(owner_id: str, content: str, is_active: bool) -> dict[str, Any]:
    now = _now()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO workspace_instructions (owner_id, content, version, is_active, created_at, updated_at) "
            "VALUES (?, ?, 1, ?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET "
            "content = excluded.content, version = workspace_instructions.version + 1, "
            "is_active = excluded.is_active, updated_at = excluded.updated_at",
            (owner_id, content, int(is_active), now, now),
        )
    return get_workspace_instructions(owner_id)


def _skill_row(row: sqlite3.Row) -> dict[str, Any]:
    value = dict(row)
    value["tool_names"] = json.loads(value.get("tool_names") or "[]")
    value["is_enabled"] = bool(value["is_enabled"])
    return value


def list_project_skills(project_id: str, enabled_only: bool = False) -> list[dict[str, Any]]:
    sql = "SELECT * FROM project_skills WHERE project_id = ?"
    if enabled_only:
        sql += " AND is_enabled = 1"
    sql += " ORDER BY name"
    with get_connection() as conn:
        return [_skill_row(row) for row in conn.execute(sql, (project_id,)).fetchall()]


def create_project_skill(project_id: str, data: dict[str, Any]) -> dict[str, Any]:
    skill_id, now = _new_id(), _now()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO project_skills (id, project_id, name, description, instructions, tool_names, is_enabled, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (skill_id, project_id, data["name"].strip(), data["description"].strip(), data["instructions"].strip(),
             json.dumps(data.get("tool_names", [])), int(data.get("is_enabled", True)), now, now),
        )
        row = conn.execute("SELECT * FROM project_skills WHERE id = ?", (skill_id,)).fetchone()
    return _skill_row(row)


def delete_project_skill(project_id: str, skill_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM project_skills WHERE project_id = ? AND id = ?", (project_id, skill_id))
        return cursor.rowcount > 0


def _mcp_row(row: sqlite3.Row, include_headers: bool = False) -> dict[str, Any]:
    value = dict(row)
    headers = json.loads(value.pop("headers", "{}") or "{}")
    value["header_names"] = sorted(headers)
    if include_headers:
        value["headers"] = headers
    value["allowed_tools"] = json.loads(value.get("allowed_tools") or "[]")
    value["is_enabled"] = bool(value["is_enabled"])
    return value


def list_mcp_connections(project_id: str, include_headers: bool = False) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM mcp_connections WHERE project_id = ? ORDER BY name", (project_id,)).fetchall()
    return [_mcp_row(row, include_headers) for row in rows]


def create_mcp_connection(project_id: str, data: dict[str, Any]) -> dict[str, Any]:
    connection_id, now = _new_id(), _now()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO mcp_connections (id, project_id, name, url, headers, allowed_tools, is_enabled, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (connection_id, project_id, data["name"].strip(), data["url"].strip(), json.dumps(data.get("headers", {})),
             json.dumps(data.get("allowed_tools", [])), int(data.get("is_enabled", True)), now, now),
        )
        row = conn.execute("SELECT * FROM mcp_connections WHERE id = ?", (connection_id,)).fetchone()
    return _mcp_row(row)


def delete_mcp_connection(project_id: str, connection_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM mcp_connections WHERE project_id = ? AND id = ?", (project_id, connection_id))
        return cursor.rowcount > 0


def record_tool_execution(project_id: str, model_id: str, tool_name: str, arguments: dict[str, Any],
                          output: str | None, success: bool, error: str | None = None,
                          message_id: str | None = None) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO tool_executions (id, project_id, message_id, model_id, tool_name, arguments, output, success, error, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (_new_id(), project_id, message_id, model_id, tool_name, json.dumps(arguments), output, int(success), error, _now()),
        )
