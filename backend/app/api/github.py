"""GitHub repository discovery and import into the project knowledge base."""
import hashlib
import hmac
import json
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from app import database, github_client
from app.config import get_settings
from app.schemas import GitHubImportResult, GitHubRepository, Project

router = APIRouter(prefix="/v1/github", tags=["github"])


@router.get("/oauth/start")
async def oauth_start(owner_id: str = Query(...)) -> RedirectResponse:
    settings = get_settings()
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(status_code=503, detail="GitHub OAuth is not configured")
    state = database.create_github_oauth_state(owner_id)
    return RedirectResponse(github_client.authorization_url(settings.github_client_id, settings.github_oauth_redirect_uri, state))


@router.get("/oauth/callback")
async def oauth_callback(code: str = Query(...), state: str = Query(...)) -> RedirectResponse:
    settings = get_settings()
    owner_id = database.consume_github_oauth_state(state)
    if not owner_id:
        raise HTTPException(status_code=400, detail="Invalid or expired GitHub authorization state")
    try:
        token = github_client.exchange_code(settings.github_client_id, settings.github_client_secret, code, settings.github_oauth_redirect_uri)
        database.set_integration_credential(owner_id, "github", {"token": token})
        database.set_integration_status(owner_id, "github", "connected", "Connected through GitHub OAuth")
    except github_client.GitHubError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return RedirectResponse("https://intelispace.vercel.app/integrations?github=connected")


@router.post("/webhook")
async def webhook(request: Request) -> dict[str, bool]:
    settings = get_settings()
    body = await request.body()
    signature = request.headers.get("x-hub-signature-256", "")
    expected = "sha256=" + hmac.new(settings.github_webhook_secret.encode(), body, hashlib.sha256).hexdigest()
    if not settings.github_webhook_secret or not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid GitHub webhook signature")
    delivery = request.headers.get("x-github-delivery", "")
    if delivery and not database.record_github_delivery(delivery):
        return {"ok": True}
    payload = json.loads(body or b"{}")
    repository = payload.get("repository", {})
    full_name = repository.get("full_name", "")
    project = database.project_by_source_path(f"github://{full_name}") if full_name else None
    if not project:
        return {"ok": True}
    event = request.headers.get("x-github-event", "unknown")
    if event == "push":
        commits = payload.get("commits", [])
        summary = "\n".join(f"- {c.get('id', '')[:7]} {c.get('message', '').splitlines()[0]}" for c in commits[:25]) or "No commit details"
        title = f"{full_name} / push {payload.get('after', '')[:7]}"
        content = f"GitHub push to {payload.get('ref', '')}\n\n{summary}"
    elif event == "deployment":
        deployment = payload.get("deployment", {})
        title = f"{full_name} / deployment {deployment.get('environment', 'unknown')}"
        content = f"GitHub deployment\nEnvironment: {deployment.get('environment', 'unknown')}\nRef: {deployment.get('ref', '')}\nDescription: {deployment.get('description') or 'No description'}"
    else:
        return {"ok": True}
    database.create_context_item(project["id"], "document", title, content, {"source": "github", "repository": full_name, "event": event}, folder="GitHub")
    return {"ok": True}


def _token(owner_id: str) -> str:
    row = database.get_integration_credential(owner_id, "github")
    token = str((row or {}).get("credential", {}).get("token", "")).strip()
    if not token:
        raise HTTPException(status_code=400, detail="Connect GitHub in Integrations first")
    return token


def _repo(data: dict) -> GitHubRepository:
    owner = data.get("owner", {}).get("login", "")
    return GitHubRepository(
        id=int(data["id"]), full_name=data["full_name"], name=data["name"], owner=owner,
        private=bool(data.get("private")), description=data.get("description"),
        default_branch=data.get("default_branch", "main"), html_url=data["html_url"], updated_at=data.get("updated_at"),
    )


@router.get("/repositories", response_model=list[GitHubRepository])
async def repositories(owner_id: str = Query(...)) -> list[GitHubRepository]:
    try:
        return [_repo(item) for item in github_client.list_repositories(_token(owner_id))]
    except github_client.GitHubError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/repositories/{owner}/{name}/import", response_model=GitHubImportResult)
async def import_repository(owner: str, name: str, owner_id: str = Query(...)) -> GitHubImportResult:
    token = _token(owner_id)
    source_path = f"github://{owner}/{name}"
    existing = database.get_project_by_source_path(owner_id, source_path)
    if existing:
        return GitHubImportResult(project=Project(**existing), context_items=0, already_imported=True)
    try:
        data = github_client.get_repository(token, owner, name)
        repo = _repo(data)
        project = database.create_project(
            owner_id, repo.name, repo.description, category="GitHub", tags=["github"], source_path=source_path
        )
        context_items = 0
        readme = github_client.get_readme(token, owner, name)
        if readme:
            path, content = readme
            database.create_context_item(
                project["id"], "document", f"{repo.full_name} / {path}", content,
                {"source": "github", "repository": repo.full_name, "path": path, "html_url": repo.html_url},
                folder="GitHub",
            )
            context_items += 1
        database.create_context_item(
            project["id"], "document", f"{repo.full_name} / repository metadata",
            f"Repository: {repo.full_name}\nDescription: {repo.description or 'No description'}\nDefault branch: {repo.default_branch}\nURL: {repo.html_url}\nLast updated: {repo.updated_at or 'Unknown'}",
            {"source": "github", "repository": repo.full_name, "path": "repository metadata", "html_url": repo.html_url},
            folder="GitHub",
        )
        context_items += 1
        return GitHubImportResult(project=Project(**database.get_project(project["id"])), context_items=context_items)
    except github_client.GitHubError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc