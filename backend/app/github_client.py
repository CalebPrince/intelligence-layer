"""Small GitHub API client for repository discovery and context import."""
import base64
import urllib.parse
from typing import Any

import httpx

API = "https://api.github.com"
MAX_FILE_BYTES = 500_000
ON_DEMAND_MAX_FILE_BYTES = 5_000_000
MAX_FILES = 250
SKIP_PARTS = {".git", "node_modules", ".next", "dist", "build", "vendor", "coverage"}
TEXT_EXTENSIONS = {
    ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".ini", ".env.example",
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".php", ".java",
    ".go", ".rs", ".rb", ".cs", ".cpp", ".c", ".h", ".css", ".scss", ".html",
    ".vue", ".svelte", ".sql", ".sh", ".ps1", ".xml", ".graphql", ".env",
}


class GitHubError(Exception):
    pass


def _headers(token: str) -> dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _request(token: str, path: str, params: dict[str, Any] | None = None) -> Any:
    try:
        response = httpx.get(f"{API}{path}", headers=_headers(token), params=params, timeout=15.0)
    except httpx.HTTPError as exc:
        raise GitHubError(f"GitHub could not be reached: {exc}") from exc
    if response.status_code >= 400:
        detail = response.json().get("message", "GitHub rejected the request") if response.content else "GitHub rejected the request"
        raise GitHubError(f"{detail} ({response.status_code})")
    return response.json()


def _write(token: str, method: str, path: str, payload: dict[str, Any]) -> Any:
    try:
        response = httpx.request(method, f"{API}{path}", headers=_headers(token), json=payload, timeout=20.0)
    except httpx.HTTPError as exc:
        raise GitHubError(f"GitHub could not be reached: {exc}") from exc
    if response.status_code >= 400:
        detail = response.json().get("message", "GitHub rejected the write") if response.content else "GitHub rejected the write"
        raise GitHubError(f"{detail} ({response.status_code})")
    return response.json()


def list_repositories(token: str) -> list[dict[str, Any]]:
    data = _request(token, "/user/repos", {"per_page": 100, "sort": "updated", "affiliation": "owner,collaborator,organization_member"})
    return data if isinstance(data, list) else []


def get_repository(token: str, owner: str, name: str) -> dict[str, Any]:
    data = _request(token, f"/repos/{owner}/{name}")
    if not isinstance(data, dict):
        raise GitHubError("GitHub returned an invalid repository")
    return data


def get_readme(token: str, owner: str, name: str) -> tuple[str, str] | None:
    try:
        data = _request(token, f"/repos/{owner}/{name}/readme")
    except GitHubError as exc:
        if "(404)" in str(exc):
            return None
        raise
    content = data.get("content") if isinstance(data, dict) else None
    path = data.get("path", "README.md") if isinstance(data, dict) else "README.md"
    if not content:
        return None
    return path, base64.b64decode(content).decode("utf-8", errors="replace")


def list_text_files(token: str, owner: str, name: str, branch: str) -> list[tuple[str, str]]:
    tree = _request(token, f"/repos/{owner}/{name}/git/trees/{branch}", {"recursive": "1"})
    entries = tree.get("tree", []) if isinstance(tree, dict) else []
    files: list[tuple[str, str]] = []
    for entry in entries:
        path = str(entry.get("path", ""))
        if entry.get("type") != "blob" or int(entry.get("size", 0) or 0) > MAX_FILE_BYTES:
            continue
        parts = set(path.split("/"))
        suffix = "." + path.rsplit(".", 1)[-1].lower() if "." in path.rsplit("/", 1)[-1] else ""
        if parts & SKIP_PARTS or suffix not in TEXT_EXTENSIONS:
            continue
        try:
            blob = _request(token, f"/repos/{owner}/{name}/git/blobs/{entry['sha']}")
            content = base64.b64decode(blob.get("content", "")).decode("utf-8", errors="replace")
        except (KeyError, ValueError, UnicodeError):
            continue
        files.append((path, content))
        if len(files) >= MAX_FILES:
            break
    return files


def list_skipped_text_files(token: str, owner: str, name: str, branch: str) -> list[tuple[str, int]]:
    tree = _request(token, f"/repos/{owner}/{name}/git/trees/{branch}", {"recursive": "1"})
    entries = tree.get("tree", []) if isinstance(tree, dict) else []
    skipped: list[tuple[str, int]] = []
    for entry in entries:
        path = str(entry.get("path", ""))
        size = int(entry.get("size", 0) or 0)
        suffix = "." + path.rsplit(".", 1)[-1].lower() if "." in path.rsplit("/", 1)[-1] else ""
        if entry.get("type") == "blob" and size > MAX_FILE_BYTES and size <= ON_DEMAND_MAX_FILE_BYTES and suffix in TEXT_EXTENSIONS and not (set(path.split("/")) & SKIP_PARTS):
            skipped.append((path, size))
    return skipped


def get_file(token: str, owner: str, name: str, path: str, branch: str) -> str:
    data = _request(token, f"/repos/{owner}/{name}/contents/{path}", {"ref": branch})
    size = int(data.get("size", 0) or 0)
    if size > ON_DEMAND_MAX_FILE_BYTES:
        raise GitHubError("That file is larger than the 5 MB on-demand limit")
    try:
        return base64.b64decode(data.get("content", "")).decode("utf-8", errors="replace")
    except (ValueError, UnicodeError) as exc:
        raise GitHubError("GitHub returned a file that cannot be read as text") from exc


def authorization_url(client_id: str, redirect_uri: str, state: str) -> str:
    query = urllib.parse.urlencode({"client_id": client_id, "redirect_uri": redirect_uri, "scope": "repo read:user", "state": state})
    return f"https://github.com/login/oauth/authorize?{query}"


def exchange_code(client_id: str, client_secret: str, code: str, redirect_uri: str) -> str:
    try:
        response = httpx.post("https://github.com/login/oauth/access_token", data={"client_id": client_id, "client_secret": client_secret, "code": code, "redirect_uri": redirect_uri}, headers={"Accept": "application/json"}, timeout=15.0)
    except httpx.HTTPError as exc:
        raise GitHubError(f"GitHub authorization failed: {exc}") from exc
    if response.status_code >= 400:
        raise GitHubError("GitHub authorization was rejected")
    token = response.json().get("access_token")
    if not token:
        raise GitHubError("GitHub returned no access token")
    return str(token)


def commit_files(token: str, owner: str, name: str, branch: str, message: str, files: list[dict[str, str]]) -> dict[str, str]:
    repo = get_repository(token, owner, name)
    default_branch = repo.get("default_branch", "main")
    ref = _request(token, f"/repos/{owner}/{name}/git/ref/heads/{default_branch}")
    base_sha = ref["object"]["sha"]
    base_commit = _request(token, f"/repos/{owner}/{name}/git/commits/{base_sha}")
    entries = []
    for file in files:
        blob = _write(token, "POST", f"/repos/{owner}/{name}/git/blobs", {"content": file["content"], "encoding": "utf-8"})
        entries.append({"path": file["path"], "mode": "100644", "type": "blob", "sha": blob["sha"]})
    tree = _write(token, "POST", f"/repos/{owner}/{name}/git/trees", {"base_tree": base_commit["tree"]["sha"], "tree": entries})
    commit = _write(token, "POST", f"/repos/{owner}/{name}/git/commits", {"message": message, "tree": tree["sha"], "parents": [base_sha]})
    _write(token, "POST", f"/repos/{owner}/{name}/git/refs", {"ref": f"refs/heads/{branch}", "sha": commit["sha"]})
    return {"branch": branch, "commit_sha": commit["sha"], "html_url": f"https://github.com/{owner}/{name}/tree/{branch}"}