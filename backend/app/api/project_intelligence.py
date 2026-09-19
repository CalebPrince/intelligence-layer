"""Shared instructions, project skills, and project-scoped MCP connections."""
from fastapi import APIRouter, HTTPException, Response

from app import database
from app.schemas import (
    McpConnection,
    McpConnectionCreate,
    ProjectInstructions,
    ProjectInstructionsUpdate,
    ProjectSkill,
    ProjectSkillCreate,
)

router = APIRouter(prefix="/v1/projects/{project_id}", tags=["project-intelligence"])


def _require_project(project_id: str) -> None:
    if not database.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")


@router.get("/instructions", response_model=ProjectInstructions)
async def get_instructions(project_id: str) -> dict:
    _require_project(project_id)
    return database.get_project_instructions(project_id)


@router.put("/instructions", response_model=ProjectInstructions)
async def put_instructions(project_id: str, req: ProjectInstructionsUpdate) -> dict:
    _require_project(project_id)
    return database.set_project_instructions(project_id, req.content, req.is_active)


@router.get("/skills", response_model=list[ProjectSkill])
async def list_skills(project_id: str) -> list[dict]:
    _require_project(project_id)
    return database.list_project_skills(project_id)


@router.post("/skills", response_model=ProjectSkill, status_code=201)
async def create_skill(project_id: str, req: ProjectSkillCreate) -> dict:
    _require_project(project_id)
    try:
        return database.create_project_skill(project_id, req.model_dump())
    except Exception as exc:
        if "UNIQUE constraint" in str(exc):
            raise HTTPException(status_code=409, detail="A skill with that name already exists") from exc
        raise


@router.delete("/skills/{skill_id}", status_code=204)
async def delete_skill(project_id: str, skill_id: str) -> Response:
    if not database.delete_project_skill(project_id, skill_id):
        raise HTTPException(status_code=404, detail="Skill not found")
    return Response(status_code=204)


@router.get("/mcp-connections", response_model=list[McpConnection])
async def list_mcp(project_id: str) -> list[dict]:
    _require_project(project_id)
    return database.list_mcp_connections(project_id)


@router.post("/mcp-connections", response_model=McpConnection, status_code=201)
async def create_mcp(project_id: str, req: McpConnectionCreate) -> dict:
    _require_project(project_id)
    if not req.url.startswith(("https://", "http://localhost", "http://127.0.0.1")):
        raise HTTPException(status_code=400, detail="MCP URL must use HTTPS (localhost HTTP is allowed)")
    try:
        return database.create_mcp_connection(project_id, req.model_dump())
    except Exception as exc:
        if "UNIQUE constraint" in str(exc):
            raise HTTPException(status_code=409, detail="An MCP connection with that name already exists") from exc
        raise


@router.delete("/mcp-connections/{connection_id}", status_code=204)
async def delete_mcp(project_id: str, connection_id: str) -> Response:
    if not database.delete_mcp_connection(project_id, connection_id):
        raise HTTPException(status_code=404, detail="MCP connection not found")
    return Response(status_code=204)
