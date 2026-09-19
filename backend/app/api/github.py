"""GitHub repository discovery and import into the project knowledge base."""
from fastapi import APIRouter, HTTPException, Query

from app import database, github_client
from app.schemas import GitHubImportResult, GitHubRepository, Project

router = APIRouter(prefix="/v1/github", tags=["github"])


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