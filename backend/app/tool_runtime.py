"""Project-scoped skills, local tools, MCP discovery, and bounded execution."""
import json
import re
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

import httpx

from app import agent_client, database

ToolHandler = Callable[[dict[str, Any]], Awaitable[Any]]
DEFAULT_TOOLS = {"search_project_context", "list_project_context", "read_context_item", "delegate_to_agent"}


@dataclass
class RuntimeTool:
    definition: dict[str, Any]
    handler: ToolHandler


def select_skills(project_id: str, query: str, limit: int = 4) -> list[dict[str, Any]]:
    """Cheap progressive disclosure: select skill instructions by word overlap."""
    skills = database.list_project_skills(project_id, enabled_only=True)
    slash = re.match(r"^\s*/([a-z0-9][a-z0-9_-]*)\b", query.lower())
    if slash:
        command = slash.group(1)
        exact = [skill for skill in skills if skill["name"].lower().replace(" ", "-") == command]
        if exact:
            return exact[:1]
    words = set(re.findall(r"[a-z0-9_-]{3,}", query.lower()))
    ranked = []
    for skill in skills:
        summary = f'{skill["name"]} {skill["description"]}'.lower()
        score = sum(1 for word in words if word in summary)
        if score or skill["name"].lower() in query.lower():
            ranked.append((score, skill))
    return [skill for _, skill in sorted(ranked, key=lambda item: (-item[0], item[1]["name"]))[:limit]]


def skill_prompt(skills: list[dict[str, Any]]) -> str:
    if not skills:
        return ""
    blocks = [f'## Skill: {skill["name"]}\n{skill["instructions"]}' for skill in skills]
    return "Selected project skills:\n\n" + "\n\n".join(blocks)


async def _mcp_request(connection: dict[str, Any], method: str, params: dict[str, Any]) -> dict[str, Any]:
    headers = {"Accept": "application/json, text/event-stream", **connection.get("headers", {})}

    def decode(response: httpx.Response) -> dict[str, Any]:
        if "text/event-stream" in response.headers.get("content-type", ""):
            data_lines = [line[6:] for line in response.text.splitlines() if line.startswith("data: ")]
            if not data_lines:
                raise RuntimeError("MCP server returned no event data")
            return json.loads(data_lines[-1])
        return response.json()

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        initialized = await client.post(connection["url"], json={
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "inteli-space", "version": "0.1.0"}},
        }, headers=headers)
        initialized.raise_for_status()
        decode(initialized)
        session_id = initialized.headers.get("mcp-session-id")
        if session_id:
            headers["mcp-session-id"] = session_id
        ready = await client.post(connection["url"], json={"jsonrpc": "2.0", "method": "notifications/initialized"}, headers=headers)
        ready.raise_for_status()
        response = await client.post(connection["url"], json={"jsonrpc": "2.0", "id": 2, "method": method, "params": params}, headers=headers)
        response.raise_for_status()
        return decode(response)


async def build_tools(project_id: str, query: str) -> tuple[list[RuntimeTool], list[dict[str, Any]]]:
    skills = select_skills(project_id, query)
    allowed = set(DEFAULT_TOOLS)
    for skill in skills:
        allowed.update(skill.get("tool_names", []))

    async def search_context(args: dict[str, Any]) -> Any:
        terms = set(re.findall(r"[a-z0-9_-]{2,}", str(args.get("query", "")).lower()))
        matches = []
        for item in database.get_project_context(project_id, limit=500):
            haystack = f'{item["title"]} {item["content"]}'.lower()
            score = sum(haystack.count(term) for term in terms)
            if score:
                matches.append((score, {"id": item["id"], "title": item["title"], "type": item["type"], "excerpt": item["content"][:1200]}))
        return [value for _, value in sorted(matches, key=lambda row: -row[0])[:10]]

    async def list_context(args: dict[str, Any]) -> Any:
        return [{"id": item["id"], "title": item["title"], "type": item["type"], "folder": item.get("folder")}
                for item in database.get_project_context(project_id, limit=min(int(args.get("limit", 50)), 100))]

    async def read_context(args: dict[str, Any]) -> Any:
        wanted = str(args.get("context_id", ""))
        item = next((item for item in database.get_project_context(project_id, limit=500) if item["id"] == wanted), None)
        if not item:
            raise ValueError("Context item not found in this project")
        return {"id": item["id"], "title": item["title"], "type": item["type"], "content": item["content"]}

    async def delegate(args: dict[str, Any]) -> Any:
        agent_key = str(args.get("agent_key", "")).lower()
        if agent_key not in {"lisa", "content", "beacon", "dossier", "nurturer", "proposal", "arch", "ada", "chief", "sketch", "scout", "radar", "reel", "chloe", "wendy", "allie"}:
            raise ValueError("Unknown or disallowed agent")
        import asyncio
        return await asyncio.to_thread(agent_client.chat, agent_key, str(args.get("task", "")), [])

    local = {
        "search_project_context": RuntimeTool({"type": "function", "function": {"name": "search_project_context", "description": "Search the current project's context library.", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"], "additionalProperties": False}}}, search_context),
        "list_project_context": RuntimeTool({"type": "function", "function": {"name": "list_project_context", "description": "List context items available in the current project.", "parameters": {"type": "object", "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 100}}, "additionalProperties": False}}}, list_context),
        "read_context_item": RuntimeTool({"type": "function", "function": {"name": "read_context_item", "description": "Read one project context item by ID.", "parameters": {"type": "object", "properties": {"context_id": {"type": "string"}}, "required": ["context_id"], "additionalProperties": False}}}, read_context),
        "delegate_to_agent": RuntimeTool({"type": "function", "function": {"name": "delegate_to_agent", "description": "Ask one specialist agent to perform a bounded subtask and return its answer.", "parameters": {"type": "object", "properties": {"agent_key": {"type": "string"}, "task": {"type": "string"}}, "required": ["agent_key", "task"], "additionalProperties": False}}}, delegate),
    }
    tools = [tool for name, tool in local.items() if name in allowed]

    for connection in database.list_mcp_connections(project_id, include_headers=True):
        if not connection["is_enabled"]:
            continue
        try:
            listed = await _mcp_request(connection, "tools/list", {})
            remote_tools = listed.get("result", {}).get("tools", [])
        except Exception:
            continue
        allowlist = set(connection.get("allowed_tools", []))
        for remote in remote_tools:
            remote_name = str(remote.get("name", ""))
            if not remote_name or (allowlist and remote_name not in allowlist):
                continue
            exposed_name = f'mcp__{connection["name"]}__{remote_name}'.replace("-", "_")

            async def call_mcp(args: dict[str, Any], conn=connection, name=remote_name) -> Any:
                response = await _mcp_request(conn, "tools/call", {"name": name, "arguments": args})
                if "error" in response:
                    raise RuntimeError(str(response["error"]))
                return response.get("result", {})

            tools.append(RuntimeTool({"type": "function", "function": {"name": exposed_name, "description": f'MCP {connection["name"]}: {remote.get("description", remote_name)}', "parameters": remote.get("inputSchema", {"type": "object", "properties": {}})}}, call_mcp))
    return tools, skills


async def execute_tool(project_id: str, model_id: str, tool: RuntimeTool, arguments: dict[str, Any]) -> str:
    name = tool.definition["function"]["name"]
    try:
        result = await tool.handler(arguments)
        output = json.dumps(result, ensure_ascii=False, default=str)[:30000]
        database.record_tool_execution(project_id, model_id, name, arguments, output, True)
        return output
    except Exception as exc:
        error = str(exc)[:1000]
        database.record_tool_execution(project_id, model_id, name, arguments, None, False, error)
        return json.dumps({"error": error})
