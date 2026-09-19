"""Workspace settings — one row per owner_id (see database.py's `settings`
table), read/written by the Settings page's General tab. No auth exists yet,
so this is scoped to DEMO_OWNER_ID like everything else."""
from fastapi import APIRouter, Query

from app import database
from app.schemas import WorkspaceInstructions, WorkspaceInstructionsUpdate, WorkspacePreferences, WorkspacePreferencesUpdate, WorkspaceSettings, WorkspaceSettingsUpdate

router = APIRouter(prefix="/v1/settings", tags=["settings"])


@router.get("", response_model=WorkspaceSettings)
async def get_settings(owner_id: str = Query(...)) -> dict:
    return database.get_settings_for(owner_id)


@router.put("", response_model=WorkspaceSettings)
async def update_settings(req: WorkspaceSettingsUpdate, owner_id: str = Query(...)) -> dict:
    fields = {k: v for k, v in req.model_dump().items() if v is not None}
    return database.update_settings(owner_id, fields)


@router.get("/instructions", response_model=WorkspaceInstructions)
async def get_instructions(owner_id: str = Query(...)) -> dict:
    return database.get_workspace_instructions(owner_id)


@router.put("/instructions", response_model=WorkspaceInstructions)
async def update_instructions(req: WorkspaceInstructionsUpdate, owner_id: str = Query(...)) -> dict:
    return database.set_workspace_instructions(owner_id, req.content, req.is_active)


@router.get("/preferences", response_model=WorkspacePreferences)
async def get_preferences(owner_id: str = Query(...)) -> dict:
    return database.get_workspace_preferences(owner_id)


@router.put("/preferences", response_model=WorkspacePreferences)
async def update_preferences(req: WorkspacePreferencesUpdate, owner_id: str = Query(...)) -> dict:
    return database.set_workspace_preferences(owner_id, req.preferences)
