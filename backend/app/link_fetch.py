"""Fetch a web page and reduce it to readable text for use as project context."""
import html
import re
from urllib.parse import urlparse

import httpx

MAX_BYTES = 600_000
MAX_CHARS = 30_000


class LinkError(Exception):
    pass


def fetch_link(url: str) -> tuple[str, str]:
    """Returns (title, text). Only http(s) URLs; short timeout; size-capped."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise LinkError("Enter a full http(s) link, for example https://example.com/page")
    try:
        with httpx.stream("GET", url.strip(), follow_redirects=True, timeout=8.0, headers={"User-Agent": "IntelligenceLayer/0.1"}) as r:
            if r.status_code >= 400:
                raise LinkError(f"The site answered with an error ({r.status_code}).")
            ctype = r.headers.get("content-type", "")
            if "html" not in ctype and "text" not in ctype and "json" not in ctype:
                raise LinkError("That link is not a web page or text file.")
            raw = b""
            for chunk in r.iter_bytes():
                raw += chunk
                if len(raw) >= MAX_BYTES:
                    break
            encoding = r.encoding or "utf-8"
    except LinkError:
        raise
    except httpx.HTTPError as exc:
        raise LinkError(f"Could not reach that link ({exc.__class__.__name__}).") from exc

    body = raw.decode(encoding, errors="replace")
    title_match = re.search(r"<title[^>]*>(.*?)</title>", body, re.S | re.I)
    title = html.unescape(re.sub(r"\s+", " ", title_match.group(1))).strip() if title_match else ""
    text = re.sub(r"(?is)<(script|style|noscript|svg|head)[^>]*>.*?</\1>", " ", body)
    text = re.sub(r"(?s)<br\s*/?>|</p>|</div>|</li>|</h[1-6]>", "\n", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    return title or parsed.netloc, text[:MAX_CHARS]
