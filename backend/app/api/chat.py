"""POST /v1/chat — ties router.py (selection + execution) to database.py
(context retrieval, persistence, and the per-project affinity signal)."""
from fastapi import APIRouter, HTTPException

from app import context_meta, database, retrieval
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

def select_context(project_id: str, query: str | None) -> tuple[str, list[dict], dict]:
    """Which parts of the project's context go with this question (see
    app/retrieval.py): the sections that match it, plus a short brief baseline."""
    items = database.get_project_context(project_id, limit=500)
    folder_of = lambda i: i.get("folder") or context_meta.auto_folder(i["title"], i["type"])  # noqa: E731
    return retrieval.select_context(items, query or "", folder_of)


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    conversation_id = req.conversation_id
    if not conversation_id:
        conversation_id = database.create_conversation(req.project_id)["id"]

    messages = list(req.messages)
    context_used: list[dict] = []
    context_stats: dict | None = None
    if req.include_project_context:
        context_blob, context_used, context_stats = select_context(
            req.project_id, retrieval.query_from_messages(list(req.messages))
        )
        if context_blob:
            messages = [
                ChatMessage(role="system", content=f"Project context:\n\n{context_blob}"),
                *messages,
            ]

    affinity: dict[str, int] = {}
    if req.criteria.use_project_affinity:
        affinity = database.get_model_affinity(req.project_id, req.criteria.task_type)

    try:
        responses, chosen_model_id, synthesis = await route_and_complete(messages, req.criteria, affinity=affinity)
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
