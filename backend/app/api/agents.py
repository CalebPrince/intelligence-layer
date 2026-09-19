"""Adapters for prince-web-app's public and authenticated agent chat routes.

Sage is public and memory-backed upstream; the other allowlisted agents use
the authenticated admin adapter and require an explicit bearer token.
"""
from fastapi import APIRouter, Header, HTTPException
from fastapi.concurrency import run_in_threadpool

from app import agent_client, database, sage_client
from app.config import get_settings
from app.schemas import AgentChatRequest, AgentChatResponse, ChatMessage, ModelResponse, SageChatRequest, SageChatResponse

router = APIRouter(prefix="/v1/agents", tags=["agents"])

ADMIN_AGENT_KEYS = {
    "lisa", "content", "beacon", "dossier", "nurturer", "proposal", "arch", "ada",
    "chief", "sketch", "scout", "radar", "reel", "chloe", "wendy", "allie",
}


def _shared_memory_authorized(token: str | None) -> None:
    expected = get_settings().shared_memory_token.strip()
    if not expected or token != expected:
        raise HTTPException(status_code=401, detail="Shared memory access is not configured")


@router.get("/shared-memory/{agent_key}")
async def read_shared_memory(agent_key: str, memory_key: str, token: str | None = Header(default=None, alias="X-Shared-Memory-Token")) -> dict:
    _shared_memory_authorized(token)
    if agent_key not in ADMIN_AGENT_KEYS:
        raise HTTPException(status_code=404, detail="Unknown admin agent")
    return {"turns": database.get_shared_agent_memory(memory_key, agent_key)}


@router.post("/shared-memory/{agent_key}")
async def write_shared_memory(agent_key: str, payload: dict, token: str | None = Header(default=None, alias="X-Shared-Memory-Token")) -> dict:
    _shared_memory_authorized(token)
    if agent_key not in ADMIN_AGENT_KEYS:
        raise HTTPException(status_code=404, detail="Unknown admin agent")
    memory_key = str(payload.get("memory_key", "")).strip()
    turns = payload.get("turns", [])
    if not memory_key or not isinstance(turns, list):
        raise HTTPException(status_code=400, detail="memory_key and turns are required")
    database.append_shared_agent_memory(memory_key, agent_key, turns[-2:])
    return {"ok": True}


@router.get("/{agent_key}/history")
async def agent_history(agent_key: str, project_id: str) -> dict:
    if agent_key not in ADMIN_AGENT_KEYS:
        raise HTTPException(status_code=404, detail="Unknown admin agent")
    if not database.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return database.get_latest_agent_history(project_id, agent_key)


@router.post("/sage/chat", response_model=SageChatResponse)
async def sage_chat(req: SageChatRequest) -> dict:
    project = database.get_project(req.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message can't be empty")

    if req.conversation_id:
        conv = database.get_conversation(req.conversation_id)
        if not conv or conv["project_id"] != req.project_id or conv.get("agent_key") != "sage":
            raise HTTPException(status_code=404, detail="Sage conversation not found")
    else:
        conv = database.create_conversation(req.project_id, title=message[:60] or "Chat with Sage", agent_key="sage")

    transcript = database.build_agent_transcript(conv["id"], reply_role="agent")

    try:
        result = await run_in_threadpool(sage_client.chat, message, transcript, conv.get("external_token"))
    except sage_client.SageError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    database.set_conversation_external_token(conv["id"], result["token"])
    user_message = database.save_message(conv["id"], ChatMessage(role="user", content=message))
    saved = database.save_model_responses(
        user_message["id"],
        [
            ModelResponse(
                model_id="sage",
                provider="prince-web-app",
                display_name="Sage",
                phase="initial",
                content=result["reply"],
            )
        ],
    )
    return {
        "conversation_id": conv["id"],
        "message_id": user_message["id"],
        "response_id": saved[0]["id"],
        "reply": result["reply"],
        "drafted": result.get("drafted"),
    }


@router.post("/admin/chat", response_model=AgentChatResponse)
async def admin_agent_chat(req: AgentChatRequest) -> dict:
    if req.agent_key not in ADMIN_AGENT_KEYS:
        raise HTTPException(status_code=404, detail="Unknown admin agent")
    project = database.get_project(req.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message can't be empty")
    if req.conversation_id:
        conversation = database.get_conversation(req.conversation_id)
        if not conversation or conversation["project_id"] != req.project_id or conversation.get("agent_key") != req.agent_key:
            raise HTTPException(status_code=404, detail="Agent conversation not found")
    else:
        conversation = database.create_conversation(req.project_id, title=message[:60], agent_key=req.agent_key)
    try:
        memory_key = (req.memory_key or req.project_id).strip()
        transcript = database.get_shared_agent_memory(req.memory_key or req.project_id, req.agent_key)
        if not transcript:
            transcript = database.build_agent_transcript(conversation["id"], reply_role="agent")
        result = await run_in_threadpool(agent_client.chat, req.agent_key, message, transcript)
    except agent_client.AgentError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    user_message = database.save_message(conversation["id"], ChatMessage(role="user", content=message))
    saved = database.save_model_responses(
        user_message["id"],
        [
            ModelResponse(
                model_id=req.agent_key,
                provider="prince-web-app",
                display_name=req.agent_key.title(),
                phase="initial",
                content=result["reply"],
            )
        ],
    )
    database.append_shared_agent_memory(
        memory_key,
        req.agent_key,
        [{"role": "user", "text": message}, {"role": "agent", "text": result["reply"]}],
    )
    return {
        "agent_key": req.agent_key,
        "conversation_id": conversation["id"],
        "message_id": user_message["id"],
        "response_id": saved[0]["id"],
        "reply": result["reply"],
    }


@router.post("/proposal/draft")
async def proposal_draft(inquiry_id: int | None = None, brief: str = "") -> dict:
    payload = {"brief": brief}
    if inquiry_id is not None:
        payload["inquiry_id"] = inquiry_id
    try:
        return await run_in_threadpool(agent_client.request_json, "/api/v1/admin/proposals/generate", payload)
    except agent_client.AgentError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/names")
async def agent_names() -> dict[str, str]:
    try:
        result = await run_in_threadpool(agent_client.get_json, "/api/v1/admin/agent-names")
        return {str(key): str(value) for key, value in result.items()}
    except agent_client.AgentError:
        return {}
