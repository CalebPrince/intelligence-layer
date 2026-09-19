"""Credit tracking and live API-key checks.

Providers do not let an ordinary API key read a remaining balance (OpenAI and
Anthropic only report spend, through separate admin keys; Gemini has no balance
endpoint). So "remaining" here is an estimate: the amount you entered as loaded
for a provider, minus the cost this app has logged for that provider since then.
Key status, on the other hand, is checked live against each provider.
"""
import time
from typing import Any, Optional

import httpx

from app import database
from app.config import get_settings

PROVIDERS = [
    ("openai", "ChatGPT"),
    ("anthropic", "Claude"),
    ("gemini", "Gemini"),
]

_CACHE_SECONDS = 60
_status_cache: dict[str, tuple[float, str]] = {}


def _key(provider: str) -> str:
    s = get_settings()
    return {"openai": s.openai_api_key, "anthropic": s.anthropic_api_key, "gemini": s.gemini_api_key}.get(provider, "") or ""


def _check(provider: str, key: str) -> str:
    """valid | invalid | unreachable. One cheap read-only request; the key only
    travels in a header (never in a URL, so it cannot end up in logs)."""
    try:
        if provider == "openai":
            r = httpx.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {key}"}, timeout=6)
        elif provider == "anthropic":
            r = httpx.get(
                "https://api.anthropic.com/v1/models",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                timeout=6,
            )
        else:
            r = httpx.get(
                "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
                headers={"x-goog-api-key": key},
                timeout=6,
            )
    except httpx.HTTPError:
        return "unreachable"
    if r.status_code in (401, 403) or (provider == "gemini" and r.status_code == 400):
        return "invalid"
    if r.status_code < 500:
        return "valid"  # includes 429: the key works, it is just rate limited
    return "unreachable"


def key_status(provider: str) -> str:
    key = _key(provider)
    if not key:
        return "missing"
    cached = _status_cache.get(provider)
    if cached and time.time() - cached[0] < _CACHE_SECONDS:
        return cached[1]
    status = _check(provider, key)
    _status_cache[provider] = (time.time(), status)
    return status


def summary() -> dict[str, Any]:
    balances = {b["provider"]: b for b in database.list_credit_accounts()}
    rows = []
    total_balance = total_spent = total_remaining = 0.0
    for provider, label in PROVIDERS:
        acct = balances.get(provider)
        spent: Optional[float] = None
        remaining: Optional[float] = None
        if acct:
            spent = database.spend_since(provider, acct["set_at"])
            remaining = acct["balance_usd"] - spent
            total_balance += acct["balance_usd"]
            total_spent += spent
            total_remaining += remaining
        rows.append(
            {
                "provider": provider,
                "label": label,
                "key_status": key_status(provider),
                "balance_usd": acct["balance_usd"] if acct else None,
                "set_at": acct["set_at"] if acct else None,
                "spent_usd": spent,
                "remaining_usd": remaining,
            }
        )
    tracked = sum(1 for r in rows if r["balance_usd"] is not None)
    return {
        "providers": rows,
        "total_balance_usd": total_balance if tracked else None,
        "total_spent_usd": total_spent if tracked else None,
        "total_remaining_usd": total_remaining if tracked else None,
        "tracked_providers": tracked,
        "lifetime_spend_usd": database.spend_since(None, None),
    }
