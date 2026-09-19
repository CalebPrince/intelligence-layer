"""POST /v1/chat — ties router.py (selection + execution) to database.py
(context retrieval, persistence, and the per-project affinity signal)."""
import re
from fastapi import APIRouter, HTTPException

from app import context_meta, database, github_client, retrieval, tool_runtime
from app.config import MODEL_REGISTRY
from app.router import route_and_complete
from app.schemas import (
    ChatHistory,
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ContextPreview,
    ContextStats,
    ContextUsed,
    ConversationSummary,
    DecisionRequest,
    HistoryTurn,
    ModelResponse,
)

router = APIRouter(prefix="/v1", tags=["chat"])


def project_system_brief(project: dict | None) -> str:
    """Give every provider the same durable orientation before retrieval text."""
    if not project:
        return (
            "You are answering inside Inteli-Space, a project intelligence workspace. "
            "Use the supplied project context as the source of truth and say when the context does not contain an answer."
        )
    tags = ", ".join(project.get("tags") or []) or "none recorded"
    return (
        "You are answering inside Inteli-Space, the user's project intelligence workspace. "
        "This conversation is about the project below. Treat the supplied Project Context Library as authoritative "
        "workspace knowledge, connect answers to the actual app and its files, and do not fall back to generic advice "
        "when the context contains a concrete answer. If the needed file or fact is not present in the supplied context, "
        "say that clearly instead of inventing it.\n\n"
        f"Project: {project.get('name') or 'Unnamed project'}\n"
        f"Description: {project.get('description') or 'No description recorded'}\n"
        f"Category: {project.get('category') or 'Uncategorized'}\n"
        f"Tags: {tags}"
    )

def select_context(project_id: str, query: str | None) -> tuple[str, list[dict], dict]:
    """Which parts of the project's context go with this question (see
    app/retrieval.py): the sections that match it, plus a short brief baseline."""
    items = database.get_project_context(project_id, limit=500)
    folder_of = lambda i: i.get("folder") or context_meta.auto_folder(i["title"], i["type"])  # noqa: E731
    return retrieval.select_context(items, query or "", folder_of)


def hydrate_requested_github_files(project_id: str, query: str) -> None:
    """Fetch a large GitHub text file when the question names it."""
    project = database.get_project(project_id)
    source = (project or {}).get("source_path") or ""
    if not source.startswith("github://"):
        return
    parts = source.removeprefix("github://").split("/", 1)
    if len(parts) != 2:
        return
    owner, repo_name = parts
    credential = database.get_integration_credential((project or {}).get("owner_id", ""), "github")
    token = str((credential or {}).get("credential", {}).get("token", "")).strip()
    if not token:
        return
    query_lower = query.lower()
    try:
        branch = str(github_client.get_repository(token, owner, repo_name).get("default_branch", "main"))
    except github_client.GitHubError:
        branch = "main"
    known = database.context_paths_for_source(project_id, "github")
    for item in database.get_project_context(project_id, limit=500):
        if item.get("metadata", {}).get("path") != "large files manifest":
            continue
        for line in item.get("content", "").splitlines():
            match = re.match(r"^- (.+?) \(\d+ KB\)$", line.strip())
            if not match:
                continue
            path = match.group(1)
            if path in known or (path.lower() not in query_lower and path.rsplit("/", 1)[-1].lower() not in query_lower):
                continue
            try:
                content = github_client.get_file(token, owner, repo_name, path, branch)
            except github_client.GitHubError:
                continue
            database.create_context_item(
                project_id, "document", f"{owner}/{repo_name} / {path}", content,
                {"source": "github", "repository": f"{owner}/{repo_name}", "path": path, "on_demand": True},
                folder="GitHub",
            )
            known.add(path)


def hydrate_empty_github_project(project: dict | None) -> None:
    """Repair a GitHub project whose import created metadata but no context."""
    if not project or database.get_project_context(project["id"], limit=1):
        return
    source = str(project.get("source_path") or "")
    if not source.startswith("github://") or "/" not in source.removeprefix("github://"):
        return
    owner, name = source.removeprefix("github://").split("/", 1)
    credential = database.get_integration_credential(project.get("owner_id", ""), "github")
    token = str((credential or {}).get("credential", {}).get("token", "")).strip()
    if not token:
        return
    repo = github_client.get_repository(token, owner, name)
    repo_name = str(repo.get("full_name") or f"{owner}/{name}")
    branch = str(repo.get("default_branch") or "main")
    readme = github_client.get_readme(token, owner, name)
    imported_paths: set[str] = set()
    if readme:
        path, content = readme
        database.create_context_item(
            project["id"], "document", f"{repo_name} / {path}", content,
            {"source": "github", "repository": repo_name, "path": path, "html_url": repo.get("html_url", "")},
            folder="GitHub",
        )
        imported_paths.add(path)
    for path, content in github_client.list_text_files(token, owner, name, branch):
        if path in imported_paths:
            continue
        database.create_context_item(
            project["id"], "document", f"{repo_name} / {path}", content,
            {"source": "github", "repository": repo_name, "path": path, "html_url": f"{repo.get('html_url', '')}/blob/{branch}/{path}"},
            folder="GitHub",
        )


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    conversation_id = req.conversation_id
    if not conversation_id:
        conversation_id = database.create_conversation(req.project_id)["id"]

    messages = list(req.messages)
    project = database.get_project(req.project_id)
    context_used: list[dict] = []
    context_stats: dict | None = None
    if req.include_project_context:
        query = retrieval.query_from_messages(list(req.messages))
        try:
            hydrate_empty_github_project(project)
        except github_client.GitHubError:
            pass  # chat can still use manually added context if GitHub is unavailable
        hydrate_requested_github_files(req.project_id, query or "")
        context_blob, context_used, context_stats = select_context(req.project_id, query)
        grounding = project_system_brief(project)
        if context_blob:
            grounding += f"\n\nProject Context Library:\n\n{context_blob}"
        messages = [ChatMessage(role="system", content=grounding), *messages]

    query = retrieval.query_from_messages(list(req.messages))
    runtime_tools = []
    selected_skills: list[dict] = []
    if req.enable_tools:
        runtime_tools, selected_skills = await tool_runtime.build_tools(req.project_id, query or "")
    instructions = database.get_project_instructions(req.project_id)
    shared_blocks = []
    workspace_instructions = database.get_workspace_instructions((project or {}).get("owner_id", ""))
    if workspace_instructions.get("is_active") and workspace_instructions.get("content", "").strip():
        shared_blocks.append("Global Workspace Instructions (apply across every project):\n" + workspace_instructions["content"].strip())
    if instructions.get("is_active") and instructions.get("content", "").strip():
        shared_blocks.append("Shared Project Instructions (follow for every model and agent):\n" + instructions["content"].strip())
    skills_text = tool_runtime.skill_prompt(selected_skills)
    if skills_text:
        shared_blocks.append(skills_text)
    if shared_blocks:
        messages = [ChatMessage(role="system", content="\n\n".join(shared_blocks)), *messages]

    affinity: dict[str, int] = {}
    if req.criteria.use_project_affinity:
        affinity = database.get_model_affinity(req.project_id, req.criteria.task_type)

    try:
        responses, chosen_model_id, synthesis = await route_and_complete(
            messages, req.criteria, affinity=affinity, project_id=req.project_id,
            tools=runtime_tools, max_tool_rounds=req.max_tool_rounds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user_message = database.save_message(conversation_id, req.messages[-1], context_used=context_used)

    to_persist: list[ModelResponse] = [*responses, *([synthesis] if synthesis else [])]
    saved = database.save_model_responses(user_message["id"], to_persist)
    for response, saved_row in zip(to_persist, saved):
        response.id = saved_row["id"]  # lets the client reference this row when recording a decision

    database.log_usage(
        [
            {
                "project_id": req.project_id,
                "model_response_id": row["id"],
                "tokens_in": row["tokens_in"],
                "tokens_out": row["tokens_out"],
                "cost_usd": row["cost_usd"],
                "latency_ms": row["latency_ms"],
                "success": row["success"],
                "error_message": row["error"],
            }
            for row in saved
        ]
    )

    return ChatResponse(
        conversation_id=conversation_id,
        message_id=user_message["id"],
        mode=req.criteria.mode,
        responses=responses,
        chosen_model_id=chosen_model_id,
        synthesis=synthesis,
        context_used=[ContextUsed(**c) for c in context_used],
        context_stats=ContextStats(**context_stats) if context_stats else None,
    )


@router.post("/decisions")
async def record_decision(req: DecisionRequest) -> dict:
    return database.record_decision(
        req.project_id, req.message_id, req.chosen_response_id, req.task_type, req.mode.value, req.rationale
    )


@router.get("/models")
async def list_models() -> list[dict]:
    return [m.model_dump() for m in MODEL_REGISTRY]


@router.get("/projects/{project_id}/context/used", response_model=ContextPreview)
async def context_used(project_id: str, q: str = "") -> dict:
    """What would be sent for a question (same selection as /chat), plus the
    token estimate against sending everything. Without a question it shows the
    baseline that every message carries."""
    _, used, stats = select_context(project_id, q)
    return {"items": used, "stats": stats}


@router.get("/projects/{project_id}/conversations", response_model=list[ConversationSummary])
async def list_conversations(project_id: str) -> list[dict]:
    return database.list_conversations(project_id)


@router.post("/projects/{project_id}/chat/conversations", status_code=201)
async def create_chat_conversation(project_id: str) -> dict[str, str]:
    conversation = database.create_conversation(project_id)
    return {"conversation_id": conversation["id"]}


@router.delete("/projects/{project_id}/chat", status_code=204)
async def clear_chat(project_id: str, conversation_id: str | None = None) -> None:
    database.delete_conversation(project_id, conversation_id)


@router.get("/projects/{project_id}/chat/history", response_model=ChatHistory)
async def chat_history(project_id: str, conversation_id: str | None = None) -> ChatHistory:
    data = database.get_chat_history(project_id, conversation_id=conversation_id)
    names = {m.id: m.display_name for m in MODEL_REGISTRY}

    def to_response(row: dict) -> ModelResponse:
        return ModelResponse(
            id=row["id"],
            model_id=row["model_id"],
            provider=row["provider"],
            display_name=names.get(row["model_id"], row["model_id"].split("/")[-1]),
            phase=row["phase"],
            content=row["content"],
            tokens_in=row["tokens_in"],
            tokens_out=row["tokens_out"],
            cost_usd=row["cost_usd"],
            latency_ms=row["latency_ms"],
            success=bool(row["success"]),
            error=row["error"],
        )

    turns: list[HistoryTurn] = []
    for t in data["turns"]:
        rows = [to_response(r) for r in t["rows"]]
        synthesis = next((r for r in rows if r.phase == "synthesis"), None)
        others = [r for r in rows if r.phase != "synthesis"]
        initial = [r for r in others if r.phase == "initial"]
        mode = "deliberation" if synthesis else ("parallel" if len(initial) > 1 else "single")
        turns.append(
            HistoryTurn(
                message_id=t["message_id"],
                prompt=t["prompt"],
                sent_at=t["sent_at"],
                context_used=[ContextUsed(**c) for c in t.get("context_used", [])],
                mode=mode,
                responses=others,
                synthesis=synthesis,
                chosen_response_id=t["chosen_response_id"],
            )
        )
    return ChatHistory(conversation_id=data["conversation_id"], turns=turns)
