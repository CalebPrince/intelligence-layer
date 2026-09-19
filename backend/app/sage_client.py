"""Client for prince-web-app's real, public Sage agent — the same
"marketing-brain" chatbot at princecaleb.dev/marketing-brain.html, not a
lookalike. No auth: the route is public and rate-limited by prince-web-app
itself (20 requests/hour, keyed by this server's IP — shared across every
conversation this backend proxies, since prince-web-app can't tell them
apart). Memory lives in prince-web-app's own `sage_chats` table, keyed by
the `token` it returns; this client's job is only to replay the transcript
and carry that token, exactly like prince-web-app's own frontend does.
"""
from typing import Any, Optional

import httpx

from app.config import get_settings

MAX_MESSAGE_CHARS = 1000  # matches SageController's own limit; fail fast instead of a round trip


class SageError(Exception):
    """Raised with a message safe to show the user (rate limited, upstream down, etc.)."""


def chat(message: str, transcript: list[dict[str, str]], token: Optional[str]) -> dict[str, Any]:
    """One turn. `transcript` is every PRIOR turn only (`{"role": "user"|"agent", "text": ...}`)
    — the new `message` must not already be in it; Sage's own API appends it.
    Returns {"reply": str, "token": str} — save the token to keep the same
    prince-web-app conversation (and its real memory) on the next turn."""
    if len(message) > MAX_MESSAGE_CHARS:
        raise SageError(f"That message is too long for Sage ({len(message)} chars, {MAX_MESSAGE_CHARS} max).")

    url = f"{get_settings().prince_web_app_url}/api/v1/agents/sage/chat"
    body: dict[str, Any] = {"message": message, "transcript": transcript}
    if token:
        body["token"] = token

    try:
        r = httpx.post(url, json=body, timeout=30.0)
    except httpx.HTTPError as exc:
        raise SageError(f"Could not reach Sage: {exc}") from exc

    if r.status_code == 429:
        raise SageError("Sage is rate-limited right now (prince-web-app allows 20 messages/hour from this server). Try again shortly.")
    if r.status_code >= 400:
        detail = None
        try:
            detail = r.json().get("error") or r.json().get("detail")
        except ValueError:
            pass
        raise SageError(detail or f"Sage returned an error ({r.status_code}).")

    data = r.json()
    if "reply" not in data or "token" not in data:
        raise SageError("Sage returned an unexpected response.")
    return data
