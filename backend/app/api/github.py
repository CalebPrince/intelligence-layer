"""GitHub repository discovery and import into the project knowledge base."""
import hashlib
import hmac
import json
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from app import database, github_client
from app.config import get_settings
from app.schemas import GitHubActionProposal, GitHubActionProposalCreate, GitHubImportResult, GitHubRepository, Project

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


def _repo_parts(project: dict) -> tuple[str, str]:
    source = str(project.get("source_path") or "")
    if not source.startswith("github://") or "/" not in source.removeprefix("github://"):
        raise HTTPException(status_code=400, detail="This project is not linked to GitHub")
    return tuple(source.removeprefix("github://").split("/", 1))  # type: ignore[return-value]


def _execute_proposal(proposal: dict, project: dict, token: str) -> dict:
    owner, name = _repo_parts(project)
    branch = f"inteli-space/{proposal['id'][:8]}"
    result = github_client.commit_files(token, owner, name, branch, proposal["message"], proposal["files"])
    return database.update_github_proposal(proposal["id"], "executed", result["branch"], result["commit_sha"]) or proposal


@router.post("/projects/{project_id}/proposals", response_model=GitHubActionProposal)
async def create_proposal(project_id: str, req: GitHubActionProposalCreate) -> dict:
    project = database.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not req.files or len(req.files) > 50:
        raise HTTPException(status_code=400, detail="Provide between 1 and 50 files")
    mode = req.mode or project.get("github_action_mode", "manual")
    proposal = database.create_github_proposal(project_id, mode, req.message, [f.model_dump() for f in req.files])
    if proposal["mode"] == "auto":
        try:
            return _execute_proposal(proposal, project, _token(project["owner_id"]))
        except github_client.GitHubError as exc:
            database.update_github_proposal(proposal["id"], "failed")
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    return proposal


@router.post("/proposals/{proposal_id}/approve", response_model=GitHubActionProposal)
async def approve_proposal(proposal_id: str) -> dict:
    proposal = database.get_github_proposal(proposal_id)
    if not proposal or proposal["status"] != "pending":
        raise HTTPException(status_code=404, detail="Pending proposal not found")
    project = database.get_project(proposal["project_id"])
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        return _execute_proposal(proposal, project, _token(project["owner_id"]))
    except github_client.GitHubError as exc:
        database.update_github_proposal(proposal_id, "failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/proposals/{proposal_id}/reject", response_model=GitHubActionProposal)
async def reject_proposal(proposal_id: str) -> dict:
    proposal = database.get_github_proposal(proposal_id)
    if not proposal or proposal["status"] != "pending":
        raise HTTPException(status_code=404, detail="Pending proposal not found")
    return database.update_github_proposal(proposal_id, "rejected") or proposal


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
        try:
            repo = _repo(github_client.get_repository(token, owner, name))
            known_paths = database.context_paths_for_source(existing["id"], "github")
            added = 0
            for path, content in github_client.list_text_files(token, owner, name, repo.default_branch):
                if path in known_paths:
                    continue
                database.create_context_item(
                    existing["id"], "document", f"{repo.full_name} / {path}", content,
                    {"source": "github", "repository": repo.full_name, "path": path, "html_url": f"{repo.html_url}/blob/{repo.default_branch}/{path}"},
                    folder="GitHub",
                )
                added += 1
            skipped = github_client.list_skipped_text_files(token, owner, name, repo.default_branch)
            if skipped and "large files manifest" not in known_paths:
                manifest = "These larger text files are available to import on demand:\n\n" + "\n".join(
                    f"- {path} ({size / 1024:.0f} KB)" for path, size in skipped
                )
                database.create_context_item(
                    existing["id"], "document", f"{repo.full_name} / large files available", manifest,
                    {"source": "github", "repository": repo.full_name, "path": "large files manifest", "on_demand": True},
                    folder="GitHub",
                )
                added += 1
            return GitHubImportResult(project=Project(**existing), context_items=added, already_imported=True)
        except github_client.GitHubError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
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
        skipped = github_client.list_skipped_text_files(token, owner, name, repo.default_branch)
        if skipped:
            manifest = "These larger text files are available to import on demand:\n\n" + "\n".join(
                f"- {path} ({size / 1024:.0f} KB)" for path, size in skipped
            )
            database.create_context_item(
                project["id"], "document", f"{repo.full_name} / large files available", manifest,
                {"source": "github", "repository": repo.full_name, "path": "large files manifest", "on_demand": True},
                folder="GitHub",
            )
            context_items += 1
        for path, content in github_client.list_text_files(token, owner, name, repo.default_branch):
            if readme and path == readme[0]:
                continue
            database.create_context_item(
                project["id"], "document", f"{repo.full_name} / {path}", content,
                {"source": "github", "repository": repo.full_name, "path": path, "html_url": f"{repo.html_url}/blob/{repo.default_branch}/{path}"},
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


@router.post("/repositories/{owner}/{name}/file", response_model=GitHubImportResult)
async def import_file(owner: str, name: str, path: str = Query(...), owner_id: str = Query(...)) -> GitHubImportResult:
    token = _token(owner_id)
    project = database.get_project_by_source_path(owner_id, f"github://{owner}/{name}")
    if not project:
        raise HTTPException(status_code=404, detail="Import the repository before importing individual files")
    try:
        repo = _repo(github_client.get_repository(token, owner, name))
        content = github_client.get_file(token, owner, name, path, repo.default_branch)
        database.create_context_item(
            project["id"], "document", f"{repo.full_name} / {path}", content,
            {"source": "github", "repository": repo.full_name, "path": path, "on_demand": True, "html_url": f"{repo.html_url}/blob/{repo.default_branch}/{path}"},
            folder="GitHub",
        )
        return GitHubImportResult(project=Project(**project), context_items=1, already_imported=True)
    except github_client.GitHubError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc