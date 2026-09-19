"""The third-party integrations catalog: what credential fields each service
needs, and a live "does this actually work" check for the ones with a simple
token/key auth scheme. Real functionality beyond the connection check (e.g.
actually syncing files from Google Drive) is not built yet — see the README's
Known gaps; this module only answers "is this service reachable with what was
pasted in," the same question app/credits.py answers for the LLM providers.
"""
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

import httpx

TIMEOUT = 8.0


@dataclass
class Field:
    key: str
    label: str
    secret: bool = True  # masked in the UI once saved


@dataclass
class Integration:
    key: str
    name: str
    category: str
    fields: list[Field]
    # None means there is no live check yet (needs an OAuth app that isn't
    # registered, or the service has no "who am I" endpoint to call) —
    # the credential is stored but status stays "unknown".
    test: Optional[Callable[[dict[str, str]], tuple[bool, str]]] = field(default=None)


def _get(url: str, headers: dict[str, str]) -> httpx.Response:
    return httpx.get(url, headers=headers, timeout=TIMEOUT)


def _ok(r: httpx.Response) -> bool:
    return r.status_code < 300


def _test_github(c: dict[str, str]) -> tuple[bool, str]:
    r = _get("https://api.github.com/user", {"Authorization": f"Bearer {c.get('token', '')}"})
    return (True, f"Connected as {r.json().get('login')}") if _ok(r) else (False, f"GitHub rejected the token ({r.status_code})")


def _test_notion(c: dict[str, str]) -> tuple[bool, str]:
    r = _get(
        "https://api.notion.com/v1/users/me",
        {"Authorization": f"Bearer {c.get('token', '')}", "Notion-Version": "2022-06-28"},
    )
    return (True, "Integration token is valid") if _ok(r) else (False, f"Notion rejected the token ({r.status_code})")


def _test_slack(c: dict[str, str]) -> tuple[bool, str]:
    r = httpx.post(
        "https://slack.com/api/auth.test", headers={"Authorization": f"Bearer {c.get('bot_token', '')}"}, timeout=TIMEOUT
    )
    data = r.json()
    return (True, f"Connected to {data.get('team', 'workspace')}") if data.get("ok") else (False, data.get("error", "Slack rejected the token"))


def _test_figma(c: dict[str, str]) -> tuple[bool, str]:
    r = _get("https://api.figma.com/v1/me", {"X-Figma-Token": c.get("token", "")})
    return (True, f"Connected as {r.json().get('email', 'you')}") if _ok(r) else (False, f"Figma rejected the token ({r.status_code})")


def _test_linear(c: dict[str, str]) -> tuple[bool, str]:
    r = httpx.post(
        "https://api.linear.app/graphql",
        headers={"Authorization": c.get("api_key", ""), "Content-Type": "application/json"},
        json={"query": "{ viewer { name } }"},
        timeout=TIMEOUT,
    )
    data = r.json() if _ok(r) else {}
    name = data.get("data", {}).get("viewer", {}).get("name")
    return (True, f"Connected as {name}") if name else (False, "Linear rejected the API key")


def _test_airtable(c: dict[str, str]) -> tuple[bool, str]:
    r = _get("https://api.airtable.com/v0/meta/whoami", {"Authorization": f"Bearer {c.get('token', '')}"})
    return (True, "Personal access token is valid") if _ok(r) else (False, f"Airtable rejected the token ({r.status_code})")


def _test_trello(c: dict[str, str]) -> tuple[bool, str]:
    r = httpx.get(
        "https://api.trello.com/1/members/me",
        params={"key": c.get("key", ""), "token": c.get("token", "")},
        timeout=TIMEOUT,
    )
    return (True, f"Connected as {r.json().get('username')}") if _ok(r) else (False, f"Trello rejected the key/token ({r.status_code})")


def _test_stripe(c: dict[str, str]) -> tuple[bool, str]:
    r = _get("https://api.stripe.com/v1/account", {"Authorization": f"Bearer {c.get('secret_key', '')}"})
    return (True, "Secret key is valid") if _ok(r) else (False, f"Stripe rejected the key ({r.status_code})")


def _test_telegram(c: dict[str, str]) -> tuple[bool, str]:
    r = httpx.get(f"https://api.telegram.org/bot{c.get('bot_token', '')}/getMe", timeout=TIMEOUT)
    data = r.json() if r.status_code < 500 else {}
    return (True, f"Bot: @{data.get('result', {}).get('username')}") if data.get("ok") else (False, "Telegram rejected the bot token")


def _test_jira(c: dict[str, str]) -> tuple[bool, str]:
    domain = (c.get("domain") or "").strip().rstrip("/")
    r = httpx.get(
        f"https://{domain}/rest/api/3/myself",
        auth=(c.get("email", ""), c.get("api_token", "")),
        timeout=TIMEOUT,
    )
    return (True, f"Connected as {r.json().get('displayName')}") if _ok(r) else (False, f"Jira rejected the credentials ({r.status_code})")


def _test_supabase(c: dict[str, str]) -> tuple[bool, str]:
    url = (c.get("project_url") or "").strip().rstrip("/")
    key = c.get("service_key", "")
    r = _get(f"{url}/rest/v1/", {"apikey": key, "Authorization": f"Bearer {key}"})
    return (True, "Project is reachable") if r.status_code < 500 else (False, f"Supabase project rejected the key ({r.status_code})")


def _test_dropbox(c: dict[str, str]) -> tuple[bool, str]:
    r = httpx.post(
        "https://api.dropboxapi.com/2/users/get_current_account",
        headers={"Authorization": f"Bearer {c.get('access_token', '')}"},
        timeout=TIMEOUT,
    )
    return (True, f"Connected as {r.json().get('name', {}).get('display_name')}") if _ok(r) else (False, f"Dropbox rejected the token ({r.status_code})")


def _test_custom_api(c: dict[str, str]) -> tuple[bool, str]:
    url = (c.get("base_url") or "").strip()
    if not url:
        return False, "No base URL to test"
    headers = {c["header_name"]: c["header_value"]} if c.get("header_name") and c.get("header_value") else {}
    try:
        r = _get(url, headers)
    except httpx.HTTPError as exc:
        return False, f"Could not reach {url}: {exc}"
    return (r.status_code < 500, f"{url} responded {r.status_code}")


CATALOG: dict[str, Integration] = {
    i.key: i
    for i in [
        Integration("github", "GitHub", "Development", [Field("token", "Personal access token")], _test_github),
        Integration("notion", "Notion", "Productivity", [Field("token", "Integration secret")], _test_notion),
        Integration("slack", "Slack", "Communication", [Field("bot_token", "Bot token (xoxb-...)")], _test_slack),
        Integration("figma", "Figma", "Development", [Field("token", "Personal access token")], _test_figma),
        Integration("linear", "Linear", "Development", [Field("api_key", "API key")], _test_linear),
        Integration("airtable", "Airtable", "Data", [Field("token", "Personal access token")], _test_airtable),
        Integration("trello", "Trello", "Productivity", [Field("key", "API key", False), Field("token", "Token")], _test_trello),
        Integration("stripe", "Stripe", "Data", [Field("secret_key", "Secret key")], _test_stripe),
        Integration("telegram", "Telegram", "Communication", [Field("bot_token", "Bot token")], _test_telegram),
        Integration(
            "jira", "Jira", "Development",
            [Field("domain", "Site domain (e.g. you.atlassian.net)", False), Field("email", "Account email", False), Field("api_token", "API token")],
            _test_jira,
        ),
        Integration(
            "supabase", "Supabase", "Data",
            [Field("project_url", "Project URL", False), Field("service_key", "Service role key")],
            _test_supabase,
        ),
        Integration("dropbox", "Dropbox", "Productivity", [Field("access_token", "Access token")], _test_dropbox),
        # No live check yet — each needs an OAuth app this project hasn't registered.
        Integration("google_drive", "Google Drive", "Productivity", [Field("access_token", "OAuth access token")]),
        Integration("zapier", "Zapier", "Automation", [Field("webhook_url", "Zap webhook URL", False)]),
        Integration("webhooks", "Webhooks", "Automation", [Field("target_url", "Target URL", False)]),
        Integration(
            "custom_api", "Custom API", "Other",
            [Field("base_url", "Base URL", False), Field("header_name", "Auth header name", False), Field("header_value", "Auth header value")],
            _test_custom_api,
        ),
    ]
}


def test_connection(service: str, credential: dict[str, Any]) -> tuple[bool, str]:
    integration = CATALOG.get(service)
    if not integration:
        return False, "Unknown service"
    if not integration.test:
        return False, "This integration has no live check yet — it needs an OAuth app to be registered first."
    try:
        return integration.test(credential)
    except httpx.HTTPError as exc:
        return False, f"Could not reach {integration.name}: {exc}"
    except Exception:  # noqa: BLE001 - never let a bad response shape 500 the request
        return False, f"{integration.name} returned something unexpected"
