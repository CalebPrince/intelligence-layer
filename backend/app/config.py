"""App settings and the static model registry.

The registry is the source of truth router.py scores against. Seeding it here
(rather than only in the DB) means routing works before the database has any
rows; `database.py` can still overlay live rows (latency, availability) on top.
"""
from enum import Enum
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent  # .../backend


class RoutingMode(str, Enum):
    """The three operating modes. There is no separate 'fallback' mode —
    SINGLE always walks its ranked candidate list until one succeeds, so
    resilience is a property of SINGLE rather than a mode of its own."""

    SINGLE = "single"  # router picks one model for the task
    PARALLEL = "parallel"  # Claude + GPT + Gemini answer independently
    DELIBERATION = "deliberation"  # parallel, then models critique each other, then synthesis


class Capability(str, Enum):
    """What callers ask for. The router never takes a provider or model name —
    only capabilities — so adding a provider later is a config.py change, not
    a frontend or API change."""

    REASONING = "reasoning"
    CODING = "coding"
    RESEARCH = "research"
    FAST = "fast"
    CHEAP = "cheap"
    LONG_CONTEXT = "long_context"
    VISION = "vision"
    FUNCTION_CALLING = "function_calling"


class ModelSpec(BaseModel):
    id: str  # litellm-routable id, e.g. "anthropic/claude-sonnet-5"
    provider: str
    display_name: str
    context_window: int
    cost_per_1k_input: float
    cost_per_1k_output: float
    capabilities: list[Capability]
    speed_tier: int  # 1 = fastest, 3 = slowest
    is_active: bool = True


# Seed registry — mirrors the three "perspectives" in the product concept
# (ChatGPT / Claude / Gemini). Extend or move to the model_registry table
# (app/schema.sql) once you want this editable without a deploy. Adding a
# fourth provider here is the *only* change adding it requires — router.py,
# the API, and the frontend all speak capabilities, never provider names.
#
# Claude/GPT are marked is_active=False until ANTHROPIC_API_KEY /
# OPENAI_API_KEY are funded — select_models() filters inactive models out,
# so routing just runs against whatever's left (currently Gemini only) and
# never has to know why the others aren't available. Flip these back to
# True once you add pay-as-you-go credit for those providers.
MODEL_REGISTRY: list[ModelSpec] = [
    ModelSpec(
        id="anthropic/claude-sonnet-5",
        provider="anthropic",
        display_name="Claude Sonnet 5",
        context_window=200_000,
        cost_per_1k_input=0.003,
        cost_per_1k_output=0.015,
        capabilities=[
            Capability.REASONING,
            Capability.CODING,
            Capability.RESEARCH,
            Capability.LONG_CONTEXT,
            Capability.FUNCTION_CALLING,
        ],
        speed_tier=2,
        is_active=False,
    ),
    ModelSpec(
        id="anthropic/claude-fable-5-1",
        provider="anthropic",
        display_name="Claude Fable 5.1",
        context_window=200_000,
        cost_per_1k_input=0.0008,
        cost_per_1k_output=0.004,
        capabilities=[Capability.FAST, Capability.CHEAP, Capability.CODING],
        speed_tier=1,
        is_active=False,
    ),
    ModelSpec(
        id="openai/gpt-5",
        provider="openai",
        display_name="ChatGPT (GPT-5)",
        context_window=128_000,
        cost_per_1k_input=0.005,
        cost_per_1k_output=0.015,
        capabilities=[
            Capability.REASONING,
            Capability.CODING,
            Capability.RESEARCH,
            Capability.VISION,
            Capability.FUNCTION_CALLING,
        ],
        speed_tier=2,
        is_active=False,
    ),
    # "-pro" tiers have a hard 0-request free quota (confirmed live against
    # the API: RESOURCE_EXHAUSTED with limit=0 even with billing off). Only
    # "-flash" tiers get real free-tier quota, so that's what's active here;
    # flip to a "-pro" model once billing is enabled on the Google Cloud
    # project behind GEMINI_API_KEY.
    ModelSpec(
        id="gemini/gemini-flash-latest",
        provider="gemini",
        display_name="Gemini Flash",
        context_window=1_000_000,
        cost_per_1k_input=0.0003,
        cost_per_1k_output=0.0025,
        capabilities=[
            Capability.LONG_CONTEXT,
            Capability.VISION,
            Capability.FAST,
            Capability.CHEAP,
        ],
        speed_tier=1,
    ),
]


class Settings(BaseSettings):
    # Absolute path, not ".env" — a relative path resolves against the
    # process cwd, which depends on how uvicorn was launched (see
    # .claude/launch.json) and is not reliably this backend/ directory.
    model_config = SettingsConfigDict(env_file=str(BACKEND_DIR / ".env"), extra="ignore")

    environment: str = "development"
    # How often watched project folders are re-scanned for new sub-folders.
    watch_interval_seconds: int = 30
    cors_origins: str = "http://localhost:3000"

    # Resolved relative to this file's location, not the process cwd — uvicorn's
    # cwd depends on how it's launched (see .claude/launch.json's --app-dir).
    sqlite_path: str = str(BACKEND_DIR / "data" / "app.db")

    @field_validator("sqlite_path", mode="before")
    @classmethod
    def _default_sqlite_path_when_blank(cls, v: str | None) -> str | None:
        # An empty SQLITE_PATH= line in .env (e.g. copied from .env.example)
        # should mean "use the default," not "open a database at no path."
        return v or str(BACKEND_DIR / "data" / "app.db")

    openai_api_key: str = ""
    anthropic_api_key: str = ""
    anthropic_workspace_id: str = ""
    gemini_api_key: str = ""

    # prince-web-app's public agent API (no auth) — see app/sage_client.py.
    # Overridable for pointing at a local/staging copy instead of production.
    prince_web_app_url: str = "https://princecaleb.dev"
    # Admin bearer token for the authenticated agent chat endpoints. Keep this
    # empty until the operator explicitly configures a prince-web-app token.
    prince_web_app_admin_token: str = ""
    shared_memory_token: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    github_oauth_redirect_uri: str = "https://intelligence-layer-production-2d12.up.railway.app/v1/github/oauth/callback"
    github_webhook_secret: str = ""

    default_routing_mode: RoutingMode = RoutingMode.SINGLE
    default_parallel_models: list[str] = [
        "anthropic/claude-sonnet-5",
        "openai/gpt-5",
        "gemini/gemini-flash-latest",
    ]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def _apply_key_activation() -> None:
    """A model is active when its provider's key is set. (The flags above are
    only the fallback for a provider whose key is missing.)"""
    settings = get_settings()
    keys = {
        "openai": settings.openai_api_key,
        "anthropic": settings.anthropic_api_key,
        "gemini": settings.gemini_api_key,
    }
    for model in MODEL_REGISTRY:
        if keys.get(model.provider):
            model.is_active = True


_apply_key_activation()
