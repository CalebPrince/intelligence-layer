"""Classification and summaries for project context items (no database access)."""
import re
from typing import Any, Optional

CODE_EXT = {
    "py", "js", "jsx", "ts", "tsx", "mjs", "cjs", "php", "html", "htm", "css", "scss", "sass", "less", "sh", "ps1",
    "bat", "java", "go", "rs", "c", "h", "cpp", "cs", "rb", "sql", "vue", "svelte", "yml", "yaml", "toml", "ini",
    "json", "xml", "csv", "env", "gradle", "kt", "swift", "dart", "lua", "r",
}
IMAGE_EXT = {"png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"}


def kind_of(type_: str, title: str) -> str:
    """link | note | code | image | file (conversations are a separate, virtual kind)."""
    if type_ == "url":
        return "link"
    if type_ == "note":
        return "note"
    ext = title.rsplit(".", 1)[-1].lower() if "." in title else ""
    if ext in IMAGE_EXT:
        return "image"
    if ext in CODE_EXT:
        return "code"
    return "file"


def auto_folder(title: str, type_: str) -> str:
    """Folder used when an item has none of its own (imports, uploads, links)."""
    t = title.lower()
    if type_ == "url":
        return "Research"
    if any(k in t for k in ("readme", "project.json", "brief", "overview")):
        return "Project Brief"
    if any(k in t for k in ("requirement", "spec", "prd", "user stor")):
        return "Requirements"
    if any(k in t for k in ("design", "brand", "style guide", "logo", "wireframe")):
        return "Design & Brand"
    if any(k in t for k in ("research", "competitor", "feedback", "meeting", "interview", "survey")):
        return "Research"
    if any(k in t for k in ("content", "copy", "blog", "script", "caption")):
        return "Content"
    if (
        t in ("package.json", "composer.json", "app.json", "manifest.json", "agents.md", "claude.md")
        or any(k in t for k in ("architecture", "api", "schema", "technical", "integration"))
        or kind_of(type_, title) == "code"
    ):
        return "Development"
    if type_ == "note":
        return "Notes"
    return "Unfiled"


def snippet(text: Optional[str], limit: int = 150) -> str:
    flat = " ".join((text or "").replace("#", " ").replace("*", " ").replace("`", " ").split())
    return flat if len(flat) <= limit else flat[:limit].rsplit(" ", 1)[0] + "..."


def summarize(content: str) -> dict[str, Any]:
    """A plain, honest summary built from the text itself: overview (the first
    real paragraph), the heading outline and simple counts. No model call."""
    lines = [l.rstrip() for l in (content or "").splitlines()]
    outline = [re.sub(r"^#+\s*", "", l).strip() for l in lines if re.match(r"^#{1,3}\s+\S", l)][:10]
    overview = ""
    for l in lines:
        s = l.strip().lstrip(">").strip()
        if not s or s.startswith(("#", "```", "|", "- ", "* ", "[!", "<", "{", "[")) or len(s) < 25:
            continue
        overview = snippet(s, 320)
        break
    words = len(re.findall(r"\w+", content or ""))
    checks = re.findall(r"^\s*[-*]\s+\[( |x|X)\]", content or "", flags=re.M)
    return {
        "overview": overview,
        "outline": outline,
        "words": words,
        "minutes": max(1, round(words / 220)) if words else 0,
        "tasks_done": sum(1 for c in checks if c.strip()),
        "tasks_total": len(checks),
    }


def keywords(text: str, limit: int = 60) -> set[str]:
    stop = {"about", "would", "there", "their", "which", "these", "those", "should", "could", "where", "while", "other"}
    words = [w for w in re.findall(r"[a-z0-9]{5,}", (text or "").lower()) if w not in stop]
    seen: dict[str, int] = {}
    for w in words:
        seen[w] = seen.get(w, 0) + 1
    return {w for w, _ in sorted(seen.items(), key=lambda kv: -kv[1])[:limit]}
