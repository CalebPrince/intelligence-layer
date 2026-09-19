"""FastAPI entry point."""
import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import database, import_service
from app.api.agents import router as agents_router
from app.api.analytics import router as analytics_router
from app.api.chat import router as chat_router
from app.api.context import router as context_router
from app.api.credits import router as credits_router
from app.api.dashboard import router as dashboard_router
from app.api.decisions import router as decisions_router
from app.api.imports import router as imports_router
from app.api.integrations import router as integrations_router
from app.api.library import router as library_router
from app.api.insights import router as insights_router
from app.api.github import router as github_router
from app.api.milestones import router as milestones_router
from app.api.projects import router as projects_router
from app.api.settings_api import router as settings_router
from app.api.watch import router as watch_router
from app.config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db()  # creates tables on first run — no separate migration step for SQLite
    scanner = asyncio.create_task(import_service.watch_loop(settings.watch_interval_seconds))
    try:
        yield
    finally:
        scanner.cancel()
        with suppress(asyncio.CancelledError):
            await scanner


app = FastAPI(title="Model-Agnostic Layer", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_router)
app.include_router(analytics_router)
app.include_router(chat_router)
app.include_router(context_router)
app.include_router(credits_router)
app.include_router(dashboard_router)
app.include_router(decisions_router)
app.include_router(imports_router)
app.include_router(integrations_router)
app.include_router(library_router)
app.include_router(insights_router)
app.include_router(github_router)
app.include_router(milestones_router)
app.include_router(projects_router)
app.include_router(settings_router)
app.include_router(watch_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "environment": settings.environment}
