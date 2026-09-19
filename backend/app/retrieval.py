"""Choose which parts of a project's context go to the models for one question.

Sending every context item with every message is wasteful, and cutting each item
to its first N characters loses the parts that matter in a long document. So
items are split into sections, the sections are ranked against the question
(BM25 keyword scoring, no embeddings and no extra API calls), and only the best
ones are sent, within a fixed budget. A short project-brief baseline is always
included so general questions still have grounding.
"""
import math
import re
from collections import OrderedDict
from typing import Any, Optional

CONTEXT_BUDGET = 40_000  # characters sent per question (about 10,000 tokens)
BASELINE_CHARS = 1_500  # opening of each "Project Brief" item, always included
BASELINE_ITEMS = 2
MAX_CHUNKS_PER_ITEM = 8
CHUNK_TARGET = 1_200
CHUNK_HARD = 1_800
CHARS_PER_TOKEN = 4  # rough estimate, good enough for a savings figure

_STOP = set(
    "the and for are was were with that this from have has had not but you your our can will would could should what when "
    "where which who how why about into onto over under than then them they their there here also just more most some any "
    "all its it's i'm does did doing done been being out off too very use used using make made get got".split()
)

_CHUNK_CACHE: "OrderedDict[tuple[str, str], list[dict[str, Any]]]" = OrderedDict()
_CACHE_MAX = 600


def tokens_for(chars: int) -> int:
    return max(0, round(chars / CHARS_PER_TOKEN))


def _words(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9][a-z0-9_.+#-]{1,}", text.lower()) if w not in _STOP and len(w) >= 3]


_HEADING = re.compile(r"^(#{1,4})\s+(.*)$")
_PAGE = re.compile(r"^\[Page (\d+)\]$")


def chunk_text(content: str) -> list[dict[str, Any]]:
    """Split text into sections of roughly CHUNK_TARGET characters along
    headings, page markers and paragraph breaks. Each chunk keeps a label
    (its nearest heading or page) so answers can point at where it came from."""
    paragraphs: list[tuple[str, str]] = []  # (label, text)
    label = ""
    buf: list[str] = []

    def flush() -> None:
        if buf:
            paragraphs.append((label, "\n".join(buf).strip()))
            buf.clear()

    for raw in content.replace("\r\n", "\n").split("\n"):
        line = raw.rstrip()
        h = _HEADING.match(line.strip())
        pg = _PAGE.match(line.strip())
        if h:
            flush()
            label = h.group(2).strip()[:80]
            buf.append(line)
        elif pg:
            flush()
            label = f"Page {pg.group(1)}"
            buf.append(line)
        elif not line.strip():
            flush()
        else:
            buf.append(line)
    flush()

    # split any paragraph that is too long on its own (e.g. a table or a wall of text)
    pieces: list[tuple[str, str]] = []
    for lab, text in paragraphs:
        while len(text) > CHUNK_HARD:
            cut = text.rfind("\n", 0, CHUNK_HARD)
            if cut < CHUNK_HARD // 2:
                cut = text.rfind(". ", 0, CHUNK_HARD)
            if cut < CHUNK_HARD // 2:
                cut = CHUNK_HARD
            pieces.append((lab, text[:cut].strip()))
            text = text[cut:].lstrip(" .\n")
        if text:
            pieces.append((lab, text))

    chunks: list[dict[str, Any]] = []
    cur_label: str = ""
    cur: list[str] = []
    size = 0
    for lab, text in pieces:
        if cur and size + len(text) > CHUNK_TARGET:
            chunks.append({"label": cur_label, "text": "\n\n".join(cur)})
            cur, size = [], 0
        if not cur:
            cur_label = lab
        cur.append(text)
        size += len(text) + 2
    if cur:
        chunks.append({"label": cur_label, "text": "\n\n".join(cur)})
    for i, c in enumerate(chunks):
        c["index"] = i
    return chunks


def _chunks_for(item: dict[str, Any]) -> list[dict[str, Any]]:
    key = (item["id"], str(item.get("updated_at") or item.get("created_at")))
    hit = _CHUNK_CACHE.get(key)
    if hit is not None:
        _CHUNK_CACHE.move_to_end(key)
        return hit
    chunks = chunk_text(item["content"])
    _CHUNK_CACHE[key] = chunks
    while len(_CHUNK_CACHE) > _CACHE_MAX:
        _CHUNK_CACHE.popitem(last=False)
    return chunks


def select_context(
    items: list[dict[str, Any]],
    query: str,
    folder_of: Any,
    budget: int = CONTEXT_BUDGET,
) -> tuple[str, list[dict[str, Any]], dict[str, int]]:
    """items: context rows (id, title, type, content, updated_at...). `folder_of(item)`
    returns an item's folder name. Returns (text for the models, items used,
    stats about what was sent versus what sending everything would have cost)."""
    full_chars = sum(len(i["content"]) for i in items)
    per_item: dict[str, list[dict[str, Any]]] = {i["id"]: _chunks_for(i) for i in items}
    by_id = {i["id"]: i for i in items}

    # ---- rank every section of every item against the question (BM25)
    docs: list[tuple[str, int, list[str]]] = []  # (item id, chunk index, tokens)
    for i in items:
        title_tokens = _words(i["title"]) * 2  # a title match counts extra
        for c in per_item[i["id"]]:
            docs.append((i["id"], c["index"], title_tokens + _words(c["label"]) + _words(c["text"])))
    q_terms = list(dict.fromkeys(_words(query)))
    scored: list[tuple[float, str, int]] = []
    if docs and q_terms:
        n = len(docs)
        avg = sum(len(t) for _, _, t in docs) / n or 1
        df = {t: sum(1 for _, _, toks in docs if t in toks) for t in q_terms}
        k1, b = 1.5, 0.75
        for item_id, idx, toks in docs:
            if not toks:
                continue
            counts: dict[str, int] = {}
            for t in toks:
                counts[t] = counts.get(t, 0) + 1
            score = 0.0
            for t in q_terms:
                tf = counts.get(t, 0)
                if not tf:
                    continue
                idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
                score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * len(toks) / avg))
            if score > 0:
                scored.append((score, item_id, idx))
    scored.sort(key=lambda s: -s[0])

    chosen: dict[str, dict[int, float]] = {}
    used_chars = 0

    def take(item_id: str, idx: int, score: float) -> bool:
        nonlocal used_chars
        size = len(per_item[item_id][idx]["text"])
        if idx in chosen.get(item_id, {}) or used_chars + size > budget:
            return False
        if len(chosen.get(item_id, {})) >= MAX_CHUNKS_PER_ITEM:
            return False
        chosen.setdefault(item_id, {})[idx] = score
        used_chars += size
        return True

    # ---- baseline: the opening of the project's brief, so vague questions still have grounding
    baseline: dict[str, str] = {}
    brief = [i for i in items if folder_of(i) == "Project Brief"][:BASELINE_ITEMS]
    for i in brief:
        head = i["content"][:BASELINE_CHARS]
        if head and used_chars + len(head) <= budget:
            baseline[i["id"]] = head
            used_chars += len(head)

    for score, item_id, idx in scored:
        if item_id in baseline and idx == 0:
            continue  # already covered by the baseline opening
        take(item_id, idx, score)

    # ---- assemble the text, best-matching items first
    def item_rank(item_id: str) -> float:
        return max(chosen.get(item_id, {}).values(), default=0.0)

    ordered_ids = sorted(set(chosen) | set(baseline), key=lambda k: (-item_rank(k), by_id[k]["title"].lower()))
    parts: list[str] = []
    used: list[dict[str, Any]] = []
    sent_chars = 0
    for item_id in ordered_ids:
        item = by_id[item_id]
        chunks = per_item[item_id]
        picked = sorted(chosen.get(item_id, {}))
        body_parts: list[str] = []
        labels: list[str] = []
        if item_id in baseline:
            body_parts.append(baseline[item_id])
            labels.append("Opening")
        last = -2
        for idx in picked:
            text = chunks[idx]["text"]
            if body_parts and idx != last + 1:
                body_parts.append("[...]")
            body_parts.append(text)
            if chunks[idx]["label"]:
                labels.append(chunks[idx]["label"])
            last = idx
        body = "\n\n".join(body_parts)
        whole = len(body) >= len(item["content"]) - 5 or (len(picked) == len(chunks) and not baseline.get(item_id))
        parts.append(f"[{item['title']}]\n{body}")
        sent_chars += len(body)
        used.append(
            {
                "id": item_id,
                "title": item["title"],
                "type": item["type"],
                "chars": len(body),
                "truncated": not whole,
                "parts": len(picked) + (1 if item_id in baseline else 0),
                "total_parts": len(chunks),
                "total_chars": len(item["content"]),
                "sections": list(dict.fromkeys(labels))[:6],
            }
        )

    stats = {
        "sent_chars": sent_chars,
        "full_chars": full_chars,
        "sent_tokens": tokens_for(sent_chars),
        "full_tokens": tokens_for(full_chars),
        "saved_tokens": max(0, tokens_for(full_chars) - tokens_for(sent_chars)),
        "items_total": len(items),
        "items_used": len(used),
    }
    return "\n\n".join(parts), used, stats


def query_from_messages(messages: list[Any], keep: int = 2) -> Optional[str]:
    """The text used to pick sections: the latest user question plus the one
    before it, so a follow-up like "and pricing?" still finds the right document."""
    users = [m.content for m in messages if getattr(m, "role", None) == "user"]
    return "\n".join(users[-keep:]) if users else None
