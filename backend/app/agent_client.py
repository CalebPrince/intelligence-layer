"""Authenticated chat client for prince-web-app's admin agents."""
from typing import Any, Optional

import httpx

from app.config import get_settings


class AgentError(Exception):
    """Raised with a safe message for the frontend."""


def chat(agent_key: str, message: str, transcript: list[dict[str, str]]) -> dict[str, Any]:
    settings = get_settings()
    token = settings.prince_web_app_admin_token.strip()
    if not token:
        raise AgentError("Admin agent access is not configured yet.")

    base_url = settings.prince_web_app_url.strip().rstrip("/")
    url = f"{base_url}/api/v1/admin/agents/{agent_key}/chat"
    try:
        response = httpx.post(
            url,
            json={"message": message, "transcript": transcript[-30:]},
            headers={"Authorization": f"Bearer {token}"},
            timeout=45.0,
        )
    except httpx.HTTPError as exc:
        raise AgentError(f"Could not reach {agent_key}: {exc}") from exc

    if response.status_code in (401, 403):
        raise AgentError("The prince-web-app admin token was rejected.")
    if response.status_code >= 400:
        detail: Optional[str] = None
        try:
            body = response.json()
            detail = body.get("error") or body.get("detail")
        except ValueError:
            pass
        raise AgentError(detail or f"{agent_key} returned an error ({response.status_code}).")

    try:
        result = response.json()
    except ValueError as exc:
        raise AgentError(f"{agent_key} returned an invalid response.") from exc
    if not isinstance(result.get("reply"), str) or not result["reply"].strip():
        raise AgentError(f"{agent_key} returned no reply.")
    return result