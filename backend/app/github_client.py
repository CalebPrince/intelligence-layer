"""Small GitHub API client for repository discovery and context import."""
import base64
import urllib.parse
from typing import Any

import httpx

API = "https://api.github.com"


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